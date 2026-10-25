import { expect, test } from "bun:test";
import {
  ImageSurface,
  Rect,
  run,
  type DrawableImage,
  type RuntimeCanvas,
} from "@js-game-zero/core";
import {
  createImageLoader,
  getGameInspector,
  parseStatePath,
  serializeGameValue,
} from "@js-game-zero/core/host";

class MockCanvas extends EventTarget {
  width = 0;
  height = 0;
  tabIndex = 0;
  getContext(): CanvasRenderingContext2D {
    return {
      clearRect() {},
      fillRect() {},
      drawImage() {},
    } as unknown as CanvasRenderingContext2D;
  }
  getBoundingClientRect(): { left: number; top: number } {
    return { left: 0, top: 0 };
  }
  remove(): void {}
}
const canvas = () => new MockCanvas() as unknown as RuntimeCanvas;

test("an Actor's properties are the fields the game gave it, and nothing of the engine's", async () => {
  const images = createImageLoader({
    loadAsset: async () => new ImageSurface({} as DrawableImage, 20, 10),
  });
  const handle = run(
    `
let bug = new Actor("bug", [50, 40]);
bug.images = ["bug", "bug"];
bug.fps = 12;
bug.loop = false;
bug.speed = 40;
`,
    { canvas: canvas(), autostart: false, loaders: { images } },
  );
  await handle.ready;
  expect(getGameInspector(handle)!.inspect("bug")).toMatchObject({
    $type: "Actor",
    image: "bug",
    width: 20,
    height: 10,
    properties: { speed: 40 },
  });
  expect(
    Object.keys(
      (getGameInspector(handle)!.inspect("bug") as { properties: object })
        .properties,
    ),
  ).toEqual(["speed"]);
  await handle.dispose();
});

test("serializes framework and non-JSON values with stable tags", () => {
  const circular: Record<string, unknown> = { value: 1 };
  circular.self = circular;
  expect(
    serializeGameValue({
      rect: new Rect(1, 2, 3, 4),
      set: new Set([1, 2]),
      map: new Map([["score", 3]]),
      missing: undefined,
      infinite: Infinity,
      negativeZero: -0,
      circular,
    }),
  ).toMatchObject({
    rect: { $type: "Rect", left: 1, top: 2, width: 3, height: 4 },
    set: { $type: "Set", values: [1, 2], size: 2 },
    map: { $type: "Map", entries: [["score", 3]], size: 1 },
    missing: { $type: "Undefined" },
    infinite: { $type: "Number", value: "Infinity" },
    negativeZero: { $type: "Number", value: "-0" },
    circular: { self: { $type: "Circular" } },
  });
});

test("reads state paths the way the CLI's inspect takes them", () => {
  expect(parseStatePath("score")).toEqual({
    source: "score",
    binding: "score",
    segments: [],
  });
  expect(parseStatePath("fish[0].y")).toEqual({
    source: "fish[0].y",
    binding: "fish",
    segments: [0, "y"],
  });
  expect(parseStatePath("snake[12].position.x").segments).toEqual([
    12,
    "position",
    "x",
  ]);
  for (const bad of [
    "",
    "1x",
    "a.",
    "a[x]",
    "a[0",
    "a..b",
    "a.__proto__",
    "constructor",
    "a b",
  ])
    expect(() => parseStatePath(bad)).toThrow(TypeError);
});

test("a host inspector reads live values by path, raw or as the CLI reports them", () => {
  const handle = run(
    `
let score = 0;
let player = { x: 10, y: 20 };
let fish = [{ y: 5 }, { y: 7 }];
let edge = new Rect(1, 2, 3, 4);
let nothing;
function update(dt) {
  score += 1;
  fish[0].y += 100 * dt;
}
function draw() {}
`,
    { canvas: canvas(), autostart: false },
  );
  const inspector = getGameInspector(handle)!;
  expect(inspector.bindings()).toEqual([
    "score",
    "player",
    "fish",
    "edge",
    "nothing",
  ]);
  expect(inspector.functions()).toEqual(["update", "draw"]);
  handle.step(0.5);
  expect(inspector.read("score")).toBe(1);
  expect(inspector.read("fish[0].y")).toBe(55);
  expect(inspector.read(parseStatePath("player.x"))).toBe(10);
  expect(inspector.inspect("fish[1]")).toEqual({ y: 7 });
  expect(inspector.inspect("edge")).toMatchObject({
    $type: "Rect",
    left: 1,
    width: 3,
  });
  expect(inspector.inspect()).toEqual({
    score: 1,
    player: { x: 10, y: 20 },
    fish: [{ y: 55 }, { y: 7 }],
    edge: serializeGameValue(new Rect(1, 2, 3, 4)),
    nothing: { $type: "Undefined" },
  });
  expect(() => inspector.read("player.x.y")).toThrow(
    "Cannot read player.x.y: y has no parent value.",
  );
  expect(() => inspector.read("missing")).toThrow("Unknown game-state binding");
  expect(() => inspector.inspect("bad path")).toThrow(TypeError);
  handle.stop();
});
