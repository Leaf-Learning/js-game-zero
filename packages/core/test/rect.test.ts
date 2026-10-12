import { describe, expect, test } from "bun:test";
import {
  Actor,
  ImageSurface,
  Rect,
  ZRect,
  angleTo,
  distanceTo,
  type DrawableImage,
  type RectTuple,
} from "@js-game-zero/core";
import { createImageLoader } from "@js-game-zero/core/host";

describe("Rect construction and position properties", () => {
  test("accepts supported constructor shapes and rejects invalid shapes", () => {
    expect(new Rect(1, 2, 3, 4).topLeft).toEqual([1, 2]);
    expect(new Rect([1, 2], [3, 4]).size).toEqual([3, 4]);
    expect(new Rect([1, 2, 3, 4]).bottomRight).toEqual([4, 6]);
    expect(new Rect(new Rect(1, 2, 3, 4)).center).toEqual([2.5, 4]);
    expect(new Rect({ x: 1, y: 2, w: 3, h: 4 }).right).toBe(4);
    expect(new Rect({ left: 1, top: 2, width: 3, height: 4 }).bottom).toBe(6);
    const RectWithUnknownArgs = Rect as unknown as new (
      ...args: unknown[]
    ) => Rect;
    expect(() => new RectWithUnknownArgs([1, 2])).toThrow(TypeError);
    expect(() => new RectWithUnknownArgs(1, 2, 3)).toThrow(TypeError);
  });

  test("moves each edge and anchor setter without changing size", () => {
    const rect = new Rect(10, 20, 30, 40);
    expect(rect.x).toBe(10);
    expect(rect.y).toBe(20);
    rect.x = 11;
    rect.y = 21;
    expect(rect.topLeft).toEqual([11, 21]);
    rect.right = 60;
    rect.bottom = 90;
    expect(rect.topLeft).toEqual([30, 50]);
    rect.centerX = 100;
    rect.centerY = 200;
    expect(rect.center).toEqual([100, 200]);
    expect(rect.topLeft).toEqual([85, 180]);
    rect.topLeft = [1, 2];
    expect(rect.topLeft).toEqual([1, 2]);
    rect.topRight = [50, 3];
    expect(rect.topLeft).toEqual([20, 3]);
    rect.bottomLeft = [7, 80];
    expect(rect.topLeft).toEqual([7, 40]);
    rect.bottomRight = [90, 100];
    expect(rect.topLeft).toEqual([60, 60]);
    rect.midTop = [40, 5];
    expect(rect.topLeft).toEqual([25, 5]);
    rect.midLeft = [8, 20];
    expect(rect.topLeft).toEqual([8, 0]);
    rect.midRight = [100, 35];
    expect(rect.topLeft).toEqual([70, 15]);
    rect.midBottom = [30, 90];
    expect(rect.topLeft).toEqual([15, 50]);
    rect.center = [20, 30];
    expect(rect.topLeft).toEqual([5, 10]);
    expect(rect.size).toEqual([30, 40]);
  });

  test("mutates size through width, height, w, h, and size", () => {
    const rect = new Rect(0, 0, 10, 20);
    rect.width = 11;
    rect.height = 21;
    expect(rect.size).toEqual([11, 21]);
    rect.w = 12;
    rect.h = 22;
    expect(rect.size).toEqual([12, 22]);
    rect.size = [30, 40];
    expect([rect.w, rect.h, rect.right, rect.bottom]).toEqual([30, 40, 30, 40]);
  });

  test("copy preserves the concrete rect class", () => {
    const zrect = new ZRect(1, 2, 3, 4);
    expect(zrect.copy()).toBeInstanceOf(ZRect);
  });
});

describe("Rect transformations and collisions", () => {
  test("move, moveIp, inflate, and inflateIp follow pygame-style geometry", () => {
    const rect = new Rect(10, 20, 30, 40);
    expect(rect.move(5, -10).topLeft).toEqual([15, 10]);
    expect(rect.topLeft).toEqual([10, 20]);
    rect.moveIp([-5, 5]);
    expect(rect.topLeft).toEqual([5, 25]);

    const inflated = rect.inflate(10, 20);
    expect(inflated.topLeft).toEqual([0, 15]);
    expect(inflated.size).toEqual([40, 60]);
    rect.inflateIp([-10, -20]);
    expect(rect.topLeft).toEqual([10, 35]);
    expect(rect.size).toEqual([20, 20]);
  });

  test("normalize flips negative dimensions into positive bounds", () => {
    const rect = new Rect(10, 20, -30, -40);
    rect.normalize();
    expect([rect.left, rect.top, rect.width, rect.height]).toEqual([
      -20, -20, 30, 40,
    ]);
  });

  test("clamp, clip, union, unionAll, and fit return new rects", () => {
    expect(new Rect(90, 90, 20, 20).clamp([0, 0, 100, 100]).topLeft).toEqual([
      80, 80,
    ]);
    expect(new Rect(0, 0, 200, 50).clamp([0, 0, 100, 100]).center).toEqual([
      50, 25,
    ]);
    expect(new Rect(0, 0, 10, 10).clip([5, 6, 10, 10])).toEqual(
      new Rect(5, 6, 5, 4),
    );
    expect(new Rect(0, 0, 10, 10).clip([20, 20, 5, 5]).size).toEqual([0, 0]);
    expect(new Rect(10, 10, 10, 10).union([0, 5, 4, 4])).toEqual(
      new Rect(0, 5, 20, 15),
    );
    expect(
      new Rect(10, 10, 10, 10).unionAll([
        [0, 0, 1, 1],
        [25, 20, 5, 5],
      ]),
    ).toEqual(new Rect(0, 0, 30, 25));
    expect(new Rect(0, 0, 200, 100).fit([0, 0, 100, 100])).toEqual(
      new Rect(0, 25, 100, 50),
    );
  });

  test("contains and collisions use half-open bounds", () => {
    const rect = new Rect(10, 10, 20, 20);
    expect(rect.contains([10, 10, 20, 20])).toBe(true);
    expect(rect.contains([10, 10, 21, 20])).toBe(false);
    expect(rect.collidePoint([10, 10])).toBe(true);
    expect(rect.collidePoint(29.999, 29.999)).toBe(true);
    expect(rect.collidePoint([30, 30])).toBe(false);
    expect(rect.collideRect([29, 29, 10, 10])).toBe(true);
    expect(rect.collideRect([30, 30, 10, 10])).toBe(false);
    expect(
      rect.collideList([
        [40, 40, 1, 1],
        [20, 20, 1, 1],
      ]),
    ).toBe(1);
    expect(rect.collideList([[40, 40, 1, 1]])).toBe(-1);
    expect(
      rect.collideListAll([
        [10, 10, 1, 1],
        [30, 30, 1, 1],
        [29, 29, 2, 2],
      ]),
    ).toEqual([0, 2]);
  });

  test("angleTo keeps PGZero's screen-coordinate convention", () => {
    expect(angleTo([0, 0], [10, 0])).toBe(0);
    expect(angleTo([0, 0], [0, -10])).toBe(90);
    expect(angleTo([0, 0], [0, 10])).toBe(-90);
    expect(distanceTo([0, 0], [3, 4])).toBe(5);
  });
});

describe("Rect duck-typing on a `.rect` property or method", () => {
  test("accepts an object exposing `.rect` as a plain property", () => {
    const rectLike = { rect: new Rect(5, 6, 7, 8) };
    expect(new Rect(rectLike).topLeft).toEqual([5, 6]);
    expect(new Rect(rectLike).size).toEqual([7, 8]);
  });

  test("accepts an object exposing `.rect` as a callable method (Actor-style)", () => {
    const actorLike = { rect: () => new Rect(1, 2, 3, 4) };
    expect(new Rect(actorLike).topLeft).toEqual([1, 2]);
  });

  test("accepts a real Actor instance without geometry knowing about Actor", () => {
    const loader = createImageLoader({
      projectId: "test_project",
      loadAsset: async () =>
        new ImageSurface({ width: 20, height: 10 } as DrawableImage, 20, 10),
    });
    loader.define(
      "hero.svg",
      new ImageSurface({ width: 20, height: 10 } as DrawableImage, 20, 10),
    );
    const actor = new Actor("hero.svg", [50, 60], { loader });
    // Default anchor is center, so the 20x10 sprite's rect is at (40, 55).
    expect([...new Rect(actor)]).toEqual([40, 55, 20, 10]);
    expect(new Rect(30, 30, 40, 40).collideRect(actor)).toBe(true);
    expect(new Rect(0, 0, 200, 200).contains(actor)).toBe(true);
    expect(new Rect(0, 0, 5, 5).collideRect(actor)).toBe(false);
  });

  test("recursively resolves chained `.rect` references", () => {
    const innerTuple: RectTuple = [9, 10, 11, 12];
    const nested = { rect: () => ({ rect: innerTuple }) };
    expect([...new Rect(nested)]).toEqual([9, 10, 11, 12]);
  });

  test("collideRect, contains, and screen.draw.rect all accept a rect-like via duck typing", () => {
    const actorLike = { rect: () => new Rect(5, 5, 10, 10) };
    expect(new Rect(0, 0, 8, 8).collideRect(actorLike)).toBe(true);
    expect(new Rect(0, 0, 20, 20).contains(actorLike)).toBe(true);
    expect(new Rect(actorLike)).toEqual(new Rect(5, 5, 10, 10));
  });

  test("still rejects genuinely invalid input", () => {
    const RectWithUnknownArgs = Rect as unknown as new (
      ...args: unknown[]
    ) => Rect;
    expect(() => new RectWithUnknownArgs({ nope: true })).toThrow(TypeError);
    expect(() => new RectWithUnknownArgs(null)).toThrow(TypeError);
  });

  test("guards against unbounded recursion through cyclic `.rect` references", () => {
    const cyclic: { rect?: unknown } = {};
    cyclic.rect = cyclic;
    expect(() => new Rect(cyclic as never)).toThrow(TypeError);
  });
});

describe("Rect in-place geometry methods match their non-mutating counterparts", () => {
  test("clampIp mutates in place like clamp", () => {
    const rect = new Rect(90, 90, 20, 20);
    const expected = rect.clamp([0, 0, 100, 100]);
    rect.clampIp([0, 0, 100, 100]);
    expect(rect.topLeft).toEqual(expected.topLeft);
    expect(rect.size).toEqual(expected.size);
  });

  test("clipIp mutates in place like clip", () => {
    const rect = new Rect(0, 0, 10, 10);
    const expected = rect.clip([5, 6, 10, 10]);
    rect.clipIp([5, 6, 10, 10]);
    expect([...rect]).toEqual([...expected]);
  });

  test("unionIp mutates in place like union", () => {
    const rect = new Rect(10, 10, 10, 10);
    const expected = rect.union([0, 5, 4, 4]);
    rect.unionIp([0, 5, 4, 4]);
    expect([...rect]).toEqual([...expected]);
  });

  test("unionAllIp mutates in place like unionAll", () => {
    const rect = new Rect(10, 10, 10, 10);
    const others: RectTuple[] = [
      [0, 0, 1, 1],
      [25, 20, 5, 5],
    ];
    const expected = rect.unionAll(others);
    rect.unionAllIp(others);
    expect([...rect]).toEqual([...expected]);
  });

  test("_ip methods mutate the original instance, not a copy", () => {
    const rect = new Rect(0, 0, 10, 10);
    const original = rect;
    rect.unionIp([20, 20, 5, 5]);
    expect(rect).toBe(original);
    expect(rect.size).toEqual([25, 25]);
  });
});

describe("Rect.collideDict / collideDictAll", () => {
  test("collideDict checks Map values by default and returns the first match", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = new Map<string, Rect>([
      ["far", new Rect(20, 20, 5, 5)],
      ["near", new Rect(5, 5, 5, 5)],
    ]);
    expect(rect.collideDict(dict)).toEqual(["near", new Rect(5, 5, 5, 5)]);
  });

  test("collideDict returns undefined when nothing collides", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = new Map<string, Rect>([["far", new Rect(20, 20, 5, 5)]]);
    expect(rect.collideDict(dict)).toBeUndefined();
  });

  test("collideDict works over a plain object's values", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = {
      far: new Rect(20, 20, 5, 5),
      near: new Rect(5, 5, 5, 5),
    };
    expect(rect.collideDict(dict)).toEqual(["near", new Rect(5, 5, 5, 5)]);
  });

  test("useValues: false checks the (rect-like) keys of a Map instead", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = new Map<Rect, string>([
      [new Rect(20, 20, 5, 5), "far"],
      [new Rect(5, 5, 5, 5), "near"],
    ]);
    expect(rect.collideDict(dict, false)).toEqual([
      new Rect(5, 5, 5, 5),
      "near",
    ]);
  });

  test("collideDictAll returns every colliding entry", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = new Map<string, Rect>([
      ["far", new Rect(20, 20, 5, 5)],
      ["near", new Rect(5, 5, 5, 5)],
      ["overlap", new Rect(-2, -2, 4, 4)],
    ]);
    expect(rect.collideDictAll(dict)).toEqual([
      ["near", new Rect(5, 5, 5, 5)],
      ["overlap", new Rect(-2, -2, 4, 4)],
    ]);
  });

  test("collideDictAll returns an empty array when nothing collides", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = new Map<string, Rect>([["far", new Rect(20, 20, 5, 5)]]);
    expect(rect.collideDictAll(dict)).toEqual([]);
  });
});

describe("Rect iteration and indexing", () => {
  test("spreads as [left, top, width, height]", () => {
    const rect = new Rect(1, 2, 3, 4);
    expect([...rect]).toEqual([1, 2, 3, 4]);
    expect(Array.from(rect)).toEqual([1, 2, 3, 4]);
  });

  test("supports numeric indexing like pygame/pgzero's rect[0..3]", () => {
    const rect = new Rect(1, 2, 3, 4);
    expect(rect[0]).toBe(1);
    expect(rect[1]).toBe(2);
    expect(rect[2]).toBe(3);
    expect(rect[3]).toBe(4);
  });

  test("indexing reflects mutation", () => {
    const rect = new Rect(1, 2, 3, 4);
    rect.left = 99;
    expect(rect[0]).toBe(99);
    expect([...rect]).toEqual([99, 2, 3, 4]);
  });

  test("destructuring works via iteration", () => {
    const rect = new Rect(1, 2, 3, 4);
    const [x, y, w, h] = rect;
    expect([x, y, w, h]).toEqual([1, 2, 3, 4]);
  });
});

describe("touches", () => {
  test("tests a point or another rect with one method", () => {
    const rect = new Rect(10, 10, 20, 20);
    expect(rect.touches([15, 15])).toBe(true);
    expect(rect.touches([30, 30])).toBe(false);
    expect(rect.touches([25, 25, 10, 10])).toBe(true);
    expect(rect.touches(new Rect(40, 40, 5, 5))).toBe(false);
    expect(rect.touches({ rect: () => new Rect(0, 0, 11, 11) })).toBe(true);
  });
});
