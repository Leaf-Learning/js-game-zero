import { Actor, type ActorOptions } from "./actor";
import { Animation, animate } from "./animation";
import {
  createAssetLoaders,
  validateAssetName,
  type AssetLoaders,
} from "./assets";
import { clock as defaultClock, Clock } from "./clock";
import {
  createInputDispatcher,
  getHook,
  getParameterNames,
  type Hook,
  type InputHooks,
} from "./events";
import { Rect, ZRect } from "./geometry";
import {
  keyboard as defaultKeyboard,
  KeyboardState,
  keymods,
  keys,
  mouse,
} from "./input";
import { createBrowserSoundAsset, createMusicPlayer } from "./audio";
import { Screen, setScreen } from "./rendering";
import {
  createLocalStorageAdapter,
  createStorage,
  Storage,
  storage as defaultStorage,
  type StorageAdapter,
} from "./storage";
import { tone } from "./tone";

export type GameModule = InputHooks & {
  readonly WIDTH?: number;
  readonly HEIGHT?: number;
  readonly TITLE?: string;
  readonly ICON?: string | null;
  readonly draw?: Hook;
  readonly update?: Hook;
};

export type RuntimeMode = "global" | "import";

export type RuntimeDiagnostic = {
  readonly code:
    | "asset-name"
    | "constant-typo"
    | "duplicate-config"
    | "duplicate-hook-alias"
    | "hook-arity"
    | "hook-typo"
    | "invalid-config"
    | "runtime-error";
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly name?: string;
  readonly suggestion?: string;
};

export type RuntimeScheduler = {
  requestAnimationFrame(callback: (timestamp: number) => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
  now?(): number;
};

export type RuntimeCanvas = HTMLCanvasElement & {
  getBoundingClientRect?: () => { left: number; top: number };
};

export type RunOptions = Partial<GameModule> & {
  readonly assetBaseUrl?: string;
  readonly autostart?: boolean;
  readonly canvas?: RuntimeCanvas;
  readonly container?: HTMLElement;
  readonly diagnostics?: (diagnostic: RuntimeDiagnostic) => void;
  readonly keyboardTarget?: EventTarget;
  readonly projectId?: string;
  readonly scheduler?: RuntimeScheduler;
  readonly storage?: Storage | StorageAdapter;
};

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
  pause(): void;
  resume(): void;
  step(dt: number): void;
  stop(): void;
  reload(source?: GameModule | string): GameHandle;
};

const configurationNames = ["WIDTH", "HEIGHT", "TITLE", "ICON"] as const;
const snakeHookNames = [
  "draw",
  "update",
  "on_mouse_down",
  "on_mouse_up",
  "on_mouse_move",
  "on_key_down",
  "on_key_up",
  "on_music_end",
] as const;
const camelHookNames = [
  "onMouseDown",
  "onMouseUp",
  "onMouseMove",
  "onKeyDown",
  "onKeyUp",
  "onMusicEnd",
] as const;
const hookNames = [...snakeHookNames, ...camelHookNames] as const;
const moduleOptionNames = [...configurationNames, ...hookNames] as const;
const constantNames = new Set<string>(configurationNames);
const hookNameSet = new Set<string>(hookNames);

const documentedGlobalNames = [
  ...moduleOptionNames,
  "run",
  "exit",
  "Actor",
  "Animation",
  "animate",
  "Rect",
  "ZRect",
  "Screen",
  "screen",
  "clock",
  "Clock",
  "keyboard",
  "KeyboardState",
  "keys",
  "keymods",
  "mouse",
  "images",
  "sounds",
  "music",
  "createBrowserSoundAsset",
  "tone",
  "storage",
  "Storage",
] as const;

const builtinGlobals: Record<string, unknown> = {
  Array,
  Boolean,
  Date,
  Error,
  Infinity,
  JSON,
  Map,
  Math,
  NaN,
  Number,
  Object,
  Promise,
  RangeError,
  RegExp,
  Set,
  String,
  TypeError,
  console,
  parseFloat,
  parseInt,
  undefined,
};

let activeHandle: GameHandle | null = null;

export function run(
  moduleOrSource: GameModule | string,
  options: RunOptions = {},
): GameHandle {
  const diagnostics: RuntimeDiagnostic[] = [];
  const emit = createDiagnosticEmitter(diagnostics, options.diagnostics);
  const mode: RuntimeMode =
    typeof moduleOrSource === "string" ? "global" : "import";

  let module: GameModule;
  let context: RuntimeContext;
  if (mode === "global") {
    context = createRuntimeContext(options, diagnostics, emit, undefined);
    module = executeZeroBoilerplateSource(
      String(moduleOrSource),
      context,
      emit,
    );
    context = finalizeRuntimeContext(context, module, options, emit);
  } else {
    module = moduleOrSource as GameModule;
    context = createRuntimeContext(options, diagnostics, emit, module);
  }

  diagnoseGameModule(module, options, emit, mode);
  const game = mergeModuleOptions(module, options);
  applyCanvasConfiguration(context.canvas, game, emit);
  configureDocumentTitle(game);

  const hooks: InputHooks = game;
  const dispatcher = createInputDispatcher(hooks, context.keyboard);
  const detachInput = attachDispatcher(dispatcher, context.canvas, options);
  context.music.set_on_music_end(
    getHook(hooks, "on_music_end") as (() => void) | undefined,
  );

  let stopped = false;
  let paused = false;
  let frameHandle: unknown = null;
  let lastTimestamp: number | null = null;

  const handle: GameHandle = {
    mode,
    canvas: context.canvas,
    screen: context.screen,
    clock: context.clock,
    keyboard: context.keyboard,
    loaders: context.loaders,
    storage: context.storage,
    diagnostics,
    module: game,
    pause() {
      paused = true;
    },
    resume() {
      if (stopped) return;
      paused = false;
    },
    step(dt: number) {
      if (stopped || paused) return;
      runFrame(game, context, dt);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      detachInput();
      context.scheduler.cancelAnimationFrame(frameHandle);
      context.keyboard.clear();
      if (activeHandle === handle) {
        activeHandle = null;
        setScreen(null);
      }
    },
    reload(nextSource: GameModule | string = moduleOrSource) {
      handle.stop();
      return run(nextSource, options);
    },
  };

  activeHandle = handle;
  setScreen(context.screen);

  if (options.autostart !== false) {
    const frame = (timestamp: number) => {
      if (stopped) return;
      const previous = lastTimestamp ?? timestamp;
      lastTimestamp = timestamp;
      if (!paused) {
        const dt = Math.min(0.25, Math.max(0, (timestamp - previous) / 1000));
        runFrame(game, context, dt);
      }
      frameHandle = context.scheduler.requestAnimationFrame(frame);
    };
    frameHandle = context.scheduler.requestAnimationFrame(frame);
  }

  return handle;
}

export function exit(): void {
  activeHandle?.stop();
}

export function collectRuntimeDiagnostics(
  moduleOrSource: GameModule | string,
  options: RunOptions = {},
): RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = [];
  const emit = createDiagnosticEmitter(diagnostics);
  if (typeof moduleOrSource === "string") {
    diagnoseSource(moduleOrSource, emit);
    return diagnostics;
  }
  diagnoseGameModule(moduleOrSource, options, emit, "import");
  return diagnostics;
}

type RuntimeContext = {
  readonly canvas: RuntimeCanvas;
  readonly screen: Screen;
  readonly clock: Clock;
  readonly keyboard: KeyboardState;
  readonly loaders: AssetLoaders;
  readonly music: ReturnType<typeof createMusicPlayer>;
  readonly storage: Storage;
  readonly scheduler: RuntimeScheduler;
};

function createRuntimeContext(
  options: RunOptions,
  diagnostics: RuntimeDiagnostic[],
  emit: (diagnostic: RuntimeDiagnostic) => void,
  module: GameModule | undefined,
): RuntimeContext {
  const canvas = options.canvas ?? createCanvas();
  const scheduler = options.scheduler ?? createDefaultScheduler();
  const loaders = createAssetLoaders({
    projectId: options.projectId ?? "default",
    assetBaseUrl: options.assetBaseUrl ?? "/assets",
  });
  const screen = new Screen(canvas, canvas.getContext("2d"), {
    imageLoader: loaders.images,
  });
  const keyboard = module ? defaultKeyboard : new KeyboardState();
  const clock = module ? defaultClock : new Clock();
  const storage = resolveStorage(options);
  const onMusicEnd = module
    ? (getHook(module, "on_music_end") as (() => void) | undefined)
    : undefined;
  const music = createMusicPlayer({
    loader: loaders.music,
    ...(onMusicEnd ? { onMusicEnd } : {}),
  });
  setScreen(screen);
  return {
    canvas,
    screen,
    clock,
    keyboard,
    loaders,
    music,
    storage,
    scheduler,
  };
}

function finalizeRuntimeContext(
  context: RuntimeContext,
  module: GameModule,
  _options: RunOptions,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): RuntimeContext {
  applyCanvasConfiguration(context.canvas, module, emit);
  return context;
}

function executeZeroBoilerplateSource(
  source: string,
  context: RuntimeContext,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): GameModule {
  diagnoseSource(source, emit);

  class RuntimeActor extends Actor {
    constructor(
      image: string,
      pos?: ConstructorParameters<typeof Actor>[1],
      options: ActorOptions = {},
    ) {
      super(image, pos as never, {
        screen: context.screen,
        loader: context.loaders.images,
        ...options,
      });
    }
  }

  const globals = {
    Animation,
    animate,
    Clock,
    KeyboardState,
    Rect,
    ZRect,
    Screen,
    Storage,
    Actor: RuntimeActor,
    screen: context.screen,
    clock: context.clock,
    keyboard: context.keyboard,
    keymods,
    keys,
    mouse,
    images: context.loaders.images,
    sounds: context.loaders.sounds,
    music: context.music,
    createBrowserSoundAsset,
    storage: context.storage,
    tone,
    run,
    exit,
  };
  const scopeTarget: Record<string, unknown> = { ...globals };
  const scope = new Proxy(scopeTarget, {
    has(_target, property) {
      return property !== Symbol.unscopables;
    },
    get(target, property) {
      if (property === Symbol.unscopables) return undefined;
      if (typeof property !== "string") return undefined;
      if (property in target) return target[property];
      if (property in builtinGlobals) return builtinGlobals[property];
      return undefined;
    },
    set(target, property, value) {
      if (typeof property === "string") target[property] = value;
      return true;
    },
  });

  try {
    const factory = new Function(
      "scope",
      `return (function() {
        with (scope) {
          ${source}
        }
        return {
          WIDTH: scope.WIDTH,
          HEIGHT: scope.HEIGHT,
          TITLE: scope.TITLE,
          ICON: scope.ICON,
          draw: typeof draw === "function" ? draw : (typeof scope.draw === "function" ? scope.draw : undefined),
          update: typeof update === "function" ? update : (typeof scope.update === "function" ? scope.update : undefined),
          on_mouse_down: typeof on_mouse_down === "function" ? on_mouse_down : (typeof scope.on_mouse_down === "function" ? scope.on_mouse_down : undefined),
          on_mouse_up: typeof on_mouse_up === "function" ? on_mouse_up : (typeof scope.on_mouse_up === "function" ? scope.on_mouse_up : undefined),
          on_mouse_move: typeof on_mouse_move === "function" ? on_mouse_move : (typeof scope.on_mouse_move === "function" ? scope.on_mouse_move : undefined),
          on_key_down: typeof on_key_down === "function" ? on_key_down : (typeof scope.on_key_down === "function" ? scope.on_key_down : undefined),
          on_key_up: typeof on_key_up === "function" ? on_key_up : (typeof scope.on_key_up === "function" ? scope.on_key_up : undefined),
          on_music_end: typeof on_music_end === "function" ? on_music_end : (typeof scope.on_music_end === "function" ? scope.on_music_end : undefined)
        };
      })();`,
    );
    return factory(scope) as GameModule;
  } catch (error) {
    emit({
      code: "runtime-error",
      severity: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
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
): void {
  setScreen(context.screen);
  context.clock.tick(dt);
  if (module.update) {
    const parameters = getParameterNames(module.update);
    if (parameters.length === 0) module.update();
    else module.update(dt);
  }
  module.draw?.();
}

function diagnoseGameModule(
  module: GameModule,
  options: RunOptions,
  emit: (diagnostic: RuntimeDiagnostic) => void,
  mode: RuntimeMode,
): void {
  for (const key of Object.keys(module)) {
    diagnoseIdentifier(key, emit);
  }
  for (const key of moduleOptionNames) {
    if (module[key] !== undefined && options[key] !== undefined) {
      emit({
        code: "duplicate-config",
        severity: "warning",
        name: key,
        message: `${key} appears in both the ${mode} module and run options.`,
      });
    }
  }
  warnDuplicateHookAliases(module, emit);
  warnHookArity("draw", module.draw, 0, emit);
  warnHookArity("update", module.update, 1, emit);
  if (module.WIDTH !== undefined && !validDimension(module.WIDTH)) {
    emit({
      code: "invalid-config",
      severity: "warning",
      name: "WIDTH",
      message: "WIDTH should be a positive finite number.",
    });
  }
  if (module.HEIGHT !== undefined && !validDimension(module.HEIGHT)) {
    emit({
      code: "invalid-config",
      severity: "warning",
      name: "HEIGHT",
      message: "HEIGHT should be a positive finite number.",
    });
  }
}

function diagnoseSource(
  source: string,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  const stripped = stripCommentsAndStrings(source);
  const seen = new Set<string>();
  for (const match of stripped.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    const name = match[0];
    if (seen.has(name)) continue;
    seen.add(name);
    diagnoseIdentifier(name, emit);
  }
  for (const match of source.matchAll(/["'`]([^"'`]+)["'`]/g)) {
    const name = match[1];
    if (name) diagnoseAssetName(name, emit);
  }
}

function diagnoseIdentifier(
  name: string,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  if (constantNames.has(name) || hookNameSet.has(name)) return;
  const constantSuggestion =
    name !== name.toLowerCase()
      ? closestName(name, configurationNames)
      : undefined;
  if (constantSuggestion) {
    emit({
      code: "constant-typo",
      severity: "warning",
      name,
      suggestion: constantSuggestion,
      message: `Did you mean ${constantSuggestion} instead of ${name}?`,
    });
    return;
  }
  const hookSuggestion = closestName(name, hookNames);
  if (hookSuggestion) {
    emit({
      code: "hook-typo",
      severity: "warning",
      name,
      suggestion: hookSuggestion,
      message: `Did you mean ${hookSuggestion} instead of ${name}?`,
    });
  }
}

function diagnoseAssetName(
  name: string,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  const extension = name.split(".").at(-1)?.toLowerCase();
  const kind =
    extension &&
    ["png", "gif", "jpg", "jpeg", "bmp", "webp", "svg"].includes(extension)
      ? "image"
      : extension && ["wav", "ogg", "mp3", "m4a"].includes(extension)
        ? "sound"
        : null;
  if (!kind) return;
  const extensions =
    kind === "image"
      ? ["png", "gif", "jpg", "jpeg", "bmp", "webp", "svg"]
      : ["wav", "ogg", "mp3", "m4a"];
  try {
    validateAssetName(kind, name, extensions);
  } catch (error) {
    emit({
      code: "asset-name",
      severity: "warning",
      name,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function warnDuplicateHookAliases(
  module: GameModule,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  const pairs = [
    ["on_mouse_down", "onMouseDown"],
    ["on_mouse_up", "onMouseUp"],
    ["on_mouse_move", "onMouseMove"],
    ["on_key_down", "onKeyDown"],
    ["on_key_up", "onKeyUp"],
    ["on_music_end", "onMusicEnd"],
  ] as const;
  for (const [snake, camel] of pairs) {
    if (module[snake] && module[camel]) {
      emit({
        code: "duplicate-hook-alias",
        severity: "warning",
        name: snake,
        suggestion: camel,
        message: `${snake} and ${camel} are both defined; ${snake} will run first.`,
      });
    }
  }
}

function warnHookArity(
  name: "draw" | "update",
  hook: Hook | undefined,
  maximum: number,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  if (!hook) return;
  const arity = getParameterNames(hook).length;
  if (arity > maximum) {
    emit({
      code: "hook-arity",
      severity: "warning",
      name,
      message:
        name === "draw"
          ? "draw should not declare parameters."
          : "update should accept either no parameters or one dt parameter.",
    });
  }
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

function validDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function attachDispatcher(
  dispatcher: ReturnType<typeof createInputDispatcher>,
  canvas: RuntimeCanvas,
  options: RunOptions,
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
  return dispatcher.attach(canvas, keyboardTarget);
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
      return defaultStorage;
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

function createCanvas(): RuntimeCanvas {
  if (typeof document === "undefined") {
    throw new Error("run requires a canvas option outside the browser.");
  }
  const canvas = document.createElement("canvas") as RuntimeCanvas;
  canvas.tabIndex = 0;
  document.body.append(canvas);
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

function createDiagnosticEmitter(
  diagnostics: RuntimeDiagnostic[],
  callback?: (diagnostic: RuntimeDiagnostic) => void,
): (diagnostic: RuntimeDiagnostic) => void {
  return (diagnostic) => {
    diagnostics.push(diagnostic);
    callback?.(diagnostic);
  };
}

function closestName(
  name: string,
  candidates: readonly string[],
): string | undefined {
  const lower = name.toLowerCase();
  let best: { name: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = levenshtein(lower, candidate.toLowerCase());
    if (distance > 2) continue;
    if (!best || distance < best.distance) best = { name: candidate, distance };
  }
  return best?.name;
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from(
    { length: b.length + 1 },
    (_value, index) => index,
  );
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j < previous.length; j += 1) previous[j] = current[j] ?? 0;
  }
  return previous[b.length] ?? 0;
}

function stripCommentsAndStrings(source: string): string {
  return source.replaceAll(
    /\/\*[\s\S]*?\*\/|\/\/.*$|(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1/gm,
    " ",
  );
}

export const documentedGlobals = Object.freeze([...documentedGlobalNames]);
