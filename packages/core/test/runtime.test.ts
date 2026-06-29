import { describe, expect, test } from "bun:test";
import {
  collectRuntimeDiagnostics,
  keyboard,
  keys,
  run,
  screen,
  type RuntimeCanvas,
  type RuntimeDiagnostic,
} from "@js-game-zero/core";

class MockContext {
  fillStyle: unknown = "";
  clearCalls = 0;
  fillCalls = 0;

  clearRect(): void {
    this.clearCalls += 1;
  }

  fillRect(): void {
    this.fillCalls += 1;
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
    expect(keyboard.right).toBe(true);

    handle.stop();
    target.dispatchEvent(keyEvent("keydown", "ArrowRight", "ArrowRight"));
    expect(keyDowns).toBe(1);
    expect(keyboard.right).toBe(false);
    expect((globalThis as typeof globalThis & { draw?: unknown }).draw).toBe(
      undefined,
    );
  });
});

describe("runtime diagnostics", () => {
  test("warns for hook and constant typos, arity mistakes, and asset names", () => {
    const diagnostics: RuntimeDiagnostic[] = [];
    const handle = run(
      `
WIDHT = 320;
function drwa() {}
function draw(context) {}
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
    ).toHaveLength(2);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "asset-name",
    );
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
