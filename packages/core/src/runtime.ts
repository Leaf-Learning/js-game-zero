import { Actor, type ActorOptions } from "./actor";
import { Animation, animate, withAnimationClock } from "./animation";
import {
  assetUrl,
  createAssetLoaders,
  setActiveAssetLoaders,
  validateAssetName,
  type AssetLoaders,
} from "./assets";
import { Clock, setActiveClock } from "./clock";
import {
  createInputDispatcher,
  getHook,
  getParameterNames,
  HOOK_ALIASES,
  type Hook,
  type InputHooks,
} from "./events";
import { Rect, ZRect } from "./geometry";
import {
  KeyboardState,
  keymods,
  keys,
  mouse,
  setActiveKeyboard,
} from "./input";
import {
  AudioUnlockState,
  createMusicPlayer,
  setActiveMusicPlayer,
} from "./audio";
import { Screen, setScreen } from "./rendering";
import {
  attachAutosave,
  primeStorage,
  type Autosave,
} from "./runtime-persistence";
import {
  createLocalStorageAdapter,
  createStorage,
  setActiveStorage,
  Storage,
  type StorageAdapter,
} from "./storage";
import { createToneGenerator } from "./tone";
import {
  createDiagnosticEmitter,
  describeRuntimeError as describeError,
  diagnoseGameModule,
  isValidRuntimeDimension as validDimension,
  RUNTIME_MODULE_OPTION_NAMES as moduleOptionNames,
} from "./runtime-diagnostics";
import { executeZeroBoilerplateSource } from "./runtime-source";
import type {
  DefinedGameModule,
  GameHandleState,
  GameKeyEvent,
  GameModule,
  GameMouseEvent,
  PreloadedAssets,
  RunOptions,
  RuntimeCanvas,
  RuntimeDiagnostic,
  RuntimeFailure,
  RuntimeFailurePhase,
  RuntimeMode,
  RuntimeScheduler,
} from "./runtime-contracts";

export type {
  DefinedGameModule,
  GameHandleState,
  GameKeyEvent,
  GameModule,
  GameMouseEvent,
  PreloadedAssets,
  RunOptions,
  RuntimeCanvas,
  RuntimeDiagnostic,
  RuntimeFailure,
  RuntimeFailurePhase,
  RuntimeMode,
  RuntimeScheduler,
} from "./runtime-contracts";
export { collectRuntimeDiagnostics } from "./runtime-diagnostics";

export type GameContext = {
  readonly Actor: typeof Actor;
  readonly Animation: typeof Animation;
  readonly Rect: typeof Rect;
  readonly ZRect: typeof ZRect;
  readonly Screen: typeof Screen;
  readonly Storage: typeof Storage;
  readonly screen: Screen;
  readonly clock: Clock;
  readonly keyboard: KeyboardState;
  readonly keymods: typeof keymods;
  readonly keys: typeof keys;
  readonly mouse: typeof mouse;
  readonly images: AssetLoaders["images"];
  readonly sounds: AssetLoaders["sounds"];
  readonly music: ReturnType<typeof createMusicPlayer>;
  readonly fonts: AssetLoaders["fonts"];
  readonly storage: Storage;
  readonly tone: ReturnType<typeof createToneGenerator>;
  readonly animate: typeof animate;
  readonly exit: typeof exit;
};

const definedGameBrand: unique symbol = Symbol("js-game-zero.defined-game");

export type DefinedGame = {
  readonly [definedGameBrand]: true;
  readonly create: (context: GameContext) => DefinedGameModule;
};

export function defineGame(
  factory: (context: GameContext) => DefinedGameModule,
): DefinedGame {
  if (typeof factory !== "function") {
    throw new TypeError("defineGame requires a game factory function.");
  }
  return { [definedGameBrand]: true, create: factory };
}

export type GameHandle = {
  readonly mode: RuntimeMode;
  readonly canvas: RuntimeCanvas;
  readonly screen: Screen;
  readonly clock: Clock;
  readonly keyboard: KeyboardState;
  readonly loaders: AssetLoaders;
  readonly storage: Storage;
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly module: GameModule;
  readonly state: GameHandleState;
  readonly failure: RuntimeFailure | null;
  /**
   * Resolves once the "preload gate" is satisfied: storage has been
   * loaded and every asset requested while the game module was
   * evaluated (Actor constructions, `images.x` touches, etc.) has
   * settled. The runtime itself already holds frames until this is
   * true; this is exposed for tests and host integrations that want to
   * await readiness explicitly instead of polling `step()`.
   */
  readonly ready: Promise<void>;
  readonly done: Promise<void>;
  pause(): void;
  resume(): void;
  step(dt: number): void;
  stop(): void;
  dispose(): Promise<void>;
  restart(source?: GameModule | string | DefinedGame): Promise<GameHandle>;
  /** @deprecated Prefer restart(), which awaits cleanup before starting again. */
  reload(source?: GameModule | string | DefinedGame): GameHandle;
};

const activeHandles: GameHandle[] = [];

export function run(
  moduleOrSource: GameModule | string | DefinedGame,
  options: RunOptions = {},
): GameHandle {
  const diagnostics: RuntimeDiagnostic[] = [];
  const emit = createDiagnosticEmitter(diagnostics, options.diagnostics);
  const mode: RuntimeMode =
    typeof moduleOrSource === "string" ? "global" : "import";

  let module!: GameModule;
  let context!: RuntimeContext;
  let game!: GameModule;
  try {
    if (mode === "global") {
      context = createRuntimeContext(options, diagnostics, emit, undefined);
      module = withRuntimeContext(context, () =>
        executeZeroBoilerplateSource(
          String(moduleOrSource),
          context,
          run,
          emit,
        ),
      );
    } else if (isDefinedGame(moduleOrSource)) {
      context = createRuntimeContext(options, diagnostics, emit, undefined);
      module = withRuntimeContext(context, () =>
        adaptDefinedGame(moduleOrSource.create(createGameContext(context))),
      );
    } else {
      module = moduleOrSource as GameModule;
      context = createRuntimeContext(options, diagnostics, emit, module);
    }

    diagnoseGameModule(module, options, emit, mode);
    game = mergeModuleOptions(module, options);
    requireDrawArity(game.draw);
    applyCanvasConfiguration(context.canvas, game, emit);
    configureDocumentTitle(game);
    applyFavicon(context, game.ICON, emit);
  } catch (error) {
    emit({
      code: "runtime-error",
      severity: "error",
      phase: "startup",
      recoverable: false,
      message: `startup failed: ${describeError(error)}`,
    });
    cleanupFailedStartup(context, emit);
    throw error;
  }

  let stopped = false;
  let paused = false;
  let frameHandle: unknown = null;
  let lastTimestamp: number | null = null;
  let state: GameHandleState = "starting";
  let failure: RuntimeFailure | null = null;
  let detachInput = (): void => {};
  let cleanupPromise: Promise<void> | null = null;
  let resolveDone = (): void => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  let handle: GameHandle;

  const removeActiveHandle = (): void => {
    const index = activeHandles.indexOf(handle);
    if (index >= 0) activeHandles.splice(index, 1);
    setScreen(activeHandles.at(-1)?.screen ?? null);
  };

  const dispose = (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise;
    stopped = true;
    paused = false;
    if (state !== "failed") state = "stopped";
    detachInput();
    context.scheduler.cancelAnimationFrame(frameHandle);
    context.keyboard.clear();
    context.clock.clear();
    context.music.stop();
    context.stop = null;
    context.autosave.detach();
    removeActiveHandle();
    if (context.ownsCanvas) context.canvas.remove?.();
    cleanupPromise = Promise.resolve(context.autosave.flush())
      .catch((error: unknown) => {
        emit({
          code: "runtime-error",
          severity: "warning",
          phase: "storage",
          recoverable: true,
          message: `Failed to flush storage while stopping: ${describeError(error)}`,
        });
      })
      .then(() => {
        resolveDone();
      });
    return cleanupPromise;
  };

  const failRuntime = (phase: RuntimeFailurePhase, error: unknown): void => {
    if (state === "failed" || state === "stopped") return;
    failure = { phase, message: describeError(error), cause: error };
    state = "failed";
    emit({
      code: "runtime-error",
      severity: "error",
      phase,
      recoverable: false,
      message: `${phase} failed: ${describeError(error)}`,
    });
    void dispose();
  };

  const hooks: InputHooks = game;
  const dispatcher = createInputDispatcher(hooks, context.keyboard);
  detachInput = attachDispatcher(
    dispatcher,
    context,
    context.canvas,
    options,
    (error) => failRuntime("input", error),
  );
  const musicEndHook = getHook(hooks, "on_music_end") as
    (() => void) | undefined;
  context.music.set_on_music_end(
    musicEndHook
      ? () => {
          try {
            withRuntimeContext(context, () => musicEndHook());
          } catch (error) {
            failRuntime("audio", error);
          }
        }
      : undefined,
  );

  const ready = waitForPreloadGate(context)
    .then(() => {
      if (state === "starting") state = "running";
    })
    .catch((error: unknown) => {
      failRuntime("startup", error);
      throw error;
    });

  handle = {
    mode,
    canvas: context.canvas,
    screen: context.screen,
    clock: context.clock,
    keyboard: context.keyboard,
    loaders: context.loaders,
    storage: context.storage,
    diagnostics,
    module: game,
    get state() {
      return state;
    },
    get failure() {
      return failure;
    },
    ready,
    done,
    pause() {
      if (stopped || state === "failed") return;
      paused = true;
      state = "paused";
    },
    resume() {
      if (stopped) return;
      paused = false;
      state = "running";
    },
    step(dt: number) {
      if (stopped || paused) return;
      if (isRuntimeGated(context)) {
        if (state !== "starting") monitorLateAssetGate(context, failRuntime);
        return;
      }
      runFrame(game, context, dt, failRuntime);
    },
    stop() {
      void dispose();
    },
    dispose,
    async restart(nextSource = moduleOrSource) {
      await dispose();
      return run(nextSource, options);
    },
    reload(nextSource = moduleOrSource) {
      handle.stop();
      return run(nextSource, options);
    },
  };

  context.stop = () => handle.stop();
  activeHandles.push(handle);
  setScreen(context.screen);

  if (options.autostart !== false) {
    const frame = (timestamp: number) => {
      if (stopped) return;
      const previous = lastTimestamp ?? timestamp;
      lastTimestamp = timestamp;
      if (!paused) {
        if (isRuntimeGated(context)) {
          if (state !== "starting") monitorLateAssetGate(context, failRuntime);
        } else {
          const dt = Math.min(0.25, Math.max(0, (timestamp - previous) / 1000));
          runFrame(game, context, dt, failRuntime);
        }
      }
      if (!stopped) {
        frameHandle = context.scheduler.requestAnimationFrame(frame);
      }
    };
    frameHandle = context.scheduler.requestAnimationFrame(frame);
  }

  return handle;
}

export function exit(): void {
  activeHandles.at(-1)?.stop();
}

type RuntimeContext = {
  readonly canvas: RuntimeCanvas;
  readonly ownsCanvas: boolean;
  readonly screen: Screen;
  readonly clock: Clock;
  readonly clockFailure: { current: unknown | null };
  readonly keyboard: KeyboardState;
  readonly loaders: AssetLoaders;
  readonly music: ReturnType<typeof createMusicPlayer>;
  readonly storage: Storage;
  readonly scheduler: RuntimeScheduler;
  /** Mutable flag flipped once the storage preload has settled. */
  readonly storageReadyState: { current: boolean };
  /** Resolves once the storage preload has settled (success or handled failure). */
  readonly storageReady: Promise<void>;
  readonly autosave: Autosave;
  readonly tone: ReturnType<typeof createToneGenerator>;
  stop: (() => void) | null;
  /** The one active late image/font completion boundary, if any. */
  assetGate: Promise<void> | null;
};

function createRuntimeContext(
  options: RunOptions,
  diagnostics: RuntimeDiagnostic[],
  emit: (diagnostic: RuntimeDiagnostic) => void,
  module: GameModule | undefined,
): RuntimeContext {
  const ownsCanvas = options.canvas === undefined;
  const canvas = options.canvas ?? createCanvas(options.container);
  try {
    const scheduler = options.scheduler ?? createDefaultScheduler();
    const defaultLoaders = createAssetLoaders({
      projectId: options.projectId ?? "default",
      assetBaseUrl: options.assetBaseUrl ?? "/assets",
    });
    const loaders: AssetLoaders = {
      images: options.loaders?.images ?? defaultLoaders.images,
      sounds: options.loaders?.sounds ?? defaultLoaders.sounds,
      music: options.loaders?.music ?? defaultLoaders.music,
      fonts: options.loaders?.fonts ?? defaultLoaders.fonts,
    };
    const screen = new Screen(canvas, canvas.getContext("2d"), {
      imageLoader: loaders.images,
    });
    definePreloadedAssets(loaders, options.preloadedAssets);
    preloadAssets(loaders, options.preload, emit);
    const keyboard = new KeyboardState();
    const clockFailure = { current: null as unknown | null };
    const clock = new Clock({
      onError(error) {
        clockFailure.current ??= error;
      },
    });
    const storage = resolveStorage(options);
    const { state: storageReadyState, promise: storageReady } = primeStorage(
      storage,
      emit,
    );
    // Attached before any top-level game code runs (in particular before
    // executeZeroBoilerplateSource evaluates the zero-boilerplate script),
    // so a top-level mutation like `storage.score = 5` is captured by the
    // auto-save listener from the very first tick, not just mutations made
    // later inside update()/draw().
    const autosave = attachAutosave(storage, emit);
    const onMusicEnd = module
      ? (getHook(module, "on_music_end") as (() => void) | undefined)
      : undefined;
    const music = createMusicPlayer({
      loader: loaders.music,
      ...(onMusicEnd ? { onMusicEnd } : {}),
      onError(error) {
        emit({
          code: "runtime-error",
          severity: "warning",
          phase: "audio",
          recoverable: true,
          message: `Music playback failed: ${describeError(error)}`,
        });
      },
    });
    const scopedTone = createToneGenerator({
      unlockState: new AudioUnlockState(),
    });
    return {
      canvas,
      ownsCanvas,
      screen,
      clock,
      clockFailure,
      keyboard,
      loaders,
      music,
      tone: scopedTone,
      storage,
      scheduler,
      storageReadyState,
      storageReady,
      autosave,
      assetGate: null,
      stop: null,
    };
  } catch (error) {
    if (ownsCanvas) canvas.remove?.();
    throw error;
  }
}

function cleanupFailedStartup(
  context: RuntimeContext | undefined,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  if (!context) return;
  context.autosave.detach();
  context.keyboard.clear();
  context.clock.clear();
  context.music.stop();
  if (context.ownsCanvas) context.canvas.remove?.();
  setScreen(activeHandles.at(-1)?.screen ?? null);
  void context.autosave.flush().catch((flushError: unknown) => {
    emit({
      code: "runtime-error",
      severity: "warning",
      phase: "storage",
      recoverable: true,
      message: `Failed to flush storage after startup failure: ${describeError(flushError)}`,
    });
  });
}

function isDefinedGame(value: unknown): value is DefinedGame {
  return (
    typeof value === "object" &&
    value !== null &&
    definedGameBrand in value &&
    (value as DefinedGame)[definedGameBrand] === true &&
    typeof (value as DefinedGame).create === "function"
  );
}

function createGameContext(context: RuntimeContext): GameContext {
  class ScopedActor extends Actor {
    constructor(
      image: string,
      pos?: ConstructorParameters<typeof Actor>[1],
      options: ActorOptions = {},
    ) {
      super(image, pos as never, {
        ...options,
        screen: context.screen,
        loader: context.loaders.images,
      });
    }
  }

  const scopedAnimate: typeof animate = (object, options) =>
    withAnimationClock(context.clock, () => animate(object, options));

  return {
    Actor: ScopedActor,
    Animation,
    Rect,
    ZRect,
    Screen,
    Storage,
    screen: context.screen,
    clock: context.clock,
    keyboard: context.keyboard,
    keymods,
    keys,
    mouse,
    images: context.loaders.images,
    sounds: context.loaders.sounds,
    music: context.music,
    fonts: context.loaders.fonts,
    storage: context.storage,
    tone: context.tone,
    animate: scopedAnimate,
    exit: () => context.stop?.(),
  };
}

function adaptDefinedGame(module: DefinedGameModule): GameModule {
  const adapted: GameModule = {
    ...(module.WIDTH === undefined ? {} : { WIDTH: module.WIDTH }),
    ...(module.HEIGHT === undefined ? {} : { HEIGHT: module.HEIGHT }),
    ...(module.TITLE === undefined ? {} : { TITLE: module.TITLE }),
    ...(module.ICON === undefined ? {} : { ICON: module.ICON }),
    ...(module.draw ? { draw: module.draw } : {}),
    ...(module.update ? { update: module.update as Hook } : {}),
  };
  const writable = adapted as Record<string, unknown>;
  for (const [, camelName] of HOOK_ALIASES) {
    const callback = module[camelName];
    if (!callback) continue;
    if (camelName === "onMusicEnd") {
      writable[camelName] = callback;
      continue;
    }
    const eventCallback = callback as unknown as (
      event: GameKeyEvent | GameMouseEvent,
    ) => void;
    writable[camelName] = (event: unknown): void => {
      eventCallback(event as GameKeyEvent | GameMouseEvent);
    };
  }
  return adapted;
}

function mergeModuleOptions(
  module: GameModule,
  options: RunOptions,
): GameModule {
  const merged: Record<string, unknown> = { ...module };
  for (const key of moduleOptionNames) {
    if (options[key] !== undefined) {
      merged[key] = options[key];
    }
  }
  return merged as GameModule;
}

function runFrame(
  module: GameModule,
  context: RuntimeContext,
  dt: number,
  onFailure: (phase: RuntimeFailurePhase, error: unknown) => void,
): void {
  try {
    withRuntimeContext(context, () => {
      try {
        context.clock.tick(dt);
      } catch (error) {
        onFailure("clock", error);
        return;
      }
      if (context.clockFailure.current !== null) {
        const error = context.clockFailure.current;
        context.clockFailure.current = null;
        onFailure("clock", error);
        return;
      }
      if (module.update) {
        try {
          const parameters = getParameterNames(module.update);
          if (parameters.length === 0) module.update();
          else module.update(dt);
        } catch (error) {
          onFailure("update", error);
          return;
        }
      }
      // A late render asset request may have just started a new load. Hold
      // drawing until it settles, but never freeze gameplay for audio loads.
      if (isRuntimeGated(context)) {
        monitorLateAssetGate(context, onFailure);
        return;
      }
      try {
        module.draw?.();
      } catch (error) {
        onFailure("draw", error);
      }
    });
  } catch (error) {
    onFailure("draw", error);
  }
}

/**
 * True while the runtime should hold frames: storage hasn't finished its
 * initial load, or a render-critical image/font owned by this run has an
 * in-flight load. Audio loading never freezes gameplay, and package-level
 * singleton activity cannot stall an unrelated handle.
 */
function isRuntimeGated(context: RuntimeContext): boolean {
  if (!context.storageReadyState.current) return true;
  return (
    context.loaders.images.pendingCount() +
      context.loaders.fonts.pendingCount() >
    0
  );
}

/**
 * One-shot promise resolving once this run's preload gate is satisfied.
 * Loads triggered while waiting (chained loads) are also awaited via each
 * context-owned loader's `waitForIdle()`.
 */
function waitForPreloadGate(context: RuntimeContext): Promise<void> {
  return Promise.all([
    context.storageReady,
    context.loaders.images.waitForIdle(),
    context.loaders.fonts.waitForIdle(),
  ]).then(() => undefined);
}

function monitorLateAssetGate(
  context: RuntimeContext,
  onFailure: (phase: RuntimeFailurePhase, error: unknown) => void,
): void {
  if (context.assetGate) return;
  const gate = Promise.all([
    context.loaders.images.waitForIdle(),
    context.loaders.fonts.waitForIdle(),
  ]).then(() => undefined);
  context.assetGate = gate;
  void gate
    .catch((error: unknown) => onFailure("asset", error))
    .finally(() => {
      if (context.assetGate === gate) context.assetGate = null;
    });
}

function requireDrawArity(hook: Hook | undefined): void {
  if (!hook) return;
  if (getParameterNames(hook).length > 0) {
    throw new TypeError("draw() must not take any arguments.");
  }
}

function applyFavicon(
  context: RuntimeContext,
  icon: string | null | undefined,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  if (!icon || typeof document === "undefined") return;
  try {
    validateAssetName("image", icon, context.loaders.images.extensions);
  } catch (error) {
    emit({
      code: "invalid-config",
      severity: "warning",
      name: "ICON",
      message: `ICON is not a usable image asset name: ${describeError(error)}`,
    });
    return;
  }
  const href = assetUrl(
    context.loaders.images.assetBaseUrl,
    context.loaders.images.projectId,
    context.loaders.images.directory,
    icon,
  );
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head?.append(link);
  }
  link.href = href;
}

function applyCanvasConfiguration(
  canvas: RuntimeCanvas,
  module: GameModule,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  canvas.width = readDimension(module.WIDTH, 800, "WIDTH", emit);
  canvas.height = readDimension(module.HEIGHT, 600, "HEIGHT", emit);
}

function configureDocumentTitle(module: GameModule): void {
  if (module.TITLE === undefined || typeof document === "undefined") return;
  document.title = String(module.TITLE);
}

function readDimension(
  value: unknown,
  fallback: number,
  name: "WIDTH" | "HEIGHT",
  emit: (diagnostic: RuntimeDiagnostic) => void,
): number {
  if (value === undefined) return fallback;
  if (validDimension(value)) return Math.floor(value);
  emit({
    code: "invalid-config",
    severity: "warning",
    name,
    message: `${name} should be a positive finite number; using ${fallback}.`,
  });
  return fallback;
}

function attachDispatcher(
  dispatcher: ReturnType<typeof createInputDispatcher>,
  context: RuntimeContext,
  canvas: RuntimeCanvas,
  options: RunOptions,
  onFailure: (error: unknown) => void,
): () => void {
  const keyboardTarget =
    options.keyboardTarget ??
    (typeof window === "undefined" ? undefined : window) ??
    canvas;
  if (
    typeof canvas.addEventListener !== "function" ||
    typeof keyboardTarget?.addEventListener !== "function"
  ) {
    return () => {};
  }
  const invoke = (callback: () => void): void => {
    try {
      withRuntimeContext(context, callback);
    } catch (error) {
      onFailure(error);
    }
  };
  const keyDown = (event: Event) =>
    invoke(() => void dispatcher.handleKeyDown(event as KeyboardEvent));
  const keyUp = (event: Event) =>
    invoke(() => void dispatcher.handleKeyUp(event as KeyboardEvent));
  const mouseDown = (event: Event) =>
    invoke(() => void dispatcher.handleMouseDown(event as MouseEvent, canvas));
  const mouseUp = (event: Event) =>
    invoke(() => void dispatcher.handleMouseUp(event as MouseEvent, canvas));
  const mouseMove = (event: Event) =>
    invoke(() => void dispatcher.handleMouseMove(event as MouseEvent, canvas));
  const wheel = (event: Event) =>
    invoke(() => void dispatcher.handleWheel(event as WheelEvent, canvas));
  const clearKeyboard = (): void => context.keyboard.clear();
  const visibilityChange = (): void => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      clearKeyboard();
    }
  };
  const mouseReleaseTarget = keyboardTarget;

  keyboardTarget.addEventListener("keydown", keyDown);
  keyboardTarget.addEventListener("keyup", keyUp);
  keyboardTarget.addEventListener("blur", clearKeyboard);
  canvas.addEventListener("mousedown", mouseDown);
  mouseReleaseTarget.addEventListener("mouseup", mouseUp);
  canvas.addEventListener("mousemove", mouseMove);
  canvas.addEventListener("wheel", wheel, { passive: true });
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", visibilityChange);
  }

  return () => {
    keyboardTarget.removeEventListener("keydown", keyDown);
    keyboardTarget.removeEventListener("keyup", keyUp);
    keyboardTarget.removeEventListener("blur", clearKeyboard);
    canvas.removeEventListener("mousedown", mouseDown);
    mouseReleaseTarget.removeEventListener("mouseup", mouseUp);
    canvas.removeEventListener("mousemove", mouseMove);
    canvas.removeEventListener("wheel", wheel);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", visibilityChange);
    }
  };
}

function withRuntimeContext<T>(context: RuntimeContext, callback: () => T): T {
  const previousAssets = setActiveAssetLoaders(context.loaders);
  const previousKeyboard = setActiveKeyboard(context.keyboard);
  const previousClock = setActiveClock(context.clock);
  const previousMusic = setActiveMusicPlayer(context.music);
  const previousStorage = setActiveStorage(context.storage);
  const previousScreen = setScreen(context.screen);
  try {
    return withAnimationClock(context.clock, callback);
  } finally {
    setScreen(previousScreen);
    setActiveStorage(previousStorage);
    setActiveMusicPlayer(previousMusic);
    setActiveClock(previousClock);
    setActiveKeyboard(previousKeyboard);
    setActiveAssetLoaders(previousAssets);
  }
}

function resolveStorage(options: RunOptions): Storage {
  if (!options.storage) {
    try {
      return createStorage({
        adapter: createLocalStorageAdapter({
          projectId: options.projectId ?? "default",
        }),
      });
    } catch {
      return createStorage();
    }
  }
  if (options.storage instanceof Storage) return options.storage;
  if (
    "load" in options.storage &&
    "save" in options.storage &&
    "path" in options.storage
  ) {
    return createStorage({ adapter: options.storage as StorageAdapter });
  }
  return options.storage as Storage;
}

function preloadAssets(
  loaders: AssetLoaders,
  assets: readonly string[] = [],
  emit?: (diagnostic: RuntimeDiagnostic) => void,
): void {
  for (const asset of assets) {
    const [directory, ...rest] = asset.split("/");
    const name = rest.join("/");
    if (!directory || !name) continue;
    if (directory === "images") void loaders.images.load(name);
    else if (directory === "sounds" || directory === "music") {
      const loader = directory === "sounds" ? loaders.sounds : loaders.music;
      void loader.load(name).catch((error: unknown) => {
        emit?.({
          code: "runtime-error",
          severity: "warning",
          phase: "audio",
          recoverable: true,
          message: `Failed to preload ${directory}/${name}: ${describeError(error)}`,
        });
      });
    } else if (directory === "fonts") void loaders.fonts.load(name);
  }
}

function definePreloadedAssets(
  loaders: AssetLoaders,
  assets: PreloadedAssets | undefined,
): void {
  if (!assets) return;
  for (const [name, asset] of Object.entries(assets.images ?? {})) {
    loaders.images.define(name, asset);
  }
  for (const [name, asset] of Object.entries(assets.sounds ?? {})) {
    loaders.sounds.define(name, asset);
  }
  for (const [name, asset] of Object.entries(assets.music ?? {})) {
    loaders.music.define(name, asset);
  }
  for (const [name, asset] of Object.entries(assets.fonts ?? {})) {
    loaders.fonts.define(name, asset);
  }
}

function createCanvas(container?: HTMLElement): RuntimeCanvas {
  if (typeof document === "undefined") {
    throw new Error("run requires a canvas option outside the browser.");
  }
  const canvas = document.createElement("canvas") as RuntimeCanvas;
  canvas.tabIndex = 0;
  (container ?? document.body).append(canvas);
  return canvas;
}

function createDefaultScheduler(): RuntimeScheduler {
  return {
    requestAnimationFrame(callback) {
      if (typeof requestAnimationFrame === "function") {
        return requestAnimationFrame(callback);
      }
      return setTimeout(() => callback(performance.now()), 16);
    },
    cancelAnimationFrame(handle) {
      if (handle === null || handle === undefined) return;
      if (
        typeof cancelAnimationFrame === "function" &&
        typeof handle === "number"
      ) {
        cancelAnimationFrame(handle);
        return;
      }
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
    now() {
      return performance.now();
    },
  };
}
