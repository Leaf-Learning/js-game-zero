import { describe, expect, test } from "bun:test";
import {
  Actor,
  ImageSurface,
  Rect,
  ZRect,
  angleTo,
  createImageLoader,
  distanceTo,
  type DrawableImage,
  type RectTuple,
} from "@js-game-zero/core";

describe("Rect construction and position properties", () => {
  test("accepts supported constructor shapes and rejects invalid shapes", () => {
    expect(new Rect(1, 2, 3, 4).topleft).toEqual([1, 2]);
    expect(new Rect([1, 2], [3, 4]).size).toEqual([3, 4]);
    expect(new Rect([1, 2, 3, 4]).bottomright).toEqual([4, 6]);
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
    expect(rect.topleft).toEqual([11, 21]);
    rect.right = 60;
    rect.bottom = 90;
    expect(rect.topleft).toEqual([30, 50]);
    rect.centerx = 100;
    rect.centery = 200;
    expect(rect.center).toEqual([100, 200]);
    expect(rect.topleft).toEqual([85, 180]);
    rect.topleft = [1, 2];
    expect(rect.topleft).toEqual([1, 2]);
    rect.topright = [50, 3];
    expect(rect.topleft).toEqual([20, 3]);
    rect.bottomleft = [7, 80];
    expect(rect.topleft).toEqual([7, 40]);
    rect.bottomright = [90, 100];
    expect(rect.topleft).toEqual([60, 60]);
    rect.midtop = [40, 5];
    expect(rect.topleft).toEqual([25, 5]);
    rect.midleft = [8, 20];
    expect(rect.topleft).toEqual([8, 0]);
    rect.midright = [100, 35];
    expect(rect.topleft).toEqual([70, 15]);
    rect.midbottom = [30, 90];
    expect(rect.topleft).toEqual([15, 50]);
    rect.center = [20, 30];
    expect(rect.topleft).toEqual([5, 10]);
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
  test("move, move_ip, inflate, and inflate_ip follow pygame-style geometry", () => {
    const rect = new Rect(10, 20, 30, 40);
    expect(rect.move(5, -10).topleft).toEqual([15, 10]);
    expect(rect.topleft).toEqual([10, 20]);
    rect.move_ip([-5, 5]);
    expect(rect.topleft).toEqual([5, 25]);

    const inflated = rect.inflate(10, 20);
    expect(inflated.topleft).toEqual([0, 15]);
    expect(inflated.size).toEqual([40, 60]);
    rect.inflate_ip([-10, -20]);
    expect(rect.topleft).toEqual([10, 35]);
    expect(rect.size).toEqual([20, 20]);
  });

  test("normalize flips negative dimensions into positive bounds", () => {
    const rect = new Rect(10, 20, -30, -40);
    rect.normalize();
    expect([rect.left, rect.top, rect.width, rect.height]).toEqual([
      -20, -20, 30, 40,
    ]);
  });

  test("clamp, clip, union, unionall, and fit return new rects", () => {
    expect(new Rect(90, 90, 20, 20).clamp([0, 0, 100, 100]).topleft).toEqual([
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
      new Rect(10, 10, 10, 10).unionall([
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
    expect(rect.collidepoint([10, 10])).toBe(true);
    expect(rect.collidepoint(29.999, 29.999)).toBe(true);
    expect(rect.collidepoint([30, 30])).toBe(false);
    expect(rect.colliderect([29, 29, 10, 10])).toBe(true);
    expect(rect.colliderect([30, 30, 10, 10])).toBe(false);
    expect(
      rect.collidelist([
        [40, 40, 1, 1],
        [20, 20, 1, 1],
      ]),
    ).toBe(1);
    expect(rect.collidelist([[40, 40, 1, 1]])).toBe(-1);
    expect(
      rect.collidelistall([
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
    expect(new Rect(rectLike).topleft).toEqual([5, 6]);
    expect(new Rect(rectLike).size).toEqual([7, 8]);
  });

  test("accepts an object exposing `.rect` as a callable method (Actor-style)", () => {
    const actorLike = { rect: () => new Rect(1, 2, 3, 4) };
    expect(new Rect(actorLike).topleft).toEqual([1, 2]);
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
    expect(new Rect(30, 30, 40, 40).colliderect(actor)).toBe(true);
    expect(new Rect(0, 0, 200, 200).contains(actor)).toBe(true);
    expect(new Rect(0, 0, 5, 5).colliderect(actor)).toBe(false);
  });

  test("recursively resolves chained `.rect` references", () => {
    const innerTuple: RectTuple = [9, 10, 11, 12];
    const nested = { rect: () => ({ rect: innerTuple }) };
    expect([...new Rect(nested)]).toEqual([9, 10, 11, 12]);
  });

  test("colliderect, contains, and screen.draw.rect all accept a rect-like via duck typing", () => {
    const actorLike = { rect: () => new Rect(5, 5, 10, 10) };
    expect(new Rect(0, 0, 8, 8).colliderect(actorLike)).toBe(true);
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
  test("clamp_ip mutates in place like clamp", () => {
    const rect = new Rect(90, 90, 20, 20);
    const expected = rect.clamp([0, 0, 100, 100]);
    rect.clamp_ip([0, 0, 100, 100]);
    expect(rect.topleft).toEqual(expected.topleft);
    expect(rect.size).toEqual(expected.size);
  });

  test("clip_ip mutates in place like clip", () => {
    const rect = new Rect(0, 0, 10, 10);
    const expected = rect.clip([5, 6, 10, 10]);
    rect.clip_ip([5, 6, 10, 10]);
    expect([...rect]).toEqual([...expected]);
  });

  test("union_ip mutates in place like union", () => {
    const rect = new Rect(10, 10, 10, 10);
    const expected = rect.union([0, 5, 4, 4]);
    rect.union_ip([0, 5, 4, 4]);
    expect([...rect]).toEqual([...expected]);
  });

  test("unionall_ip mutates in place like unionall", () => {
    const rect = new Rect(10, 10, 10, 10);
    const others: RectTuple[] = [
      [0, 0, 1, 1],
      [25, 20, 5, 5],
    ];
    const expected = rect.unionall(others);
    rect.unionall_ip(others);
    expect([...rect]).toEqual([...expected]);
  });

  test("_ip methods mutate the original instance, not a copy", () => {
    const rect = new Rect(0, 0, 10, 10);
    const original = rect;
    rect.union_ip([20, 20, 5, 5]);
    expect(rect).toBe(original);
    expect(rect.size).toEqual([25, 25]);
  });
});

describe("Rect.collidedict / collidedictall", () => {
  test("collidedict checks Map values by default and returns the first match", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = new Map<string, Rect>([
      ["far", new Rect(20, 20, 5, 5)],
      ["near", new Rect(5, 5, 5, 5)],
    ]);
    expect(rect.collidedict(dict)).toEqual(["near", new Rect(5, 5, 5, 5)]);
  });

  test("collidedict returns undefined when nothing collides", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = new Map<string, Rect>([["far", new Rect(20, 20, 5, 5)]]);
    expect(rect.collidedict(dict)).toBeUndefined();
  });

  test("collidedict works over a plain object's values", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = {
      far: new Rect(20, 20, 5, 5),
      near: new Rect(5, 5, 5, 5),
    };
    expect(rect.collidedict(dict)).toEqual(["near", new Rect(5, 5, 5, 5)]);
  });

  test("useValues: false checks the (rect-like) keys of a Map instead", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = new Map<Rect, string>([
      [new Rect(20, 20, 5, 5), "far"],
      [new Rect(5, 5, 5, 5), "near"],
    ]);
    expect(rect.collidedict(dict, false)).toEqual([
      new Rect(5, 5, 5, 5),
      "near",
    ]);
  });

  test("collidedictall returns every colliding entry", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = new Map<string, Rect>([
      ["far", new Rect(20, 20, 5, 5)],
      ["near", new Rect(5, 5, 5, 5)],
      ["overlap", new Rect(-2, -2, 4, 4)],
    ]);
    expect(rect.collidedictall(dict)).toEqual([
      ["near", new Rect(5, 5, 5, 5)],
      ["overlap", new Rect(-2, -2, 4, 4)],
    ]);
  });

  test("collidedictall returns an empty array when nothing collides", () => {
    const rect = new Rect(0, 0, 10, 10);
    const dict = new Map<string, Rect>([["far", new Rect(20, 20, 5, 5)]]);
    expect(rect.collidedictall(dict)).toEqual([]);
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
