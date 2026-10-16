import { expect, test } from "bun:test";
import {
  Actor,
  ImageSurface,
  run,
  Screen,
  type RuntimeCanvas,
} from "@js-game-zero/core";
import {
  createImageLoader,
  getGameInspector,
  type CanvasLike,
  type DrawableImage,
} from "@js-game-zero/core/host";
import { beginDrawn, drawnOn } from "../src/rendering";

/** A 2D context that draws nothing and measures every character 10 wide. */
function quietContext(): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {
    globalAlpha: 1,
    font: "10px sans-serif",
  };
  return new Proxy(state, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === "measureText")
        return (text: string) => ({
          width: String(text).length * 10,
          actualBoundingBoxAscent: 8,
          actualBoundingBoxDescent: 2,
          fontBoundingBoxAscent: 8,
          fontBoundingBoxDescent: 2,
        });
      if (property === "createLinearGradient")
        return () => ({ addColorStop() {} });
      return () => {};
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

class QuietCanvas extends EventTarget {
  width = 0;
  height = 0;
  tabIndex = 0;
  readonly context = quietContext();
  getContext(): CanvasRenderingContext2D {
    return this.context;
  }
  getBoundingClientRect(): { left: number; top: number } {
    return { left: 0, top: 0 };
  }
  remove(): void {}
}

test("each draw() is recorded afresh: fills, shapes, lines and text, with what and where", () => {
  const handle = run(
    `
WIDTH = 360
HEIGHT = 640
let frames = 0
function update() {
  frames += 1
}
function draw() {
  screen.fill("navy")
  screen.circle(180, 100, 20, "gold")
  screen.rect(10, 20, 30, 40, [255, 0, 0])
  screen.line(0, 0, 50, 60, "white")
  screen.triangle(1, 2, 3, 4, 5, 6, "pink")
  if (frames > 1) screen.text("Score: " + frames, 20, 30)
}
`,
    { canvas: new QuietCanvas() as unknown as RuntimeCanvas, autostart: false },
  );
  const inspector = getGameInspector(handle)!;
  expect(inspector.inspect("$drawn")).toEqual([]);
  handle.step(1 / 60);
  expect(inspector.inspect("$drawn")).toEqual([
    { kind: "fill", color: "navy" },
    {
      kind: "circle",
      x: 180,
      y: 100,
      radius: 20,
      color: "gold",
      filled: true,
    },
    {
      kind: "rect",
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      color: [255, 0, 0],
      filled: true,
    },
    { kind: "line", x: 0, y: 0, x2: 50, y2: 60, color: "white" },
    {
      kind: "polygon",
      x: 1,
      y: 2,
      points: 3,
      color: "pink",
      filled: true,
    },
  ]);
  // The next frame's draw() starts a new record.
  handle.step(1 / 60);
  expect(inspector.read("$drawn[5].text")).toBe("Score: 2");
  expect(inspector.read("$drawn")).toHaveLength(6);
  // `$drawn` isn't one of the game's bindings.
  expect(inspector.bindings()).not.toContain("$drawn");
  handle.stop();
});

test("an Actor drawn is recorded with its picture and position", () => {
  const loader = createImageLoader({
    projectId: "test_project",
    loadAsset: async () =>
      new ImageSurface(
        { width: 20, height: 10 } as unknown as DrawableImage,
        20,
        10,
      ),
  });
  loader.define(
    "robot.svg",
    new ImageSurface(
      { width: 20, height: 10 } as unknown as DrawableImage,
      20,
      10,
    ),
  );
  const canvas = new QuietCanvas();
  canvas.width = 360;
  canvas.height = 640;
  const screen = new Screen(canvas as unknown as CanvasLike, canvas.context, {
    imageLoader: loader,
  });
  const robot = new Actor("robot.svg", [180, 500], { loader });
  expect(drawnOn(screen)).toEqual([]);
  // Nothing is recorded until the runtime starts a frame's record.
  robot.draw(screen);
  expect(drawnOn(screen)).toEqual([]);
  beginDrawn(screen);
  robot.draw(screen);
  screen.blit("robot.svg", [5, 6]);
  expect(drawnOn(screen)).toEqual([
    { kind: "actor", image: "robot.svg", x: 180, y: 500 },
    { kind: "image", image: "robot.svg", x: 5, y: 6 },
  ]);
});
