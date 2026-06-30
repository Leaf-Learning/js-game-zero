import { describe, expect, test } from "bun:test";
import {
  Actor,
  ImageSurface,
  Screen,
  createImageLoader,
  type CanvasLike,
  type DrawableImage,
  type SurfaceLike,
} from "@js-game-zero/core";

class MockContext {
  readonly operations: Array<{ name: string; args: unknown[] }> = [];
  globalAlpha = 1;
  fillStyle: unknown = "black";
  strokeStyle: unknown = "black";
  lineWidth = 1;
  font = "10px sans-serif";
  textBaseline = "alphabetic";
  textAlign = "left";

  save(): void {
    this.record("save");
  }

  restore(): void {
    this.globalAlpha = 1;
    this.record("restore");
  }

  translate(...args: unknown[]): void {
    this.record("translate", ...args);
  }

  rotate(...args: unknown[]): void {
    this.record("rotate", ...args);
  }

  drawImage(...args: unknown[]): void {
    this.record("drawImage", ...args);
  }

  clearRect(): void {}
  fillRect(): void {}
  strokeRect(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  stroke(): void {}
  fill(): void {}
  arc(): void {}
  createLinearGradient(): CanvasGradient {
    return { addColorStop() {} } as CanvasGradient;
  }
  measureText(text: string): TextMetrics {
    return { width: text.length * 10 } as TextMetrics;
  }

  private record(name: string, ...args: unknown[]): void {
    this.operations.push({ name, args });
  }
}

function surface(width: number, height: number): SurfaceLike {
  return new ImageSurface(
    { width, height } as unknown as DrawableImage,
    width,
    height,
  );
}

function loaderWithSprites() {
  const loader = createImageLoader({
    projectId: "phase_three",
    loadAsset: async (_url, name) => {
      if (name === "ship.svg") return surface(30, 12);
      return surface(20, 10);
    },
  });
  loader.define("hero.svg", surface(20, 10));
  loader.define("ship.svg", surface(30, 12));
  return loader;
}

describe("Actor positioning and anchors", () => {
  test("defaults to topleft while using a center anchor", () => {
    const actor = new Actor("hero.svg", { loader: loaderWithSprites() });
    expect(actor.anchor).toEqual(["center", "center"]);
    expect(actor.topleft).toEqual([0, 0]);
    expect(actor.pos).toEqual([10, 5]);
    expect(actor.rect()).toMatchObject({
      left: 0,
      top: 0,
      width: 20,
      height: 10,
    });
  });

  test("accepts explicit pos and every symbolic position source", () => {
    const loader = loaderWithSprites();
    expect(new Actor("hero.svg", [100, 50], { loader }).pos).toEqual([100, 50]);

    const cases = {
      topleft: [1, 2],
      topright: [21, 2],
      bottomleft: [1, 12],
      bottomright: [21, 12],
      midtop: [11, 2],
      midleft: [1, 7],
      midright: [21, 7],
      midbottom: [11, 12],
      center: [11, 7],
    } as const;

    for (const [key, value] of Object.entries(cases)) {
      const actor = new Actor("hero.svg", { [key]: value, loader });
      expect(actor[key as keyof Actor]).toEqual([...value]);
    }
  });

  test("supports string and numeric anchors", () => {
    const loader = loaderWithSprites();
    const topLeftAnchor = new Actor("hero.svg", [5, 6], {
      loader,
      anchor: ["left", "top"],
    });
    expect(topLeftAnchor.topleft).toEqual([5, 6]);

    const numericAnchor = new Actor("hero.svg", [50, 40], {
      loader,
      anchor: [3, 4],
    });
    expect(numericAnchor.topleft).toEqual([47, 36]);

    const bottomRightAnchor = new Actor("hero.svg", [50, 40], {
      loader,
      anchor: ["right", "bottom"],
    });
    expect(bottomRightAnchor.bottomright).toEqual([50, 40]);
  });

  test("rejects mixed positions and unknown keywords", () => {
    const loader = loaderWithSprites();
    expect(
      () => new Actor("hero.svg", [1, 2], { center: [3, 4], loader }),
    ).toThrow(TypeError);
    expect(
      () =>
        new Actor("hero.svg", {
          loader,
          imaginary: [1, 2],
        } as never),
    ).toThrow(TypeError);
  });
});

describe("Actor behavior", () => {
  test("computes rotated bounding rectangles and clamps opacity", () => {
    const actor = new Actor("hero.svg", {
      topleft: [0, 0],
      loader: loaderWithSprites(),
    });
    actor.opacity = 2;
    expect(actor.opacity).toBe(1);
    actor.opacity = -1;
    expect(actor.opacity).toBe(0);
    actor.angle = 90;
    const rect = actor.rect();
    expect(Math.round(rect.width)).toBe(10);
    expect(Math.round(rect.height)).toBe(20);
    expect(Math.round(rect.left)).toBe(5);
    expect(Math.round(rect.top)).toBe(-5);
  });

  test("swaps images and delegates collision helpers", () => {
    const loader = loaderWithSprites();
    const actor = new Actor("hero.svg", { topleft: [0, 0], loader });
    actor.image = "ship.svg";
    expect(actor.width).toBe(30);
    expect(actor.height).toBe(12);
    expect(actor.collidepoint([1, 1])).toBe(true);
    expect(actor.colliderect([29, 11, 4, 4])).toBe(true);
    expect(
      actor.collidelist([
        [40, 40, 1, 1],
        [2, 2, 1, 1],
      ]),
    ).toBe(1);
    expect(
      actor.collidelistall([
        [2, 2, 1, 1],
        [50, 50, 1, 1],
      ]),
    ).toEqual([0]);
    expect(actor.contains([1, 1, 2, 2])).toBe(true);
  });

  test("delegates the wider Rect helper surface", () => {
    const actor = new Actor("hero.svg", {
      topleft: [10, 20],
      loader: loaderWithSprites(),
    });

    expect(actor.copy()).toMatchObject({
      left: 10,
      top: 20,
      width: 20,
      height: 10,
    });
    expect(actor.move(5, -5)).toMatchObject({
      left: 15,
      top: 15,
      width: 20,
      height: 10,
    });
    actor.move_ip([5, -5]);
    expect(actor.topleft).toEqual([15, 15]);
    expect(actor.inflate(10, 4)).toMatchObject({
      left: 10,
      top: 13,
      width: 30,
      height: 14,
    });
    actor.inflate_ip([10, 4]);
    expect(actor.rect()).toMatchObject({
      left: 10,
      top: 13,
      width: 30,
      height: 14,
    });
    expect(actor.clamp([0, 0, 25, 25])).toMatchObject({
      left: -2.5,
      top: 11,
      width: 30,
      height: 14,
    });
    expect(actor.clip([20, 10, 10, 10])).toMatchObject({
      left: 20,
      top: 13,
      width: 10,
      height: 7,
    });
    expect(actor.union([0, 0, 5, 5])).toMatchObject({
      left: 0,
      top: 0,
      width: 40,
      height: 27,
    });
    expect(actor.unionall([[50, 50, 5, 5]])).toMatchObject({
      left: 10,
      top: 13,
      width: 45,
      height: 42,
    });
    expect(actor.fit([0, 0, 15, 15])).toMatchObject({
      left: 0,
      top: 4,
      width: 15,
      height: 7,
    });
  });

  test("reports angle and distance to points and actors", () => {
    const loader = loaderWithSprites();
    const actor = new Actor("hero.svg", [0, 0], { loader });
    const other = new Actor("hero.svg", [3, -4], { loader });
    expect(actor.distance_to([3, 4])).toBe(5);
    expect(actor.angle_to([10, 0])).toBe(0);
    expect(actor.angle_to(other)).toBeCloseTo(53.1301, 4);
  });

  test("draws with opacity, anchor offset, and rotation", () => {
    const loader = loaderWithSprites();
    const context = new MockContext();
    const canvas: CanvasLike = { width: 100, height: 80 };
    const screen = new Screen(
      canvas,
      context as unknown as CanvasRenderingContext2D,
      {
        imageLoader: loader,
      },
    );
    const actor = new Actor("hero.svg", [30, 40], {
      loader,
      screen,
      opacity: 0.5,
      angle: 45,
    });

    actor.draw();
    expect(context.globalAlpha).toBe(1);
    expect(context.operations).toContainEqual({
      name: "translate",
      args: [30, 40],
    });
    expect(context.operations.map((op) => op.name)).toContain("rotate");
    expect(context.operations).toContainEqual({
      name: "drawImage",
      args: [expect.anything(), -10, -5],
    });
  });
});
