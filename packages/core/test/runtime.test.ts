import { describe, expect, test } from "bun:test";
import {
  collectRuntimeDiagnostics,
  clock,
  createImageLoader,
  images as globalImages,
  ImageSurface,
  keyboard,
  keys,
  run,
  screen,
  type AssetLoader,
  type DrawableImage,
  type RuntimeCanvas,
  type RuntimeDiagnostic,
  type SurfaceLike,
} from "@js-game-zero/core";

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

  getContext(contextId: "2d"): CanvasRenderingContext2D | null {
    return contextId === "2d"
      ? (this.context as unknown as CanvasRenderingContext2D)
      : null;
  }

  getBoundingClientRect(): { left: number; top: number } {
    return { left: 0, top: 0 };
  }
}

class MemoryAdapter {
  readonly path = "memory";
  text: string | null = null;

  load(): string | null {
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

describe("runtime zero-boilerplate mode", () => {
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

function on_key_down(key) {
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

  test("preloads assets for PGZero-style image property access", async () => {
    const target = canvas();
    const handle = run(
      `
let loadedSize = images.player.get_size();

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
        { draw: (context: unknown) => context },
        { autostart: false, canvas: canvas() },
      ),
    ).toThrow(/draw\(\) must not take any arguments\./);
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

  test("reports duplicate run configuration and duplicate hook aliases", () => {
    const diagnostics = collectRuntimeDiagnostics(
      {
        WIDTH: 100,
        draw(unused: unknown) {
          return unused;
        },
        on_key_down() {},
        onKeyDown() {},
      },
      {
        WIDTH: 120,
      },
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "duplicate-config",
    );
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "duplicate-hook-alias",
    );
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
  storage.set("size", heroRef.get_size());
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

  test("also gates on the package-level singleton loaders used by plain import-mode Actor/images code", async () => {
    const target = canvas();
    // Simulate `new Actor("ghost.svg")` constructed at import-mode
    // top-level code, which defaults to the singleton `images` loader
    // (not the runtime's context-scoped loader).
    const probeName = "jgz_runtime_gate_probe.svg";
    const pendingLoad = globalImages.load(probeName).catch(() => undefined);
    expect(globalImages.pendingCount()).toBeGreaterThan(0);

    let drew = false;
    const handle = run(
      { draw: () => (drew = true) },
      { autostart: false, canvas: target, storage: new MemoryAdapter() },
    );

    handle.step(0);
    expect(drew).toBe(false);

    await pendingLoad;
    await globalImages.waitForIdle();

    handle.step(0);
    expect(drew).toBe(true);
    handle.stop();
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
