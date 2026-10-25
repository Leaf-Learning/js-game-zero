import { describe, expect, test } from "bun:test";
import { run, type RuntimeCanvas } from "@js-game-zero/core";
import {
  getGameInspector,
  type RuntimeDiagnostic,
} from "@js-game-zero/core/host";

class MockCanvas extends EventTarget {
  // A fresh <canvas>'s own size.
  width = 300;
  height = 150;
  tabIndex = 0;
  readonly context = {
    fillStyle: "" as unknown,
    clearRect(): void {},
    fillRect(): void {},
    drawImage(): void {},
  };

  getContext(contextId: "2d"): CanvasRenderingContext2D | null {
    return contextId === "2d"
      ? (this.context as unknown as CanvasRenderingContext2D)
      : null;
  }

  getBoundingClientRect(): { left: number; top: number } {
    return { left: 0, top: 0 };
  }

  remove(): void {}
}

class MemoryAdapter {
  readonly path = "memory";

  constructor(public text: string | null = null) {}

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

function start(source: string, adapter = new MemoryAdapter()) {
  const diagnostics: RuntimeDiagnostic[] = [];
  const handle = run(source, {
    autostart: false,
    canvas: new MockCanvas() as unknown as RuntimeCanvas,
    diagnostics: (diagnostic) => diagnostics.push(diagnostic),
    storage: adapter,
  });
  const read = (name: string) => getGameInspector(handle)?.read(name);
  return { handle, diagnostics, read };
}

function startupError(source: string): string {
  try {
    start(source);
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
  throw new Error("expected the game to fail at startup");
}

describe("a zero-boilerplate game's scope", () => {
  test("has JavaScript's standard built-ins, and a globalThis of its own", async () => {
    const { handle, read } = start(`
grid = new Float32Array(4);
bytes = new Uint8Array(new ArrayBuffer(2)).length;
view = new DataView(new ArrayBuffer(4)).byteLength;
reflected = Reflect.has({ a: 1 }, "a");
proxied = new Proxy({}, { get: () => 7 }).anything;
uri = decodeURI(encodeURI("a b"));
copy = structuredClone({ list: [1, 2] });
kinds = [URIError, EvalError, AggregateError, WeakRef, FinalizationRegistry, Function].map((type) => typeof type);
globalThis.lives = 3;
seen = [lives, globalThis.Math === Math, globalThis.screen === screen, typeof globalThis.document, "window" in globalThis, globalThis.globalThis === globalThis];
function draw() {}
`);
    expect(read("grid")).toBeInstanceOf(Float32Array);
    expect(read("bytes")).toBe(2);
    expect(read("view")).toBe(4);
    expect(read("reflected")).toBe(true);
    expect(read("proxied")).toBe(7);
    expect(read("uri")).toBe("a b");
    expect(read("copy")).toEqual({ list: [1, 2] });
    expect(read("kinds")).toEqual(Array(6).fill("function"));
    expect(read("seen")).toEqual([3, true, true, "undefined", false, true]);
    await handle.dispose();
    // The page's own globals still say what to use instead.
    expect(startupError("window.innerWidth;")).toContain(
      "window isn't available in js-game-zero games.",
    );
  });

  test("has no host APIs: createBrowserSoundAsset, KeyboardState and run", () => {
    expect(startupError("createBrowserSoundAsset;")).toContain(
      "ReferenceError: createBrowserSoundAsset is not defined.",
    );
    expect(startupError("new KeyboardState();")).toContain(
      "ReferenceError: KeyboardState is not defined.",
    );
    expect(startupError("run({ draw() {} });")).toBe(
      "ReferenceError: run isn't available in js-game-zero games. A game file runs by itself: put WIDTH, HEIGHT and hooks like function draw() {} at its top level.",
    );
  });

  test("runs animate() and new Animation() started outside a hook on the game's clock", async () => {
    const { handle, read } = start(`
box = { x: 0, y: 0 };
Promise.resolve().then(() => {
  animate(box, { x: 100, duration: 1 });
  new Animation(box, { y: 50, duration: 1 });
});
function draw() {}
`);
    await handle.ready;
    handle.step(0.5);
    handle.step(0.5);
    expect(read("box")).toEqual({ x: 100, y: 50 });
    await handle.dispose();
  });

  test("shows top-level code the screen WIDTH and HEIGHT give, as update() sees it", async () => {
    const { handle, read } = start(`
WIDTH = 400;
HEIGHT = 300;
topLevel = [screen.width, screen.height];
bounds = [...screen.bounds()];
pointer = mouse.pos;
inUpdate = null;
function update() {
  inUpdate = [screen.width, screen.height];
  WIDTH = 1000;
}
function draw() {}
`);
    expect(read("topLevel")).toEqual([400, 300]);
    expect(read("bounds")).toEqual([0, 0, 400, 300]);
    expect(read("pointer")).toEqual([200, 150]);
    handle.step(0.1);
    handle.step(0.1);
    // Setting WIDTH once the game runs changes nothing, as before.
    expect(read("inUpdate")).toEqual([400, 300]);
    await handle.dispose();

    const unsized = start("seen = [screen.width, screen.height];");
    expect(unsized.read("seen")).toEqual([800, 600]);
    await unsized.handle.dispose();

    const invalid = start("WIDTH = -5;\nseen = screen.width;");
    expect(invalid.read("seen")).toBe(800);
    expect(
      invalid.diagnostics.filter(
        (diagnostic) =>
          diagnostic.code === "invalid-config" && diagnostic.name === "WIDTH",
      ),
    ).not.toHaveLength(0);
    expect(invalid.handle.screen.width).toBe(800);
    await invalid.handle.dispose();
  });

  test("saves a change made inside a stored list when the game stops", async () => {
    const adapter = new MemoryAdapter(JSON.stringify({ highScores: [100] }));
    const { handle } = start(
      `
storage.setDefault("highScores", []);
function update() {
  if (storage.highScores.length < 2) storage.highScores.push(250);
}
function draw() {}
`,
      adapter,
    );
    await handle.ready;
    handle.step(0.016);
    await handle.dispose();
    expect(adapter.text).toBe('{"highScores":[100,250]}');
  });

  test("fails where a value storage can't save, or a callback called too soon, is given", () => {
    expect(startupError("storage.lastSpeed = 0 / 0;")).toBe(
      "JsonStorageError: NaN is not a JSON value at storage.lastSpeed",
    );
    expect(startupError("function spin(dt) {}\nclock.eachTick(spin());")).toBe(
      "TypeError: clock.eachTick needs a function to call later, but got undefined. Give the function's name without brackets: clock.eachTick(spawn), not clock.eachTick(spawn()).",
    );
  });
});
