import { describe, expect, test } from "bun:test";
import { Rect, ZRect, angleTo, distanceTo } from "@js-game-zero/core";

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
