import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  clock,
  defineGame,
  exit,
  keymods,
  images as globalImages,
  ImageSurface,
  keyboard,
  keys,
  run,
  screen,
  storage as globalStorage,
  type AssetLoader,
  type DrawableImage,
  type GameModule,
  type RuntimeCanvas,
  type SoundAsset,
  type SurfaceLike,
} from "@js-game-zero/core";
import {
  collectRuntimeDiagnostics,
  createBrowserSoundAsset,
  createImageLoader,
  createMusicLoader,
  createSoundLoader,
  getGameInspector,
  loadImages,
  type RuntimeDiagnostic,
  type RuntimeScheduler,
} from "@js-game-zero/core/host";
import { quietConsoleReports } from "./quiet-console-reports";

quietConsoleReports();

class MockContext {
  fillStyle: unknown = "";
  clearCalls = 0;
  fillCalls = 0;
  drawImageCalls = 0;

  clearRect(): void {
    this.clearCalls += 1;
  }

  fillRect(): void {
    this.fillCalls += 1;
  }

  drawImage(): void {
    this.drawImageCalls += 1;
  }
}

class MockCanvas extends EventTarget {
  width = 0;
  height = 0;
  tabIndex = 0;
  readonly context = new MockContext();
  removed = false;

  getContext(contextId: "2d"): CanvasRenderingContext2D | null {
    return contextId === "2d"
      ? (this.context as unknown as CanvasRenderingContext2D)
      : null;
  }

  getBoundingClientRect(): { left: number; top: number } {
    return { left: 0, top: 0 };
  }

  remove(): void {
    this.removed = true;
  }
}

describe("runtime touch configuration", () => {
  test("reads source globals, scoped definitions, and run option overrides", async () => {
    const source = run(
      "TOUCH_CONTROLS = { a: keys.SPACE }; function draw() {}",
      {
        canvas: canvas(),
        autostart: false,
      },
    );
    expect(source.module.TOUCH_CONTROLS).toEqual({ a: keys.SPACE });
    await source.dispose();
    const defined = run(
      defineGame(({ keys }) => ({
        TOUCH_CONTROLS: { left: keys.LEFT, a: keys.UP },
        draw() {},
      })),
      { canvas: canvas(), autostart: false },
    );
    expect(defined.module.TOUCH_CONTROLS).toEqual({
      left: keys.LEFT,
      a: keys.UP,
    });
    await defined.dispose();
    const overridden = run(
      { TOUCH_CONTROLS: true },
      {
        canvas: canvas(),
        autostart: false,
        TOUCH_CONTROLS: false,
      },
    );
    expect(overridden.module.TOUCH_CONTROLS).toBe(false);
    expect(
      overridden.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "duplicate-config" &&
          diagnostic.name === "TOUCH_CONTROLS",
      ),
    ).toBe(true);
    await overridden.dispose();
  });

  test("reports invalid touch configuration as a startup failure", () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    expect(() =>
      run("TOUCH_CONTROLS = { a: 999999 };", {
        canvas: canvas(),
        autostart: false,
        diagnostics: (diagnostic) => diagnostics.push(diagnostic),
      }),
    ).toThrow("TOUCH_CONTROLS.a must be a keys constant");
    expect(diagnostics.at(-1)).toMatchObject({
      code: "runtime-error",
      phase: "startup",
      severity: "error",
    });
  });
});

class MemoryAdapter {
  readonly path = "memory";
  text: string | null = null;

  async load(): Promise<string | null> {
    return this.text;
  }

  loadSync(): string | null {
    return this.text;
  }

  save(text: string): void {
    this.text = text;
  }
}

function canvas(): RuntimeCanvas {
  return new MockCanvas() as unknown as RuntimeCanvas;
}

function surface(width = 20, height = 10): SurfaceLike {
  return new ImageSurface(
    { width, height } as unknown as DrawableImage,
    width,
    height,
  );
}

/**
 * An image loader whose loads never settle until the test explicitly
 * resolves/rejects them by exact candidate name. Used to deterministically
 * exercise the runtime's preload gate and late-load pausing without
 * depending on a real browser Image/fetch stack.
 */
function controllableImageLoader(): {
  readonly loader: AssetLoader<SurfaceLike>;
  resolve(name: string, value: SurfaceLike): void;
  reject(name: string, error: unknown): void;
} {
  const pending = new Map<
    string,
    { resolve: (value: SurfaceLike) => void; reject: (error: unknown) => void }
  >();
  const loader = createImageLoader({
    projectId: "gate_test",
    loadAsset: (_url, name) =>
      new Promise<SurfaceLike>((resolvePromise, rejectPromise) => {
        pending.set(name, { resolve: resolvePromise, reject: rejectPromise });
      }),
  });
  return {
    loader,
    resolve(name, value) {
      pending.get(name)?.resolve(value);
      pending.delete(name);
    },
    reject(name, error) {
      pending.get(name)?.reject(error);
      pending.delete(name);
    },
  };
}

function keyEvent(type: "keydown" | "keyup", code: string, key: string): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    code: { value: code },
    key: { value: key },
    repeat: { value: false },
    shiftKey: { value: false },
    ctrlKey: { value: false },
    altKey: { value: false },
    metaKey: { value: false },
    getModifierState: { value: () => false },
  });
  return event;
}

function mouseEvent(type: "mousedown" | "mouseup", button = 0): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    button: { value: button },
    buttons: { value: type === "mousedown" ? 1 : 0 },
    clientX: { value: 4 },
    clientY: { value: 6 },
    movementX: { value: 0 },
    movementY: { value: 0 },
  });
  return event;
}

/**
 * A deterministic fake `requestAnimationFrame` scheduler: `run()`'s
 * autostart loop stores its callback here instead of it actually being
 * scheduled by the browser/event loop, so tests can invoke frames
 * one-by-one with controlled timestamps via `flush(timestamp)`.
 */
function fakeScheduler(): {
  readonly scheduler: RuntimeScheduler;
  flush(timestamp: number): void;
  pendingCount(): number;
} {
  const pending = new Map<number, (timestamp: number) => void>();
  let nextHandle = 0;
  const scheduler: RuntimeScheduler = {
    requestAnimationFrame(callback) {
      nextHandle += 1;
      pending.set(nextHandle, callback);
      return nextHandle;
    },
    cancelAnimationFrame(handle) {
      if (typeof handle === "number") pending.delete(handle);
    },
  };
  return {
    scheduler,
    flush(timestamp: number) {
      const [handle, callback] = [...pending.entries()][0] ?? [];
      if (handle === undefined || !callback) {
        throw new Error("fakeScheduler: no pending animation frame callback.");
      }
      pending.delete(handle);
      callback(timestamp);
    },
    pendingCount() {
      return pending.size;
    },
  };
}

describe("runtime zero-boilerplate mode", () => {
  test("exposes live non-function top-level bindings to host inspectors", () => {
    const target = canvas();
    const handle = run(
      `
let score = 1, player = { x: 4 };
const label = "ready", helper = () => "hidden";
bonus = 2;

function update(dt) {
  score += dt;
  player.x += 1;
}

function onKeyDown() {
  bonus += 3;
}
`,
      { autostart: false, canvas: target },
    );
    const inspector = getGameInspector(handle);

    expect(inspector?.bindings()).toEqual([
      "score",
      "player",
      "label",
      "bonus",
    ]);
    expect(inspector?.read("score")).toBe(1);
    expect(inspector?.read("player")).toEqual({ x: 4 });
    expect(inspector?.functions()).toEqual(["helper", "update", "onKeyDown"]);
    expect(typeof inspector?.read("helper")).toBe("function");
    expect((inspector?.read("helper") as () => string)()).toBe("hidden");
    expect(() => inspector?.read("missing")).toThrow(
      "Unknown game-state binding",
    );

    handle.step(0.5);
    target.dispatchEvent(keyEvent("keydown", "Space", " "));
    expect(inspector?.read("score")).toBe(1.5);
    expect(inspector?.read("player")).toEqual({ x: 5 });
    expect(inspector?.read("bonus")).toBe(5);

    handle.stop();
    expect(getGameInspector(handle)).toBeNull();
  });

  test("keeps a music end callback the top level gave setOnMusicEnd", async () => {
    const tracks: { emitEnded(): void }[] = [];
    const originalAudio = globalThis.Audio;
    globalThis.Audio = class {
      loop = false;
      currentTime = 0;
      volume = 1;
      paused = true;
      readonly ended = new Set<() => void>();
      constructor() {
        tracks.push(this);
      }
      play(): Promise<void> {
        this.paused = false;
        return Promise.resolve();
      }
      pause(): void {
        this.paused = true;
      }
      addEventListener(_type: string, listener: () => void): void {
        this.ended.add(listener);
      }
      removeEventListener(_type: string, listener: () => void): void {
        this.ended.delete(listener);
      }
      emitEnded(): void {
        for (const listener of [...this.ended]) listener();
      }
    } as unknown as typeof Audio;
    try {
      const handle = run(
        `
let ended = 0;
music.setOnMusicEnd(() => { ended += 1; });
music.playOnce("theme");
function draw() {}
`,
        {
          autostart: false,
          canvas: canvas(),
          storage: new MemoryAdapter(),
          loaders: {
            music: createMusicLoader({
              projectId: "music_end",
              loadAsset: async (url, name) => ({ kind: "music", name, url }),
            }),
          },
        },
      );
      await handle.ready;
      for (let turn = 0; turn < 10 && tracks.length === 0; turn += 1) {
        await Promise.resolve();
      }
      tracks[0]?.emitEnded();
      await Promise.resolve();

      expect(getGameInspector(handle)?.read("ended")).toBe(1);
      await handle.dispose();
    } finally {
      globalThis.Audio = originalAudio;
    }
  });

  test("a looping sound stops when its game stops or restarts", async () => {
    const elements: { loop: boolean; paused: boolean }[] = [];
    const sounds = createSoundLoader({
      projectId: "looping_sound",
      loadAsset: async (url, name) =>
        createBrowserSoundAsset(
          { kind: "sound", name, url },
          {
            createAudioElement() {
              const element = {
                src: "",
                loop: false,
                currentTime: 0,
                volume: 1,
                duration: 1,
                paused: true,
                async play() {
                  element.paused = false;
                },
                pause() {
                  element.paused = true;
                },
                addEventListener() {},
                removeEventListener() {},
              };
              elements.push(element);
              return element;
            },
          },
        ),
    });
    await sounds.load("engine");
    const looping = () =>
      elements.filter((element) => element.loop && !element.paused).length;
    const first = run(
      `
let started = false;
function update() {
  if (!started) sounds.engine.loop();
  started = true;
}
`,
      {
        autostart: false,
        canvas: canvas(),
        storage: new MemoryAdapter(),
        loaders: { sounds },
      },
    );
    await first.ready;
    first.step(0.016);
    await Promise.resolve();
    expect(looping()).toBe(1);

    const second = await first.restart();
    expect(looping()).toBe(0);
    await second.ready;
    second.step(0.016);
    await Promise.resolve();
    expect(looping()).toBe(1);

    await second.dispose();
    expect(looping()).toBe(0);
  });

  test("keeps the inspector of a failed game for post-mortem reads", () => {
    const target = canvas();
    const handle = run(
      `
let t = 0;
function update(dt) {
  t += dt;
  missing.x = 1;
}
`,
      { autostart: false, canvas: target, diagnostics: () => {} },
    );
    handle.step(0.25);
    expect(handle.state).toBe("failed");
    expect(getGameInspector(handle)?.read("t")).toBe(0.25);
    handle.stop();
    expect(getGameInspector(handle)?.read("t")).toBe(0.25);
  });

  test("executes assignment-style globals and hooks without leaking globals", () => {
    const target = canvas();
    const adapter = new MemoryAdapter();
    const diagnostics: RuntimeDiagnostic[] = [];
    const handle = run(
      `
WIDTH = 320;
HEIGHT = 180;
TITLE = "Zero Mode";
let total = 0;

function update(dt) {
  total += dt;
  storage.set("total", Math.round(total * 100));
}

function draw() {
  storage.set("drawSize", [screen.width, screen.height]);
}

function onKeyDown(key) {
  storage.set("lastKey", key);
}
`,
      {
        autostart: false,
        canvas: target,
        diagnostics: (diagnostic) => diagnostics.push(diagnostic),
        storage: adapter,
      },
    );

    handle.step(0.25);
    target.dispatchEvent(keyEvent("keydown", "ArrowLeft", "ArrowLeft"));

    expect(target.width).toBe(320);
    expect(target.height).toBe(180);
    expect(handle.storage.get("total")).toBe(25);
    expect(handle.storage.get("drawSize")).toEqual([320, 180]);
    expect(handle.storage.get("lastKey")).toBe(keys.LEFT);
    expect((globalThis as typeof globalThis & { WIDTH?: number }).WIDTH).toBe(
      undefined,
    );
    expect(diagnostics).toEqual([]);

    handle.stop();
  });

  test("advances learner animate calls on the game clock", () => {
    const handle = run(
      `
WIDTH = 160;
HEIGHT = 90;
let target = { x: 0 };
animate(target, { x: 10, duration: 1 });

function update() {
  storage.set("x", target.x);
}
`,
      {
        autostart: false,
        canvas: canvas(),
        storage: new MemoryAdapter(),
      },
    );

    handle.step(0.5);

    expect(handle.storage.get("x")).toBe(5);
    handle.stop();
  });
});

describe("runtime explicit import mode", () => {
  test("runs imported hooks, sizes the canvas, and removes event listeners", () => {
    const target = canvas();
    let updates = 0;
    let draws = 0;
    let keyDowns = 0;

    const handle = run(
      {
        WIDTH: 200,
        HEIGHT: 120,
        draw() {
          draws += 1;
          expect(screen.width).toBe(200);
        },
        update(dt: unknown) {
          updates += dt as number;
        },
        onKeyDown(key: unknown) {
          expect(keyboard.right).toBe(true);
          if (key === keys.RIGHT) keyDowns += 1;
        },
      },
      { autostart: false, canvas: target },
    );

    expect(getGameInspector(handle)).toBeNull();

    handle.step(0.1);
    target.dispatchEvent(keyEvent("keydown", "ArrowRight", "ArrowRight"));
    expect(target.width).toBe(200);
    expect(target.height).toBe(120);
    expect(draws).toBe(1);
    expect(updates).toBe(0.1);
    expect(keyDowns).toBe(1);
    expect(handle.keyboard.right).toBe(true);
    expect(keyboard.right).toBe(false);

    handle.stop();
    target.dispatchEvent(keyEvent("keydown", "ArrowRight", "ArrowRight"));
    expect(keyDowns).toBe(1);
    expect(keyboard.right).toBe(false);
    expect((globalThis as typeof globalThis & { draw?: unknown }).draw).toBe(
      undefined,
    );
  });

  test("isolates imported keyboard and clock between handles", () => {
    const firstCanvas = canvas();
    const secondCanvas = canvas();
    let importedKeyboardWasActive = false;
    let leakedClockCallback = false;
    let secondUpdates = 0;

    const first = run(
      {
        update() {
          clock.schedule(() => {
            leakedClockCallback = true;
          }, 0.1);
        },
        onKeyDown() {
          importedKeyboardWasActive = keyboard.a === true;
        },
      },
      { autostart: false, canvas: firstCanvas },
    );

    first.step(0);
    firstCanvas.dispatchEvent(keyEvent("keydown", "KeyA", "a"));
    expect(importedKeyboardWasActive).toBe(true);
    expect(first.keyboard.a).toBe(true);
    expect(keyboard.a).toBe(false);
    first.stop();

    const second = run(
      {
        update(dt: unknown) {
          secondUpdates += dt as number;
        },
      },
      { autostart: false, canvas: secondCanvas },
    );
    second.step(0.2);

    expect(secondUpdates).toBe(0.2);
    expect(second.keyboard.a).toBe(false);
    expect(leakedClockCallback).toBe(false);
    second.stop();
  });

  test("legacy package asset proxies follow the current callback's run", async () => {
    const firstImages = createImageLoader({ projectId: "legacy_first" });
    const secondImages = createImageLoader({ projectId: "legacy_second" });
    firstImages.define("hero.svg", surface(13, 5));
    secondImages.define("hero.svg", surface(26, 5));
    const widths: number[] = [];
    const module = {
      update() {
        widths.push(globalImages.get("hero.svg")?.getWidth() ?? -1);
      },
    };
    const first = run(module, {
      autostart: false,
      canvas: canvas(),
      loaders: { images: firstImages },
    });
    const second = run(module, {
      autostart: false,
      canvas: canvas(),
      loaders: { images: secondImages },
    });
    await Promise.all([first.ready, second.ready]);

    first.step(0);
    second.step(0);
    expect(widths).toEqual([13, 26]);

    await Promise.all([first.dispose(), second.dispose()]);
  });

  test("preloads assets for PGZero-style image property access", async () => {
    const target = canvas();
    const handle = run(
      `
let loadedSize = images.player.getSize();

function update() {
  storage.set("playerSize", loadedSize);
}
`,
      {
        autostart: false,
        canvas: target,
        preloadedAssets: {
          images: {
            "player.svg": surface(32, 24),
          },
        },
        storage: new MemoryAdapter(),
      },
    );

    handle.step(0);

    expect(handle.storage.get("playerSize")).toEqual([32, 24]);
    handle.stop();
  });
});

describe("runtime diagnostics", () => {
  test("warns for hook and constant typos, update arity mistakes, and asset names", () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const handle = run(
      `
WIDHT = 320;
function drwa() {}
function update(dt, extra) {}
const asset = "Player Ship.svg";
`,
      {
        autostart: false,
        canvas: canvas(),
        diagnostics: (diagnostic) => diagnostics.push(diagnostic),
      },
    );
    handle.stop();

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "constant-typo",
    );
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "hook-typo",
    );
    expect(
      diagnostics.filter((diagnostic) => diagnostic.code === "hook-arity"),
    ).toHaveLength(1);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "asset-name",
    );
  });

  test("throws a TypeError at startup when draw declares parameters, matching the upstream reference framework", () => {
    expect(() =>
      run(
        `
function draw(context) {}
`,
        { autostart: false, canvas: canvas() },
      ),
    ).toThrow(TypeError);
    expect(() =>
      run(
        // TypeScript stops this too; plain JavaScript gets the error.
        { draw: (context: unknown) => context } as unknown as GameModule,
        { autostart: false, canvas: canvas() },
      ),
    ).toThrow(/draw\(\) must not take any arguments\./);
  });

  test("draw's parameters are one problem, on the line that declares it", () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    expect(() =>
      run("WIDTH = 100;\n\nfunction draw(x) {}", {
        autostart: false,
        canvas: canvas(),
        storage: new MemoryAdapter(),
        diagnostics: (diagnostic) => diagnostics.push(diagnostic),
      }),
    ).toThrow(TypeError);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        phase: "startup",
        message: "startup failed: draw() must not take any arguments.",
        line: 3,
      }),
    ]);
  });

  test("a misspelled hook or setting is pointed at the line that declares it", () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const handle = run("WIDHT = 100;\nlet x = 0;\nfunction updte() {}", {
      autostart: false,
      canvas: canvas(),
      storage: new MemoryAdapter(),
      diagnostics: (diagnostic) => diagnostics.push(diagnostic),
    });
    handle.stop();
    expect(
      diagnostics.map(({ code, name, line }) => ({ code, name, line })),
    ).toEqual(
      expect.arrayContaining([
        { code: "constant-typo", name: "WIDHT", line: 1 },
        { code: "hook-typo", name: "updte", line: 3 },
      ]),
    );
    expect(diagnostics).toHaveLength(2);
  });

  test("a missing or extra } is reported in the game's own terms, on its line", () => {
    const startup = (source: string) => {
      const diagnostics: RuntimeDiagnostic[] = [];
      try {
        run(source, {
          autostart: false,
          canvas: canvas(),
          storage: new MemoryAdapter(),
          diagnostics: (diagnostic) => diagnostics.push(diagnostic),
        }).stop();
      } catch {
        // The diagnostic says what the thrown error does.
      }
      const failure = diagnostics.find((d) => d.phase === "startup");
      return { message: failure?.message, line: failure?.line };
    };
    expect(
      startup('WIDTH = 100;\nfunction draw() {\n  screen.fill("navy");\n'),
    ).toEqual({
      message:
        "startup failed: Something isn't closed: a {, ( or [ is missing its }, ) or ].",
      line: 2,
    });
    // Not the runtime's own wrapper: no ")" or ";" the learner never typed.
    const extra = startup("function draw() {}\n}\n");
    expect(extra.message).not.toMatch(/[);]/);
    expect(extra.line).toBe(2);
  });

  test("a class called without new, as Pygame Zero code calls it, says to add new", () => {
    const startup = (source: string) => {
      try {
        run(`${source}\nfunction draw() {}`, {
          autostart: false,
          canvas: canvas(),
          storage: new MemoryAdapter(),
          diagnostics: () => {},
        }).stop();
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(startup('let ship = Actor("ship");')).toBe(
      'Actor needs new in front of it: new Actor("alien").',
    );
    expect(startup("let box = Rect(0, 0, 10, 10);")).toBe(
      "Rect needs new in front of it: new Rect(x, y, width, height).",
    );
    // Made properly, they're the classes they always were.
    expect(
      startup(
        [
          'class Ship extends Actor { constructor() { super("ship"); } }',
          "let box = new ZRect(0, 0, 10, 10);",
          "if (!(new Ship() instanceof Actor) || !(box instanceof Rect)) throw new Error('lost a class');",
        ].join("\n"),
      ),
    ).toBeNull();
  });

  test("does not throw for a zero-argument draw or a missing draw", () => {
    const handle = run(
      `
function draw() {}
`,
      { autostart: false, canvas: canvas() },
    );
    handle.stop();

    const noDraw = run({}, { autostart: false, canvas: canvas() });
    noDraw.stop();
  });

  test("reports duplicate run configuration, a snake_case hook and draw parameters", () => {
    const diagnostics = collectRuntimeDiagnostics(
      {
        WIDTH: 100,
        draw(unused: unknown) {
          return unused;
        },
        on_key_down() {},
      } as unknown as GameModule,
      {
        WIDTH: 120,
      },
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "duplicate-config",
    );
    expect(
      diagnostics.find((diagnostic) => diagnostic.code === "hook-typo"),
    ).toMatchObject({
      name: "on_key_down",
      suggestion: "onKeyDown",
      message:
        "on_key_down is never called. Hooks are named in camelCase, so rename it to onKeyDown.",
    });
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "hook-arity",
    );
  });
});

describe("preload gate", () => {
  test("holds the first frame until an Actor constructed in top-level code finishes loading", async () => {
    const target = canvas();
    const { loader, resolve } = controllableImageLoader();
    const handle = run(
      `
let hero = new Actor("hero.svg", { center: [50, 40] });

function draw() {
  storage.set("width", hero.width);
  storage.set("height", hero.height);
  storage.set("pos", hero.pos);
}
`,
      {
        autostart: false,
        canvas: target,
        loaders: { images: loader },
        storage: new MemoryAdapter(),
      },
    );

    // The image is still loading: the loop must hold the frame rather
    // than draw an Actor with a zero-sized, mispositioned surface.
    handle.step(0.1);
    expect(handle.storage.get("width")).toBeUndefined();

    resolve("hero.svg", surface(20, 10));
    await handle.ready;

    handle.step(0.1);
    expect(handle.storage.get("width")).toBe(20);
    expect(handle.storage.get("height")).toBe(10);
    expect(handle.storage.get("pos")).toEqual([50, 40]);

    handle.stop();
  });

  test("holds the first frame until a top-level images.<name> touch finishes loading", async () => {
    const target = canvas();
    const { loader, resolve } = controllableImageLoader();
    // Referencing `images["hero.svg"]` (without immediately calling a
    // method on it) starts the load without throwing, matching the
    // documented `images.player` top-level touch pattern; the surface
    // is only read once the gate has held frames until it is ready.
    const handle = run(
      `
let heroRef = images["hero.svg"];

function draw() {
  storage.set("size", heroRef.getSize());
}
`,
      {
        autostart: false,
        canvas: target,
        loaders: { images: loader },
        storage: new MemoryAdapter(),
      },
    );

    handle.step(0);
    expect(handle.storage.get("size")).toBeUndefined();

    resolve("hero.svg", surface(40, 24));
    await handle.ready;

    handle.step(0);
    expect(handle.storage.get("size")).toEqual([40, 24]);
    handle.stop();
  });

  test("resolves handle.ready immediately when nothing was requested during module evaluation", async () => {
    const handle = run(
      { draw() {} },
      { autostart: false, canvas: canvas(), storage: new MemoryAdapter() },
    );
    await handle.ready;
    handle.stop();
  });

  test("passing the ambient storage export as RunOptions.storage behaves like omitting it", () => {
    // The public `storage` export is an active-service proxy; passing it
    // back in as RunOptions.storage must not install it as its own
    // backing target (which would recurse infinitely resolving itself).
    const handle = run(
      { update: () => globalStorage.set("count", 1) },
      { autostart: false, canvas: canvas(), storage: globalStorage },
    );

    expect(() => handle.step(0)).not.toThrow();
    expect(handle.storage.get("count")).toBe(1);
    expect(handle.storage).not.toBe(globalStorage);
    handle.stop();
  });

  test("adopts a pending package-level singleton load into the first run's preload gate", async () => {
    const target = canvas();
    // Simulate `new Actor("ghost.svg")`/`images.load(...)` at import-mode
    // top-level code, executed before `run()` is even called: it lands on
    // the singleton `images` loader, not any run's context-owned loader.
    // With no other run active yet, this handle must adopt it.
    const probeName = "jgz_runtime_gate_probe.svg";
    const pendingLoad = globalImages.load(probeName).catch(() => undefined);
    expect(globalImages.pendingCount()).toBeGreaterThan(0);

    let drew = false;
    const handle = run(
      { draw: () => (drew = true) },
      { autostart: false, canvas: target, storage: new MemoryAdapter() },
    );

    // Gated: the adopted singleton load has not settled yet.
    handle.step(0);
    expect(drew).toBe(false);

    await pendingLoad;
    // The probe asset can never actually load in this environment, so the
    // adopted failure surfaces through `ready` and fails startup, just as a
    // context-owned required-asset failure would.
    await handle.ready.catch(() => undefined);
    expect(handle.state).toBe("failed");
    expect(drew).toBe(false);
  });

  test("does not let package-level singleton loads gate a second concurrent handle", async () => {
    const first = run(
      { draw() {} },
      { autostart: false, canvas: canvas(), storage: new MemoryAdapter() },
    );
    await first.ready;

    // Simulate `new Actor("ghost.svg")` constructed at import-mode
    // top-level code for a *second* game while another run is already
    // active: it defaults to the singleton `images` loader, but this
    // handle is not the first/only active run so it must not adopt it.
    const probeName = "jgz_runtime_gate_probe_concurrent.svg";
    const pendingLoad = globalImages.load(probeName).catch(() => undefined);
    expect(globalImages.pendingCount()).toBeGreaterThan(0);

    let drew = false;
    const second = run(
      { draw: () => (drew = true) },
      { autostart: false, canvas: canvas(), storage: new MemoryAdapter() },
    );

    second.step(0);
    expect(drew).toBe(true);

    await pendingLoad;
    await globalImages.waitForIdle().catch(() => undefined);
    first.stop();
    second.stop();
  });
});

describe("late asset request pausing", () => {
  test("pauses presenting draw() while a first-referenced blit image is loading, then shows correct data", async () => {
    const target = canvas();
    const { loader, resolve } = controllableImageLoader();
    let drawCount = 0;
    const handle = run(
      {
        draw() {
          drawCount += 1;
          screen.blit("bg.svg", [0, 0]);
        },
      },
      {
        autostart: false,
        canvas: target,
        loaders: { images: loader },
        storage: new MemoryAdapter(),
      },
    );

    await handle.ready; // nothing to preload; resolves promptly

    handle.step(0); // draw() runs, kicks off the (uncached) "bg.svg" load
    expect(drawCount).toBe(1);

    handle.step(0); // gated: the load from the previous tick is still pending
    expect(drawCount).toBe(1);

    resolve("bg.svg", surface(8, 8));
    await loader.waitForIdle();

    handle.step(0); // ungated: draw() runs again, this time "bg.svg" is cached
    expect(drawCount).toBe(2);

    handle.stop();
  });

  test("pauses draw when update() sets a new actor.image, then reports correct size on the next executed frame", async () => {
    const target = canvas();
    const { loader, resolve } = controllableImageLoader();
    loader.define("start.svg", surface(10, 10));
    const handle = run(
      `
let hero = new Actor("start.svg", [0, 0]);
let swapped = false;

function update() {
  if (!swapped) {
    hero.image = "next.svg";
    swapped = true;
  }
}

function draw() {
  storage.set("width", hero.width);
  storage.set("height", hero.height);
}
`,
      {
        autostart: false,
        canvas: target,
        loaders: { images: loader },
        storage: new MemoryAdapter(),
      },
    );

    await handle.ready; // "start.svg" is already cached via define()

    handle.step(0); // update() swaps the image; draw() is held back this tick
    expect(handle.storage.get("width")).toBeUndefined();

    handle.step(0); // still gated: "next.svg" has not resolved yet
    expect(handle.storage.get("width")).toBeUndefined();

    resolve("next.svg", surface(50, 30));
    await loader.waitForIdle();

    handle.step(0); // ungated: draw() now sees the fully loaded new image
    expect(handle.storage.get("width")).toBe(50);
    expect(handle.storage.get("height")).toBe(30);

    handle.stop();
  });
});

describe("storage auto-load and auto-save", () => {
  test("auto-loads storage synchronously before top-level code runs (no explicit load())", () => {
    const target = canvas();
    const adapter = new MemoryAdapter();
    adapter.text = JSON.stringify({ score: 7 });
    const handle = run(
      `
let score = storage.get("score") ?? 0;

function update() {
  score += 1;
  storage.set("score", score);
}
`,
      { autostart: false, canvas: target, storage: adapter },
    );

    handle.step(0.1);
    expect(handle.storage.get("score")).toBe(8);

    handle.stop();
  });

  test("flushes a pending debounced save immediately on handle.stop() (no explicit save())", async () => {
    const target = canvas();
    const adapter = new MemoryAdapter();
    const handle = run(
      { update() {}, draw() {} },
      { autostart: false, canvas: target, storage: adapter },
    );
    await handle.ready;

    handle.storage.set("coins", 3);
    expect(adapter.text).toBeNull();

    handle.stop();
    expect(adapter.text).toBe(JSON.stringify({ coins: 3 }));
  });

  test("auto-saves a mutation after a short debounce with no explicit save() call", async () => {
    const target = canvas();
    const adapter = new MemoryAdapter();
    const handle = run(
      { update() {}, draw() {} },
      { autostart: false, canvas: target, storage: adapter },
    );
    await handle.ready;

    handle.storage.set("coins", 5);
    expect(adapter.text).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(adapter.text).toBe(JSON.stringify({ coins: 5 }));
    handle.stop();
  });

  test("flushes a pending debounced save when window fires pagehide", async () => {
    const target = canvas();
    const adapter = new MemoryAdapter();
    const fakeWindow = new EventTarget();
    const globalWithWindow = globalThis as unknown as {
      window: EventTarget | undefined;
    };
    const originalWindow = globalWithWindow.window;
    globalWithWindow.window = fakeWindow;
    try {
      const handle = run(
        { update() {}, draw() {} },
        { autostart: false, canvas: target, storage: adapter },
      );
      await handle.ready;

      handle.storage.set("coins", 11);
      expect(adapter.text).toBeNull();

      fakeWindow.dispatchEvent(new Event("pagehide"));
      expect(adapter.text).toBe(JSON.stringify({ coins: 11 }));

      handle.stop();
    } finally {
      globalWithWindow.window = originalWindow;
    }
  });

  test("keeps explicit storage.save()/load() working alongside auto-save", async () => {
    const target = canvas();
    const adapter = new MemoryAdapter();
    const handle = run(
      { update() {}, draw() {} },
      { autostart: false, canvas: target, storage: adapter },
    );
    await handle.ready;

    handle.storage.set("explicit", true);
    await handle.storage.save();
    expect(adapter.text).toBe(JSON.stringify({ explicit: true }));

    handle.stop();
  });
});

describe("GameHandle lifecycle: autostart scheduler, pause/resume, reload, exit", () => {
  test("autostart drives frames through the injected scheduler and reschedules each tick", () => {
    const target = canvas();
    const { scheduler, flush, pendingCount } = fakeScheduler();
    let updates = 0;
    let draws = 0;
    let lastDt: number | undefined;

    const handle = run(
      {
        update(dt: unknown) {
          updates += 1;
          lastDt = dt as number;
        },
        draw() {
          draws += 1;
        },
      },
      { canvas: target, autostart: true, scheduler },
    );

    // run() immediately schedules the first frame.
    expect(pendingCount()).toBe(1);

    // The first frame has no previous timestamp to diff against, so dt
    // clamps to 0 (see runtime.ts's `lastTimestamp ?? timestamp`).
    flush(1000);
    expect(updates).toBe(1);
    expect(draws).toBe(1);
    expect(lastDt).toBe(0);
    // Each frame reschedules the next one via requestAnimationFrame.
    expect(pendingCount()).toBe(1);

    // A second frame 250ms later reports dt derived from the timestamp delta.
    flush(1250);
    expect(updates).toBe(2);
    expect(draws).toBe(2);
    expect(lastDt).toBeCloseTo(0.25, 5);
    expect(pendingCount()).toBe(1);

    handle.stop();
    expect(pendingCount()).toBe(0);
  });

  test("pause() suspends step()-driven updates and resume() restores them", () => {
    const target = canvas();
    let updates = 0;
    const handle = run(
      {
        update() {
          updates += 1;
        },
      },
      { autostart: false, canvas: target },
    );

    handle.step(0.1);
    expect(updates).toBe(1);

    handle.pause();
    handle.step(0.1);
    handle.step(0.1);
    expect(updates).toBe(1); // no updates while paused

    handle.resume();
    handle.step(0.1);
    expect(updates).toBe(2);

    handle.stop();
  });

  test("resume() is a no-op once the handle has been stopped", () => {
    const target = canvas();
    let updates = 0;
    const handle = run(
      {
        update() {
          updates += 1;
        },
      },
      { autostart: false, canvas: target },
    );

    handle.stop();
    handle.resume(); // must not resurrect a stopped handle
    handle.step(0.1);
    expect(updates).toBe(0);
  });

  test("reload(source) stops the current handle and returns a fresh handle running the new module", () => {
    const target = canvas();
    let firstUpdates = 0;
    let secondUpdates = 0;
    const handle = run(
      {
        update() {
          firstUpdates += 1;
        },
      },
      { autostart: false, canvas: target },
    );

    handle.step(0.1);
    expect(firstUpdates).toBe(1);

    const reloaded = handle.reload({
      update() {
        secondUpdates += 1;
      },
    });

    expect(reloaded).not.toBe(handle);
    expect(reloaded.mode).toBe("import");

    // The original handle is stopped by reload(): further step() calls
    // are no-ops on it.
    handle.step(0.1);
    expect(firstUpdates).toBe(1);

    reloaded.step(0.1);
    expect(secondUpdates).toBe(1);

    reloaded.stop();
  });

  test("reload() with no arguments restarts the same module/source as a fresh handle", () => {
    const target = canvas();
    let updates = 0;
    const handle = run(
      {
        update() {
          updates += 1;
        },
      },
      { autostart: false, canvas: target },
    );

    handle.step(0.1);
    expect(updates).toBe(1);

    const reloaded = handle.reload();
    expect(reloaded).not.toBe(handle);

    // Reloading re-evaluates the *same* module object, so its `update`
    // closure still increments the shared counter.
    reloaded.step(0.1);
    expect(updates).toBe(2);

    reloaded.stop();
  });

  test("exit() stops the currently active handle, matching handle.stop()", () => {
    const target = canvas();
    let updates = 0;
    let keyDowns = 0;
    const handle = run(
      {
        update() {
          updates += 1;
        },
        onKeyDown() {
          keyDowns += 1;
        },
      },
      { autostart: false, canvas: target },
    );

    handle.step(0.1);
    target.dispatchEvent(keyEvent("keydown", "ArrowRight", "ArrowRight"));
    expect(updates).toBe(1);
    expect(keyDowns).toBe(1);

    exit();

    // exit() calls stop() on the module-level active handle: step() is now
    // a no-op and input listeners have been detached, exactly as if
    // handle.stop() had been called directly.
    handle.step(0.1);
    target.dispatchEvent(keyEvent("keydown", "ArrowRight", "ArrowRight"));
    expect(updates).toBe(1);
    expect(keyDowns).toBe(1);
  });
});

describe("scoped game definitions and deterministic lifecycle failures", () => {
  test("a synchronous startup failure emits a diagnostic and removes an owned canvas", () => {
    const originalDocument = globalThis.document;
    const createdCanvas = new MockCanvas();
    const diagnostics: RuntimeDiagnostic[] = [];
    const fakeDocument = Object.assign(new EventTarget(), {
      body: { append() {} },
      createElement: () => createdCanvas,
      visibilityState: "visible",
      title: "",
      querySelector: () => null,
      head: { append() {} },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: fakeDocument,
    });

    try {
      expect(() =>
        run(
          defineGame(() => {
            throw new Error("factory exploded");
          }),
          {
            autostart: false,
            diagnostics: (diagnostic) => diagnostics.push(diagnostic),
            storage: new MemoryAdapter(),
          },
        ),
      ).toThrow("factory exploded");
      expect(createdCanvas.removed).toBe(true);
      expect(
        diagnostics.filter((diagnostic) => diagnostic.phase === "startup"),
      ).toHaveLength(1);
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  });

  test("defineGame provides typed, run-scoped services and event objects", async () => {
    const target = canvas();
    const loader = createImageLoader({ projectId: "scoped_game" });
    loader.define("hero.svg", surface(24, 12));
    let updateDt = 0;
    let pressedKey = 0;
    let scopedProject = "";
    let actorWidth = 0;

    const handle = run(
      defineGame(({ Actor, images, storage }) => {
        scopedProject = images.projectId;
        const hero = new Actor("hero.svg");
        return {
          update(dt) {
            updateDt = dt;
            actorWidth = hero.width;
            storage.set("updated", true);
          },
          draw() {},
          onKeyDown(event) {
            pressedKey = event.key;
          },
        };
      }),
      {
        autostart: false,
        canvas: target,
        loaders: { images: loader },
        storage: new MemoryAdapter(),
      },
    );

    await handle.ready;
    handle.step(0.125);
    target.dispatchEvent(keyEvent("keydown", "ArrowRight", "ArrowRight"));

    expect(scopedProject).toBe("scoped_game");
    expect(updateDt).toBe(0.125);
    expect(actorWidth).toBe(24);
    expect(pressedKey).toBe(keys.RIGHT);
    expect(handle.storage.get("updated")).toBe(true);
    await handle.dispose();
    expect(handle.state).toBe("stopped");
  });

  test("defineGame's animate and Animation run on its clock outside a hook", async () => {
    const box = { x: 0, y: 0 };
    const handle = run(
      defineGame(({ animate, Animation }) => {
        void Promise.resolve().then(() => {
          animate(box, { x: 100, duration: 1 });
          new Animation(box, { y: 50, duration: 1 });
        });
        return { draw() {} };
      }),
      { autostart: false, canvas: canvas(), storage: new MemoryAdapter() },
    );
    await handle.ready;
    handle.step(0.5);
    handle.step(0.5);

    expect(box).toEqual({ x: 100, y: 50 });
    await handle.dispose();
  });

  test("defineGame's input hooks get the event object in a minified app", async () => {
    // A bundler renames the `event` parameter of the hook defineGame
    // installs, so the runtime can't go by that name.
    const dir = await mkdtemp(join(tmpdir(), "jgz-minified-"));
    try {
      const entry = join(dir, "game.ts");
      await Bun.write(
        entry,
        `import { defineGame, run } from ${JSON.stringify(resolve(import.meta.dir, "../src/index.ts"))};
export const start = (options, pressed) =>
  run(defineGame(() => ({ draw() {}, onKeyDown(event) { pressed(event); } })), options);`,
      );
      const build = await Bun.build({
        entrypoints: [entry],
        minify: true,
        target: "browser",
      });
      expect(build.success).toBe(true);
      // In a folder of its own: Bun's resolver remembers what a folder held
      // when the build read it, and would load game.ts for game.js.
      const bundle = join(dir, "out", "bundle.js");
      await Bun.write(bundle, await build.outputs[0]!.text());
      const { start } = (await import(bundle)) as {
        start: (
          options: object,
          pressed: (event: unknown) => void,
        ) => ReturnType<typeof run>;
      };

      const target = canvas();
      const pressed: unknown[] = [];
      const handle = start(
        { autostart: false, canvas: target, storage: new MemoryAdapter() },
        (event) => pressed.push(event),
      );
      await handle.ready;
      target.dispatchEvent(keyEvent("keydown", "ArrowRight", "ArrowRight"));

      expect(pressed).toEqual([
        expect.objectContaining({ key: keys.RIGHT, repeat: false }),
      ]);
      await handle.dispose();
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  test("a draw failure emits one phase diagnostic, fails, and fully disposes", async () => {
    const target = canvas();
    let inputCalls = 0;
    const handle = run(
      {
        draw() {
          throw new Error("draw exploded");
        },
        onKeyDown() {
          inputCalls += 1;
        },
      },
      { autostart: false, canvas: target, storage: new MemoryAdapter() },
    );
    await handle.ready;

    handle.step(0);
    await handle.done;
    target.dispatchEvent(keyEvent("keydown", "KeyA", "a"));

    expect(handle.state).toBe("failed");
    expect(handle.failure?.phase).toBe("draw");
    expect(
      handle.diagnostics.filter((entry) => entry.phase === "draw"),
    ).toHaveLength(1);
    expect(inputCalls).toBe(0);
  });

  test("an autostart failure does not schedule another frame", async () => {
    const { scheduler, flush, pendingCount } = fakeScheduler();
    const handle = run(
      {
        update() {
          throw new Error("update exploded");
        },
      },
      {
        canvas: canvas(),
        scheduler,
        storage: new MemoryAdapter(),
      },
    );
    await handle.ready;

    flush(100);
    await handle.done;

    expect(handle.failure?.phase).toBe("update");
    expect(pendingCount()).toBe(0);
  });

  test("an input hook failure fails the handle and detaches listeners", async () => {
    const target = canvas();
    let calls = 0;
    const handle = run(
      {
        onKeyDown() {
          calls += 1;
          throw new Error("input exploded");
        },
      },
      { autostart: false, canvas: target, storage: new MemoryAdapter() },
    );
    await handle.ready;

    target.dispatchEvent(keyEvent("keydown", "KeyA", "a"));
    await handle.done;
    target.dispatchEvent(keyEvent("keydown", "KeyA", "a"));

    expect(handle.state).toBe("failed");
    expect(handle.failure?.phase).toBe("input");
    expect(calls).toBe(1);
  });

  test("a scheduled clock callback failure crosses the runtime boundary", async () => {
    const handle = run(
      defineGame(({ clock }) => {
        clock.schedule(() => {
          throw new Error("clock exploded");
        }, 0);
        return { draw() {} };
      }),
      {
        autostart: false,
        canvas: canvas(),
        storage: new MemoryAdapter(),
      },
    );
    await handle.ready;

    handle.step(0);
    await handle.done;

    expect(handle.state).toBe("failed");
    expect(handle.failure?.phase).toBe("clock");
  });

  test("stepping an older handle restores the newest handle's global screen", async () => {
    const firstCanvas = canvas();
    const secondCanvas = canvas();
    let widthDuringFirstDraw = 0;
    const first = run(
      {
        WIDTH: 111,
        draw() {
          widthDuringFirstDraw = screen.width;
        },
      },
      { autostart: false, canvas: firstCanvas, storage: new MemoryAdapter() },
    );
    const second = run(
      { WIDTH: 222, draw() {} },
      { autostart: false, canvas: secondCanvas, storage: new MemoryAdapter() },
    );
    await Promise.all([first.ready, second.ready]);

    first.step(0);
    expect(widthDuringFirstDraw).toBe(111);
    expect(screen.width).toBe(222);

    await second.dispose();
    expect(screen.width).toBe(111);
    await first.dispose();
    expect(() => screen.width).toThrow(/No active Screen/);
  });

  test("defined-game exit is bound to its own handle", async () => {
    const first = run(
      defineGame(({ exit }) => ({ draw: exit })),
      { autostart: false, canvas: canvas(), storage: new MemoryAdapter() },
    );
    const second = run(
      defineGame(() => ({ draw() {} })),
      {
        autostart: false,
        canvas: canvas(),
        storage: new MemoryAdapter(),
      },
    );
    await Promise.all([first.ready, second.ready]);

    first.step(0);
    await first.done;
    expect(first.state).toBe("stopped");
    expect(second.state).toBe("running");
    await second.dispose();
  });

  test("simultaneous defined games keep assets and storage run-scoped", async () => {
    const firstImages = createImageLoader({ projectId: "first_assets" });
    const secondImages = createImageLoader({ projectId: "second_assets" });
    firstImages.define("hero.svg", surface(11, 5));
    secondImages.define("hero.svg", surface(22, 5));
    const firstStorage = new MemoryAdapter();
    const secondStorage = new MemoryAdapter();
    const tones: unknown[] = [];

    const game = defineGame(({ Actor, storage, tone }) => {
      tones.push(tone);
      const hero = new Actor("hero.svg");
      return {
        update() {
          storage.set("heroWidth", hero.width);
        },
      };
    });
    const first = run(game, {
      autostart: false,
      canvas: canvas(),
      loaders: { images: firstImages },
      storage: firstStorage,
    });
    const second = run(game, {
      autostart: false,
      canvas: canvas(),
      loaders: { images: secondImages },
      storage: secondStorage,
    });
    await Promise.all([first.ready, second.ready]);

    first.step(0);
    second.step(0);
    expect(first.storage.get("heroWidth")).toBe(11);
    expect(second.storage.get("heroWidth")).toBe(22);
    expect(tones).toHaveLength(2);
    expect(tones[0]).not.toBe(tones[1]);

    await Promise.all([first.dispose(), second.dispose()]);
  });

  test("a required scoped Actor asset failure rejects ready and fails startup", async () => {
    const { loader, reject } = controllableImageLoader();
    const handle = run(
      defineGame(({ Actor }) => {
        void new Actor("missing.svg");
        return { draw() {} };
      }),
      {
        autostart: false,
        canvas: canvas(),
        loaders: { images: loader },
        storage: new MemoryAdapter(),
      },
    );

    reject("missing.svg", new Error("404"));
    await expect(handle.ready).rejects.toThrow();
    await handle.done;
    expect(handle.state).toBe("failed");
    expect(handle.failure?.phase).toBe("startup");
  });

  test("a preload failure does not become an unhandled rejection when the host never awaits handle.ready", async () => {
    const { loader, reject } = controllableImageLoader();
    const diagnostics: RuntimeDiagnostic[] = [];
    let unhandled: unknown;
    const onUnhandledRejection = (reason: unknown) => {
      unhandled = reason;
    };
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const handle = run(
        defineGame(({ Actor }) => {
          void new Actor("missing.svg");
          return { draw() {} };
        }),
        {
          autostart: false,
          canvas: canvas(),
          loaders: { images: loader },
          storage: new MemoryAdapter(),
          diagnostics: (diagnostic) => diagnostics.push(diagnostic),
        },
      );

      // The host (deliberately) never touches `handle.ready`.
      reject("missing.svg", new Error("404"));

      // Give the failed preload's rejection, and any (incorrect) global
      // unhandled-rejection reporting, time to surface.
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));

      expect(unhandled).toBeUndefined();
      expect(handle.state).toBe("failed");
      expect(
        diagnostics.some(
          (diagnostic) =>
            diagnostic.severity === "error" && diagnostic.phase === "startup",
        ),
      ).toBe(true);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  test("routes a late Actor sprite-load failure through the run's diagnostics instead of swallowing it silently", async () => {
    // A loader that is not registered with the runtime at all (neither the
    // context-owned loader nor the package-level singleton), matching an
    // Actor constructed with an explicit `imageLoader`. No preload/late
    // asset gate ever watches it, so Actor's own promise handling is the
    // only channel that can report a failure once `ready` has resolved.
    const standalone = controllableImageLoader();
    standalone.loader.define("start.svg", surface(4, 4));
    const diagnostics: RuntimeDiagnostic[] = [];
    let unhandled: unknown;
    const onUnhandledRejection = (reason: unknown) => {
      unhandled = reason;
    };
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      const handle = run(
        defineGame(({ Actor }) => {
          const hero = new Actor("start.svg", [0, 0], {
            imageLoader: standalone.loader,
          });
          let swapped = false;
          return {
            update() {
              // Reassigning inside update() so the load is kicked off
              // while this run's context is ambiently active, matching how
              // a real game swaps sprites mid-play.
              if (!swapped) {
                hero.image = "missing.svg";
                swapped = true;
              }
            },
            draw() {},
          };
        }),
        {
          autostart: false,
          canvas: canvas(),
          storage: new MemoryAdapter(),
          diagnostics: (diagnostic) => diagnostics.push(diagnostic),
        },
      );

      await handle.ready; // "start.svg" is already cached via define()

      handle.step(0); // update() swaps to the missing image
      standalone.reject("missing.svg", new Error("404"));

      await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));

      expect(unhandled).toBeUndefined();
      expect(handle.state).not.toBe("failed");
      expect(
        diagnostics.some(
          (diagnostic) =>
            diagnostic.severity === "warning" &&
            diagnostic.phase === "asset" &&
            diagnostic.message.includes("missing.svg"),
        ),
      ).toBe(true);
      handle.stop();
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  test("a late required image failure crosses the runtime asset boundary", async () => {
    const { loader, reject } = controllableImageLoader();
    let requested = false;
    const handle = run(
      defineGame(({ images }) => ({
        update() {
          if (requested) return;
          requested = true;
          void images.load("missing.svg").catch(() => undefined);
        },
      })),
      {
        autostart: false,
        canvas: canvas(),
        loaders: { images: loader },
        storage: new MemoryAdapter(),
      },
    );
    await handle.ready;

    handle.step(0);
    reject("missing.svg", new Error("late 404"));
    await handle.done;

    expect(handle.state).toBe("failed");
    expect(handle.failure?.phase).toBe("asset");
  });

  test("blur clears held keys and mouse release is captured outside the canvas", async () => {
    const target = canvas();
    const outer = new EventTarget();
    let mouseUps = 0;
    const handle = run(
      {
        onMouseUp(button: unknown) {
          if (button === 1) mouseUps += 1;
        },
      },
      {
        autostart: false,
        canvas: target,
        keyboardTarget: outer,
        storage: new MemoryAdapter(),
      },
    );
    await handle.ready;

    outer.dispatchEvent(keyEvent("keydown", "ArrowLeft", "ArrowLeft"));
    expect(handle.keyboard.left).toBe(true);
    outer.dispatchEvent(new Event("blur"));
    expect(handle.keyboard.left).toBe(false);

    target.dispatchEvent(mouseEvent("mousedown"));
    outer.dispatchEvent(mouseEvent("mouseup"));
    expect(mouseUps).toBe(1);
    await handle.dispose();
  });

  test("a release over the canvas dispatches even with a detached, unrelated keyboardTarget", async () => {
    const target = canvas();
    const unrelated = new EventTarget();
    let mouseUps = 0;
    const handle = run(
      {
        onMouseUp(button: unknown) {
          if (button === 1) mouseUps += 1;
        },
      },
      {
        autostart: false,
        canvas: target,
        keyboardTarget: unrelated,
        storage: new MemoryAdapter(),
      },
    );
    await handle.ready;

    target.dispatchEvent(mouseEvent("mousedown"));
    target.dispatchEvent(mouseEvent("mouseup"));
    expect(mouseUps).toBe(1);
    await handle.dispose();
  });

  test("a created canvas mounts in container and is removed during disposal", async () => {
    const originalDocument = globalThis.document;
    const createdCanvas = new MockCanvas();
    let appended: unknown = null;
    const fakeDocument = Object.assign(new EventTarget(), {
      body: { append() {} },
      createElement: () => createdCanvas,
      visibilityState: "visible",
      title: "",
      querySelector: () => null,
      head: { append() {} },
    });
    const container = {
      append(node: unknown) {
        appended = node;
      },
    } as unknown as HTMLElement;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: fakeDocument,
    });

    try {
      const handle = run(
        { draw() {} },
        { autostart: false, container, storage: new MemoryAdapter() },
      );
      expect(appended).toBe(createdCanvas);
      await handle.dispose();
      expect(createdCanvas.removed).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  });

  describe("a run started from a script in the page's <head>", () => {
    function pageStillLoading(readyState = "loading") {
      const createdCanvas = new MockCanvas();
      const appended: unknown[] = [];
      const fakeDocument = Object.assign(new EventTarget(), {
        body: null as { append(node: unknown): void } | null,
        readyState,
        createElement: () => createdCanvas,
        visibilityState: "visible",
        title: "",
        querySelector: () => null,
        head: { append() {} },
      });
      const originalDocument = globalThis.document;
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: fakeDocument,
      });
      return {
        createdCanvas,
        appended,
        /** The parser reaches <body> and finishes reading the page. */
        finishLoading() {
          fakeDocument.body = { append: (node) => appended.push(node) };
          fakeDocument.readyState = "interactive";
          fakeDocument.dispatchEvent(new Event("DOMContentLoaded"));
        },
        restore() {
          Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: originalDocument,
          });
        },
      };
    }

    test("starts at once, and its canvas joins the page's <body> once there is one", async () => {
      const page = pageStillLoading();
      try {
        let draws = 0;
        const handle = run(
          {
            draw() {
              draws += 1;
            },
          },
          { autostart: false, storage: new MemoryAdapter() },
        );
        await handle.ready;
        handle.step(0);
        expect(draws).toBe(1);
        expect(page.appended).toEqual([]);

        page.finishLoading();
        await Promise.resolve();
        expect(page.appended).toEqual([page.createdCanvas]);
        expect(handle.state).not.toBe("failed");
        await handle.dispose();
        expect(page.createdCanvas.removed).toBe(true);
      } finally {
        page.restore();
      }
    });

    test("a run stopped before the page is read never adds its canvas", async () => {
      const page = pageStillLoading();
      try {
        const handle = run(
          { draw() {} },
          { autostart: false, storage: new MemoryAdapter() },
        );
        await handle.dispose();
        page.finishLoading();
        expect(page.appended).toEqual([]);
      } finally {
        page.restore();
      }
    });

    test("a page that has been read but has no <body> gets an error that says so", () => {
      const page = pageStillLoading("complete");
      try {
        expect(() =>
          run(
            { draw() {} },
            { autostart: false, storage: new MemoryAdapter() },
          ),
        ).toThrow(
          "run() has nowhere to put the game: the page has no <body>. Pass it a canvas or a container.",
        );
      } finally {
        page.restore();
      }
    });
  });

  test("the keys a browser scrolls with stay with the game, apart from typing and shortcuts", () => {
    const target = new EventTarget();
    const handle = run(
      { draw() {} },
      {
        autostart: false,
        canvas: canvas(),
        keyboardTarget: target,
        storage: new MemoryAdapter(),
      },
    );
    const press = (
      code: string,
      extra: { ctrlKey?: boolean; from?: { tagName: string } } = {},
    ) => {
      const event = new Event("keydown", { cancelable: true });
      Object.defineProperties(event, {
        code: { value: code },
        key: { value: code === "Space" ? " " : code },
        ctrlKey: { value: extra.ctrlKey ?? false },
        target: { value: extra.from ?? target },
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press("ArrowDown")).toBe(true);
    expect(press("Space")).toBe(true);
    expect(press("KeyA")).toBe(false);
    expect(press("ArrowDown", { ctrlKey: true })).toBe(false);
    expect(press("Space", { from: { tagName: "INPUT" } })).toBe(false);
    handle.stop();
  });

  describe("with no diagnostics callback, problems go to the console", () => {
    function captureConsole() {
      const original = { warn: console.warn, error: console.error };
      const lines: { level: "warn" | "error"; text: string }[] = [];
      console.warn = (text: string) => lines.push({ level: "warn", text });
      console.error = (text: string) => lines.push({ level: "error", text });
      return {
        lines,
        restore() {
          console.warn = original.warn;
          console.error = original.error;
        },
      };
    }

    test("a warning is a console warning, and a failure a console error with its line", async () => {
      const output = captureConsole();
      try {
        const handle = run(
          [
            "function updte() {}",
            "function draw() {",
            '  screen.fil("navy");',
            "}",
          ].join("\n"),
          { autostart: false, canvas: canvas(), storage: new MemoryAdapter() },
        );
        await handle.ready;
        handle.step(0);
        await handle.done;

        expect(output.lines).toEqual([
          {
            level: "warn",
            text: expect.stringMatching(/^js-game-zero: .*updte/),
          },
          {
            level: "error",
            text: "js-game-zero: draw failed: screen.fil doesn't exist. Did you mean screen.fill? (line 3)",
          },
        ]);
      } finally {
        output.restore();
      }
    });

    test("a failure at startup is thrown, not also logged", () => {
      const output = captureConsole();
      try {
        expect(() =>
          run("function draw(x) {}", {
            autostart: false,
            canvas: canvas(),
            storage: new MemoryAdapter(),
          }),
        ).toThrow("draw() must not take any arguments.");
        expect(output.lines.filter((line) => line.level === "error")).toEqual(
          [],
        );
      } finally {
        output.restore();
      }
    });

    test("an image the game needs that fails to load is logged, since nothing throws it", async () => {
      const output = captureConsole();
      try {
        const { loader, reject } = controllableImageLoader();
        const handle = run(
          defineGame(({ Actor }) => {
            void new Actor("missing.svg");
            return { draw() {} };
          }),
          {
            autostart: false,
            canvas: canvas(),
            loaders: { images: loader },
            storage: new MemoryAdapter(),
          },
        );
        reject("missing.svg", new Error("404"));
        await handle.ready.catch(() => {});
        await handle.done;

        expect(handle.failure?.phase).toBe("startup");
        expect(output.lines).toContainEqual({
          level: "error",
          text: expect.stringMatching(/^js-game-zero: startup failed: /),
        });
      } finally {
        output.restore();
      }
    });

    test("a diagnostics callback takes them instead", async () => {
      const output = captureConsole();
      try {
        const reported: RuntimeDiagnostic[] = [];
        const handle = run("function updte() {}\nfunction draw() { boom(); }", {
          autostart: false,
          canvas: canvas(),
          storage: new MemoryAdapter(),
          diagnostics: (diagnostic) => reported.push(diagnostic),
        });
        await handle.ready;
        handle.step(0);
        await handle.done;
        expect(reported.map((diagnostic) => diagnostic.severity)).toEqual([
          "warning",
          "error",
        ]);
        expect(output.lines).toEqual([]);
      } finally {
        output.restore();
      }
    });
  });

  test("a late audio load never freezes update or drawing", async () => {
    let resolveSound = (_asset: SoundAsset): void => {};
    const soundLoader = createSoundLoader({
      projectId: "audio_gate",
      loadAsset: () =>
        new Promise<SoundAsset>((resolve) => {
          resolveSound = resolve;
        }),
    });
    let draws = 0;
    let started = false;
    const handle = run(
      defineGame(({ sounds }) => ({
        update() {
          if (started) return;
          started = true;
          void sounds.load("beep.ogg");
        },
        draw() {
          draws += 1;
        },
      })),
      {
        autostart: false,
        canvas: canvas(),
        loaders: { sounds: soundLoader },
        storage: new MemoryAdapter(),
      },
    );
    await handle.ready;

    handle.step(0.1);
    handle.step(0.1);
    expect(soundLoader.pendingCount()).toBe(1);
    expect(draws).toBe(2);

    resolveSound({
      kind: "sound",
      name: "beep.ogg",
      url: "/beep.ogg",
      play() {},
      loop() {},
      stop() {},
      getLength: () => 0,
      setVolume() {},
      getVolume: () => 1,
    });
    await soundLoader.waitForIdle();
    await handle.dispose();
  });

  test("drains repeated sound-load failures every frame instead of letting them pile up unboundedly", async () => {
    const soundLoader = createSoundLoader({
      projectId: "audio_gate",
      loadAsset: async () => {
        throw new Error("missing sound");
      },
    });
    const diagnostics: RuntimeDiagnostic[] = [];
    let draws = 0;
    const handle = run(
      defineGame(({ sounds }) => ({
        update() {
          // A game retrying a permanently-missing asset on every tick (e.g.
          // driven by a timer) must not freeze drawing or leak failures.
          void sounds.load("missing.wav").catch(() => undefined);
        },
        draw() {
          draws += 1;
        },
      })),
      {
        autostart: false,
        canvas: canvas(),
        loaders: { sounds: soundLoader },
        storage: new MemoryAdapter(),
        diagnostics: (diagnostic) => diagnostics.push(diagnostic),
      },
    );
    await handle.ready;

    for (let index = 0; index < 40; index += 1) {
      handle.step(0.1);
      // Let each tick's load rejection and the runtime's per-frame drain
      // settle before the next tick starts a fresh retry.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Audio failures never gate drawing, and never fail the run.
    expect(draws).toBe(40);
    expect(handle.state).toBe("running");
    // The runtime observed and reported the failures via diagnostics rather
    // than only letting them silently accumulate in the loader.
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.phase === "asset" && diagnostic.severity === "warning",
      ),
    ).toBe(true);
    // Once drained each frame, the loader's own failure buffer is not left
    // holding 40 retries' worth of errors.
    expect(soundLoader.pendingCount()).toBe(0);
    await expect(soundLoader.waitForIdle()).resolves.toBeUndefined();

    await handle.dispose();
  });
});

describe("runtime error lines", () => {
  test("a hook that throws reports the source line it threw from", () => {
    const target = canvas();
    const diagnostics: RuntimeDiagnostic[] = [];
    const handle = run(
      `WIDTH = 320;
HEIGHT = 180;
let cars = [];
function update(dt) {
  cars.splice(0, 1);
  cars[0].x += dt;
}
function draw() {}
`,
      {
        autostart: false,
        canvas: target,
        diagnostics: (diagnostic) => diagnostics.push(diagnostic),
        storage: new MemoryAdapter(),
      },
    );
    handle.step(0.1);
    const failure = diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "runtime-error" && diagnostic.phase === "update",
    );
    expect(failure?.message).toContain("update failed");
    expect(failure?.line).toBe(6);
    expect(handle.failure?.line).toBe(6);
  });

  test("an error thrown at the top level reports its line at startup", () => {
    const target = canvas();
    const diagnostics: RuntimeDiagnostic[] = [];
    expect(() =>
      run(
        `WIDTH = 320;
const lanes = [];
lanes[3].x = 1;
function draw() {}
`,
        {
          autostart: false,
          canvas: target,
          diagnostics: (diagnostic) => diagnostics.push(diagnostic),
          storage: new MemoryAdapter(),
        },
      ),
    ).toThrow();
    const failure = diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "runtime-error" && diagnostic.phase === "startup",
    );
    expect(failure?.message).toContain("startup failed");
    expect(failure?.line).toBe(3);
  });
});

describe("beginner mistakes in zero-boilerplate games", () => {
  function start(source: string) {
    const diagnostics: RuntimeDiagnostic[] = [];
    const keyboardTarget = new EventTarget();
    const target = canvas();
    const handle = run(source, {
      autostart: false,
      canvas: target,
      keyboardTarget,
      diagnostics: (diagnostic) => diagnostics.push(diagnostic),
      storage: new MemoryAdapter(),
    });
    return { handle, diagnostics, keyboardTarget, target };
  }

  function startupError(source: string): string {
    try {
      start(source);
    } catch (error) {
      return `${(error as Error).name}: ${(error as Error).message}`;
    }
    throw new Error("expected the game to fail at startup");
  }

  test("camelCase input hooks run in a game file", async () => {
    const { handle, keyboardTarget, target } = start(`
let pressed = null;
let clicked = null;
function onKeyDown(key) { pressed = key; }
function onMouseDown(pos) { clicked = pos; }
function draw() {}
`);
    keyboardTarget.dispatchEvent(keyEvent("keydown", "Space", " "));
    target.dispatchEvent(mouseEvent("mousedown"));
    const inspector = getGameInspector(handle);
    expect(inspector?.read("pressed")).toBe(keys.SPACE);
    expect(inspector?.read("clicked")).toEqual([4, 6]);
    await handle.dispose();
  });

  test("a hook parameter with another name still receives its value, with a hint", async () => {
    const { handle, diagnostics, target } = start(`
let clicked = null;
function onMouseDown(position) { clicked = position; }
function draw() {}
`);
    target.dispatchEvent(mouseEvent("mousedown"));
    expect(getGameInspector(handle)?.read("clicked")).toEqual([4, 6]);
    expect(
      diagnostics.find((diagnostic) => diagnostic.code === "hook-parameter"),
    ).toMatchObject({ name: "onMouseDown", suggestion: "pos" });
    await handle.dispose();
  });

  test("a misspelled name fails as not defined, with a suggestion and line", () => {
    const { handle, diagnostics } = start(`WIDTH = 320;
let player = { x: 1 };
function update() {
  playr.x += 1;
}
function draw() {
  scren.fill("red");
}
`);
    handle.step(0.1);
    expect(handle.failure?.message).toBe(
      "playr is not defined. Did you mean player?",
    );
    expect(handle.failure?.cause).toBeInstanceOf(ReferenceError);
    expect(handle.failure?.line).toBe(4);
    expect(
      diagnostics.some((diagnostic) =>
        diagnostic.message.includes("playr is not defined"),
      ),
    ).toBe(true);
    expect(startupError(`scren.fill("red");`)).toBe(
      "ReferenceError: scren is not defined. Did you mean screen?",
    );
  });

  test("browser APIs games can't use point at what to use instead", () => {
    expect(startupError("setTimeout(() => {}, 1000);")).toContain(
      "setTimeout isn't available in js-game-zero games. Use clock.schedule(callback, seconds) instead.",
    );
    expect(startupError("document.body;")).toContain(
      "document isn't available in js-game-zero games.",
    );
    expect(startupError('localStorage.setItem("a", "1");')).toContain(
      "Use storage instead",
    );
  });

  test("a game written in camelCase runs", async () => {
    const { handle } = start(`WIDTH = 320;
HEIGHT = 180;
let ticks = 0;
let space = keys.SPACE;
let mods = keymods.SHIFT;
let circle = typeof screen.draw.filledCircle;
clock.scheduleInterval(() => { ticks += 1; }, 0.05);
function draw() {
  screen.fill("black");
}
`);
    handle.step(0.1);
    expect(handle.failure).toBeNull();
    const inspector = getGameInspector(handle);
    expect(inspector?.read("ticks")).toBeGreaterThan(0);
    expect(inspector?.read("space")).toBe(keys.SPACE);
    expect(inspector?.read("mods")).toBe(keymods.SHIFT);
    expect(inspector?.read("circle")).toBe("function");
    await handle.dispose();
  });

  test("Pygame Zero's snake_case names fail where they're written, naming the camelCase one", async () => {
    expect(startupError("random_int(1, 6);")).toBe(
      "ReferenceError: random_int is not defined. Did you mean randomInt?",
    );
    expect(startupError("clock.schedule_interval(() => {}, 1);")).toBe(
      "TypeError: clock.schedule_interval doesn't exist. Did you mean clock.scheduleInterval?",
    );
    expect(startupError('screen.draw.filled_circle([1, 1], 2, "red");')).toBe(
      "TypeError: screen.draw.filled_circle doesn't exist. Did you mean screen.draw.filledCircle?",
    );
    expect(
      startupError('let ship = new Actor("hero"); ship.angle_to([1, 1]);'),
    ).toBe(
      "TypeError: actor.angle_to doesn't exist. Did you mean actor.angleTo?",
    );
    expect(startupError("music.set_volume(0.5);")).toBe(
      "TypeError: music.set_volume doesn't exist. Did you mean music.setVolume?",
    );
    expect(startupError("keys.space;")).toBe(
      "TypeError: keys.space doesn't exist. Did you mean keys.SPACE?",
    );

    // A snake_case hook is never called, and the diagnostic says so.
    const { handle, diagnostics, target } = start(`
let clicked = null;
function on_mouse_down(pos) { clicked = pos; }
function draw() {}
`);
    target.dispatchEvent(mouseEvent("mousedown"));
    expect(getGameInspector(handle)?.read("clicked")).toBeNull();
    expect(
      diagnostics.find((diagnostic) => diagnostic.code === "hook-typo"),
    ).toMatchObject({
      name: "on_mouse_down",
      suggestion: "onMouseDown",
      message:
        "on_mouse_down is never called. Hooks are named in camelCase, so rename it to onMouseDown.",
    });
    await handle.dispose();
  });

  test("a misspelled library name fails with a suggestion and line", () => {
    const { handle } = start(`WIDTH = 320;
function draw() {
  screen.draw.cirlce([10, 10], 4, "gold");
}
`);
    handle.step(0.1);
    expect(handle.failure?.message).toBe(
      "screen.draw.cirlce doesn't exist. Did you mean screen.draw.circle?",
    );
    expect(handle.failure?.line).toBe(3);
    expect(startupError("screen.drawRect([0, 0, 4, 4], 'red');")).toContain(
      "Did you mean screen.draw.rect?",
    );
  });

  test("game files get the short drawing calls and rgb, with typo suggestions", async () => {
    const { handle } = start(`WIDTH = 320;
const kinds = [screen.circle, screen.rect, screen.triangle, screen.line].map(
  (call) => typeof call,
);
const mix = rgb(255, 140, 105);
function draw() {
  screen.circel(200, 150, 25, mix);
}
`);
    const inspector = getGameInspector(handle);
    expect(inspector?.read("kinds")).toEqual([
      "function",
      "function",
      "function",
      "function",
    ]);
    expect(inspector?.read("mix")).toEqual([255, 140, 105]);
    handle.step(0.1);
    expect(handle.failure?.message).toBe(
      "screen.circel doesn't exist. Did you mean screen.circle?",
    );
    expect(handle.failure?.line).toBe(7);
    expect(startupError("screen.draw.triangle(0, 0, 4, 0, 2, 3);")).toContain(
      "screen.draw.triangle doesn't exist. Did you mean screen.triangle?",
    );
    expect(startupError("rgb(255, 140);")).toBe(
      "TypeError: rgb is missing blue: rgb(red, green, blue), each from 0 to 255.",
    );
    await handle.dispose();
  });

  test("a capitalised class name, or a helper, names what was written in its errors", async () => {
    const { handle } = start(`const made = new Clock();
const kind = typeof Screen;
function draw() {
  Screen.fill("navy");
}
`);
    const inspector = getGameInspector(handle);
    // The classes themselves still work.
    expect(inspector?.read("kind")).toBe("function");
    expect(inspector?.read("made")).toBeDefined();
    handle.step(0.1);
    expect(handle.failure?.message).toBe(
      "Screen.fill doesn't exist. Did you mean screen.fill?",
    );
    expect(startupError("Clock.scheduleInterval(() => {}, 1);")).toContain(
      "Clock.scheduleInterval doesn't exist. Did you mean clock.scheduleInterval?",
    );
    expect(startupError("Clock.schedule_interval(() => {}, 1);")).toContain(
      "Clock.schedule_interval doesn't exist. Did you mean clock.scheduleInterval?",
    );
    expect(startupError('Storage.get("best");')).toContain(
      "Storage.get doesn't exist. Did you mean storage.get?",
    );
    // Helpers name themselves in their errors.
    expect(startupError("randomInt(400, 0);")).toContain(
      "randomInt(400, 0) has no whole numbers to pick from",
    );
    expect(startupError("randomChoice([]);")).toContain(
      "randomChoice needs a list with at least one item.",
    );
    await handle.dispose();
  });

  test("game files get randomInt, randomChoice, clamp and a live mouse, down while held", async () => {
    const { handle, target } = start(`WIDTH = 320;
HEIGHT = 180;
const roll = randomInt(1, 6);
const pick = randomChoice(["a", "b"]);
const kept = clamp(500, 0, WIDTH);
let start = mouse.pos;
let seen = null;
let held = false;
let down = false;
function update() {
  seen = [mouse.x, mouse.y];
  held = mouse.buttons.has(mouse.LEFT);
  down = mouse.down;
}
function draw() {}
`);
    const inspector = getGameInspector(handle);
    expect(inspector?.read("roll")).toBeGreaterThanOrEqual(1);
    expect(inspector?.read("roll")).toBeLessThanOrEqual(6);
    expect(["a", "b"]).toContain(inspector?.read("pick") as string);
    expect(inspector?.read("kept")).toBe(320);
    expect(inspector?.read("start")).toEqual([160, 90]);

    const move = new Event("mousemove");
    Object.defineProperties(move, {
      clientX: { value: 40 },
      clientY: { value: 30 },
      buttons: { value: 0 },
    });
    target.dispatchEvent(move);
    handle.step(0.1);
    expect(inspector?.read("down")).toBe(false);
    target.dispatchEvent(mouseEvent("mousedown"));
    handle.step(0.1);
    expect(inspector?.read("seen")).toEqual([4, 6]);
    expect(inspector?.read("held")).toBe(true);
    expect(inspector?.read("down")).toBe(true);
    target.dispatchEvent(mouseEvent("mouseup"));
    handle.step(0.1);
    expect(inspector?.read("down")).toBe(false);
    await handle.dispose();
  });

  test("an Actor's images animate on the game's own clock", async () => {
    const images = createImageLoader({
      projectId: "frames",
      loadAsset: async () => surface(),
    });
    for (const name of ["coin_0", "coin_1", "coin_2"]) {
      images.define(`${name}.png`, surface());
    }
    const handle = run(
      `WIDTH = 320;
HEIGHT = 180;
const coin = new Actor("coin_0", { images: ["coin_0", "coin_1", "coin_2"], fps: 10, loop: false });
let frames = [];
function update() { frames.push(coin.frame); }
function draw() {}
`,
      {
        autostart: false,
        canvas: canvas(),
        storage: new MemoryAdapter(),
        loaders: { images },
      },
    );
    await handle.ready;
    for (let step = 0; step < 4; step += 1) handle.step(0.1);
    const inspector = getGameInspector(handle);
    expect(inspector?.read("frames")).toEqual([1, 2, 2, 2]);
    expect((inspector?.read("coin") as { finished: boolean }).finished).toBe(
      true,
    );
    await handle.dispose();
  });

  test("typeof checks, optional hooks and common builtins keep working", async () => {
    const { handle } = start(`
const missing = typeof somethingElse;
const checks = [isNaN(NaN), isFinite(1), typeof Symbol.iterator];
function draw() {}
`);
    const inspector = getGameInspector(handle);
    expect(inspector?.read("missing")).toBe("undefined");
    expect(inspector?.read("checks")).toEqual([true, true, "symbol"]);
    handle.step(0.1);
    expect(handle.failure).toBeNull();
    await handle.dispose();
  });
});

/**
 * Stands in for HTMLImageElement while `body` runs, with just enough of it
 * for the browser image loader: every image is 24×12 and loads on the next
 * microtask, except a URL with "broken" in it, which fails. `body` gets the
 * URLs requested so far.
 */
async function withFakeImages(
  body: (requested: readonly string[]) => Promise<void>,
): Promise<void> {
  const requested: string[] = [];
  class FakeImage {
    decoding = "";
    readonly naturalWidth = 24;
    readonly naturalHeight = 12;
    private readonly listeners = new Map<string, () => void>();
    addEventListener(type: string, listener: () => void): void {
      this.listeners.set(type, listener);
    }
    set src(url: string) {
      requested.push(url);
      const outcome = url.includes("broken") ? "error" : "load";
      queueMicrotask(() => this.listeners.get(outcome)?.());
    }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: FakeImage,
  });
  try {
    await body(requested);
  } finally {
    if (original) Object.defineProperty(globalThis, "Image", original);
    else Reflect.deleteProperty(globalThis, "Image");
  }
}

describe("assets from a map (assetUrls)", () => {
  test("an Actor's image loads from its URL in assetUrls, with no asset server", async () => {
    await withFakeImages(async (requested) => {
      const assetUrls = { "images/cat.svg": "data:image/svg+xml,cat" };
      const handle = run(
        `
let cat = new Actor("cat", [50, 40]);
function draw() {
  storage.set("size", [cat.width, cat.height]);
}
`,
        {
          autostart: false,
          canvas: canvas(),
          storage: new MemoryAdapter(),
          assetUrls,
        },
      );
      await handle.ready;
      handle.step(0.1);
      expect(handle.storage.get("size")).toEqual([24, 12]);
      // Only the listed candidate is requested, from the map.
      expect(requested).toEqual(["data:image/svg+xml,cat"]);
      expect(handle.loaders.images.assetUrls).toEqual(assetUrls);
      await handle.dispose();
    });
  });

  test("loadImages decodes every image in a map by its name, leaving out failures", async () => {
    await withFakeImages(async (requested) => {
      const images = await loadImages({
        "images/cat.svg": "data:image/svg+xml,cat",
        "images/tiles/grass.png": "blob:grass",
        "images/broken.png": "blob:broken",
        "sounds/pop.wav": "data:audio/wav,pop",
      });
      expect(Object.keys(images).sort()).toEqual([
        "cat.svg",
        "tiles/grass.png",
      ]);
      expect(images["cat.svg"]?.getSize()).toEqual([24, 12]);
      expect([...requested].sort()).toEqual([
        "blob:broken",
        "blob:grass",
        "data:image/svg+xml,cat",
      ]);
    });
  });

  test("an image a hook names that the map doesn't list fails the game", async () => {
    await withFakeImages(async () => {
      // The map has no ghost, so its load fails at once, before any frame
      // could see it loading.
      const handle = run(
        `
function draw() {
  screen.blit("ghost", [0, 0]);
}
`,
        {
          autostart: false,
          canvas: canvas(),
          storage: new MemoryAdapter(),
          assetUrls: { "images/cat.svg": "data:image/svg+xml,cat" },
        },
      );
      await handle.ready;
      handle.step(0);
      // As between two frames in a browser, the load fails in the meantime.
      await Bun.sleep(0);
      handle.step(0);
      await Promise.race([handle.done, Bun.sleep(50)]);

      expect(handle.state).toBe("failed");
      expect(handle.failure?.phase).toBe("asset");
      expect(handle.failure?.message).toContain("ghost");
    });
  });

  test("images from loadImages are ready while a game's top level runs", async () => {
    await withFakeImages(async () => {
      const assetUrls = { "images/box.svg": "data:image/svg+xml,box" };
      // Moving an Actor placed by an edge needs its size: with the image
      // still loading, it would be placed as if it were 0×0.
      const handle = run(
        `
let box = new Actor("box", { midBottom: [100, 180] });
box.x = 160;
let atStart = [box.width, box.height, box.bottom];
`,
        {
          autostart: false,
          canvas: canvas(),
          storage: new MemoryAdapter(),
          assetUrls,
          preloadedAssets: { images: await loadImages(assetUrls) },
        },
      );
      await handle.ready;
      handle.step(0);
      const inspector = getGameInspector(handle)!;
      expect(inspector.read("atStart")).toEqual([24, 12, 180]);
      expect(inspector.read("box.midBottom")).toEqual([160, 180]);
      await handle.dispose();
    });
  });
});
