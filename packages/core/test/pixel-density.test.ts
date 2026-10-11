import { afterEach, describe, expect, test } from "bun:test";
import {
  defineGame,
  run,
  Screen,
  type RuntimeCanvas,
} from "@js-game-zero/core";
import {
  collectRuntimeDiagnostics,
  getGameInspector,
  type RuntimeDiagnostic,
} from "@js-game-zero/core/host";
import {
  MAX_AUTO_PIXEL_DENSITY,
  MAX_CANVAS_PIXELS,
  resolvePixelDensity,
} from "../src/pixel-density";
import { resizeScreen, syncScreen } from "../src/rendering";

type Call = [string, ...unknown[]];

/** Records drawing calls and tracks the transform like a real 2D context. */
class MockContext {
  readonly calls: Call[] = [];
  fillStyle: unknown = "";
  globalAlpha = 1;
  transform = [1, 0, 0, 1, 0, 0];

  setTransform(...matrix: number[]): void {
    this.transform = matrix;
    this.calls.push(["setTransform", ...matrix]);
  }

  getTransform(): { isIdentity: boolean } {
    const [a, b, c, d, e, f] = this.transform;
    return {
      isIdentity: a === 1 && b === 0 && c === 0 && d === 1 && !e && !f,
    };
  }

  save(): void {}
  restore(): void {}
  fillRect(...args: unknown[]): void {
    this.calls.push(["fillRect", ...args]);
  }
  drawImage(...args: unknown[]): void {
    this.calls.push(["drawImage", ...args]);
  }
}

/** A canvas whose size resets its context's transform, as a real one does. */
class MockCanvas extends EventTarget {
  #width = 300;
  #height = 150;
  tabIndex = 0;
  readonly context = new MockContext();

  get width(): number {
    return this.#width;
  }
  set width(value: number) {
    this.#width = value;
    this.context.transform = [1, 0, 0, 1, 0, 0];
  }
  get height(): number {
    return this.#height;
  }
  set height(value: number) {
    this.#height = value;
    this.context.transform = [1, 0, 0, 1, 0, 0];
  }

  getContext(): CanvasRenderingContext2D {
    return this.context as unknown as CanvasRenderingContext2D;
  }

  /** Shown at its logical size, as the density CSS rule shows it. */
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 200, height: 120 };
  }
}

function canvas(): MockCanvas & RuntimeCanvas {
  return new MockCanvas() as MockCanvas & RuntimeCanvas;
}

function mouseDown(clientX: number, clientY: number): Event {
  const event = new Event("mousedown");
  Object.defineProperties(event, {
    button: { value: 0 },
    buttons: { value: 1 },
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  return event;
}

const originalRatio = Object.getOwnPropertyDescriptor(
  globalThis,
  "devicePixelRatio",
);

function setDeviceRatio(value: number): void {
  Object.defineProperty(globalThis, "devicePixelRatio", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (originalRatio) {
    Object.defineProperty(globalThis, "devicePixelRatio", originalRatio);
  } else {
    delete (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  }
});

describe("resolvePixelDensity", () => {
  const quiet = (): void => {};

  test("follows the device's ratio between 1 and 3", () => {
    expect(resolvePixelDensity(undefined, 360, 640, 2, quiet)).toBe(2);
    expect(resolvePixelDensity(undefined, 360, 640, 2.625, quiet)).toBe(2.625);
    expect(resolvePixelDensity(undefined, 360, 640, 4, quiet)).toBe(
      MAX_AUTO_PIXEL_DENSITY,
    );
    expect(resolvePixelDensity(undefined, 360, 640, 0.5, quiet)).toBe(1);
  });

  test("uses a game's own density as given", () => {
    expect(resolvePixelDensity(1, 360, 640, 3, quiet)).toBe(1);
    expect(resolvePixelDensity(4, 360, 640, 1, quiet)).toBe(4);
    expect(resolvePixelDensity(0.5, 360, 640, 2, quiet)).toBe(0.5);
  });

  test("keeps the canvas small enough for phones to show", () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const emit = (diagnostic: RuntimeDiagnostic) =>
      diagnostics.push(diagnostic);
    // 1920 × 1080 at 3 would be 18.7M pixels; iOS shows at most 16.7M.
    const auto = resolvePixelDensity(undefined, 1920, 1080, 3, emit);
    expect(auto).toBeLessThan(3);
    expect(
      Math.round(1920 * auto) * Math.round(1080 * auto),
    ).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(diagnostics).toEqual([]);
    // A game bigger than the limit still gets density 1, as before.
    expect(resolvePixelDensity(undefined, 5000, 5000, 2, emit)).toBe(1);
    expect(resolvePixelDensity(1, 5000, 5000, 2, emit)).toBe(1);
    expect(diagnostics).toEqual([]);

    expect(resolvePixelDensity(3, 1920, 1080, 1, emit)).toBe(auto);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "invalid-config",
        name: "PIXEL_DENSITY",
        message:
          "PIXEL_DENSITY 3 makes a 1920 × 1080 game too big a canvas for phones to show; using 2.84.",
      }),
    ]);
  });

  test("warns about a density that isn't a positive number and uses the device's", () => {
    for (const value of [0, -2, Number.NaN, Infinity, "2", null, true]) {
      const diagnostics: RuntimeDiagnostic[] = [];
      expect(
        resolvePixelDensity(value, 360, 640, 2, (diagnostic) =>
          diagnostics.push(diagnostic),
        ),
      ).toBe(2);
      expect(diagnostics).toEqual([
        expect.objectContaining({
          code: "invalid-config",
          severity: "warning",
          name: "PIXEL_DENSITY",
        }),
      ]);
    }
  });
});

describe("a dense Screen", () => {
  test("multiplies the canvas, scales drawing, and keeps logical units", () => {
    const target = canvas();
    const screen = new Screen(target);
    resizeScreen(screen, 200, 120, 2);

    expect([target.width, target.height]).toEqual([400, 240]);
    expect([screen.width, screen.height, screen.density]).toEqual([
      200, 120, 2,
    ]);
    expect(screen.bounds()).toMatchObject({ width: 200, height: 120 });
    expect(target.context.transform).toEqual([2, 0, 0, 2, 0, 0]);
    screen.clear();
    screen.rect(10, 20, 30, 40, "red");
    expect(
      target.context.calls.filter(([name]) => name === "fillRect"),
    ).toEqual([
      ["fillRect", 0, 0, 200, 120],
      ["fillRect", 10, 20, 30, 40],
    ]);
  });

  test("scales each axis by its exact ratio at a fractional density", () => {
    const target = canvas();
    const screen = new Screen(target);
    resizeScreen(screen, 393, 640, 2.75);
    expect([target.width, target.height]).toEqual([1081, 1760]);
    expect(target.context.transform).toEqual([1081 / 393, 0, 0, 2.75, 0, 0]);
  });

  test("at density 1 sizes the canvas without touching its transform", () => {
    const target = canvas();
    const screen = new Screen(target);
    resizeScreen(screen, 200, 120, 1);
    expect([target.width, target.height]).toEqual([200, 120]);
    expect(target.context.calls).toEqual([]);
  });

  test("an unsized Screen follows its canvas at density 1", () => {
    const target = canvas();
    const screen = new Screen(target);
    expect([screen.width, screen.height, screen.density]).toEqual([
      300, 150, 1,
    ]);
    target.width = 64;
    expect(screen.width).toBe(64);
  });

  test("syncScreen adopts a size set on the canvas and restores a reset scale", () => {
    const target = canvas();
    const screen = new Screen(target);
    resizeScreen(screen, 200, 120, 2);

    target.width = 300;
    syncScreen(screen);
    expect([screen.width, screen.height]).toEqual([300, 120]);
    expect([target.width, target.height]).toEqual([600, 240]);
    expect(target.context.transform).toEqual([2, 0, 0, 2, 0, 0]);

    target.height = target.height;
    expect(target.context.transform).toEqual([1, 0, 0, 1, 0, 0]);
    syncScreen(screen);
    expect(target.context.transform).toEqual([2, 0, 0, 2, 0, 0]);
    expect([screen.width, screen.height]).toEqual([300, 120]);
  });
});

describe("PIXEL_DENSITY in run()", () => {
  const game = `
WIDTH = 200;
HEIGHT = 120;
let clicked = null;
function draw() { screen.rect(0, 0, WIDTH, HEIGHT, "navy"); }
function on_mouse_down(pos) { clicked = pos; }
`;

  test("defaults to the device's ratio and keeps the mouse in logical pixels", async () => {
    setDeviceRatio(2);
    const target = canvas();
    const handle = run(game, { autostart: false, canvas: target });
    expect([target.width, target.height]).toEqual([400, 240]);
    expect([handle.screen.width, handle.screen.height]).toEqual([200, 120]);
    expect(handle.screen.density).toBe(2);

    target.dispatchEvent(mouseDown(50, 60));
    expect(getGameInspector(handle)?.read("clicked")).toEqual([50, 60]);
    await handle.dispose();
  });

  test("follows a change in the device's ratio on the next frame", async () => {
    setDeviceRatio(2);
    const target = canvas();
    const handle = run(game, { autostart: false, canvas: target });
    await handle.ready;
    handle.step(0);
    setDeviceRatio(3);
    handle.step(1 / 60);
    expect([target.width, target.height]).toEqual([600, 360]);
    expect(handle.screen.density).toBe(3);
    expect(target.context.transform).toEqual([3, 0, 0, 3, 0, 0]);
    await handle.dispose();
  });

  test("a game's PIXEL_DENSITY stays put when the device's ratio changes", async () => {
    setDeviceRatio(3);
    const target = canvas();
    const handle = run(`PIXEL_DENSITY = 1;\n${game}`, {
      autostart: false,
      canvas: target,
    });
    expect([target.width, target.height]).toEqual([200, 120]);
    await handle.ready;
    setDeviceRatio(2);
    handle.step(1 / 60);
    expect([target.width, target.height]).toEqual([200, 120]);
    await handle.dispose();
  });

  test("the run option overrides the game's, with a duplicate warning", async () => {
    const target = canvas();
    const diagnostics: RuntimeDiagnostic[] = [];
    const handle = run(`PIXEL_DENSITY = 3;\n${game}`, {
      autostart: false,
      canvas: target,
      PIXEL_DENSITY: 2,
      diagnostics: (diagnostic) => diagnostics.push(diagnostic),
    });
    expect([target.width, target.height]).toEqual([400, 240]);
    expect(
      diagnostics.filter((diagnostic) => diagnostic.name === "PIXEL_DENSITY"),
    ).toEqual([
      expect.objectContaining({
        code: "duplicate-config",
        name: "PIXEL_DENSITY",
      }),
    ]);
    await handle.dispose();
  });

  test("works in defineGame() and import mode", async () => {
    const defined = canvas();
    const first = run(
      defineGame(() => ({ WIDTH: 100, HEIGHT: 50, PIXEL_DENSITY: 2 })),
      { autostart: false, canvas: defined },
    );
    expect([defined.width, defined.height]).toEqual([200, 100]);
    await first.dispose();

    const imported = canvas();
    const second = run(
      { WIDTH: 100, HEIGHT: 50, PIXEL_DENSITY: 1.5 },
      { autostart: false, canvas: imported },
    );
    expect([imported.width, imported.height]).toEqual([150, 75]);
    expect(second.screen.width).toBe(100);
    await second.dispose();
  });

  test("an invalid PIXEL_DENSITY warns and falls back to the device's ratio", async () => {
    setDeviceRatio(2);
    const target = canvas();
    const diagnostics: RuntimeDiagnostic[] = [];
    const handle = run(`PIXEL_DENSITY = "high";\n${game}`, {
      autostart: false,
      canvas: target,
      diagnostics: (diagnostic) => diagnostics.push(diagnostic),
    });
    expect(target.width).toBe(400);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "invalid-config",
        name: "PIXEL_DENSITY",
      }),
    );
    await handle.dispose();
  });

  test("a misspelled PIXEL_DENSITY is caught as a typo", () => {
    const diagnostics = collectRuntimeDiagnostics(
      "PIXEL_DENSTY = 2;\nfunction draw() {}",
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "constant-typo",
        suggestion: "PIXEL_DENSITY",
      }),
    );
  });
});
