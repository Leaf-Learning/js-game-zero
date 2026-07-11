import { describe, expect, test } from "bun:test";
import {
  Actor,
  ImageSurface,
  Screen,
  type SurfaceLike,
} from "@js-game-zero/core";
import {
  createImageLoader,
  type CanvasLike,
  type DrawableImage,
} from "@js-game-zero/core/host";

class MockContext {
  readonly operations: Array<{ name: string; args: unknown[] }> = [];
  globalAlpha = 1;
  fillStyle: unknown = "black";
  strokeStyle: unknown = "black";
  lineWidth = 1;
  font = "10px sans-serif";
  textBaseline = "alphabetic";
  textAlign = "left";
  throwOnDraw = false;

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
    if (this.throwOnDraw) throw new Error("draw failed");
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
    projectId: "test_project",
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

describe("Actor edge/position setters", () => {
  test("left/top/right/bottom setters translate the rect, preserving width/height", () => {
    // hero.svg is 20x10 (see loaderWithSprites). Starting from
    // topleft [0, 0] with the default center/center anchor gives
    // rect() = {left: 0, top: 0, width: 20, height: 10}.
    const left = new Actor("hero.svg", {
      topleft: [0, 0],
      loader: loaderWithSprites(),
    });
    left.left = 5;
    expect(left.left).toBe(5);
    // left moves only the left edge: top/width/height stay put.
    expect(left.rect()).toMatchObject({
      left: 5,
      top: 0,
      width: 20,
      height: 10,
    });

    const top = new Actor("hero.svg", {
      topleft: [0, 0],
      loader: loaderWithSprites(),
    });
    top.top = 8;
    expect(top.top).toBe(8);
    expect(top.rect()).toMatchObject({
      left: 0,
      top: 8,
      width: 20,
      height: 10,
    });

    const right = new Actor("hero.svg", {
      topleft: [0, 0],
      loader: loaderWithSprites(),
    });
    right.right = 50;
    expect(right.right).toBe(50);
    // right = left + width (fixed at 20), so left becomes 50 - 20 = 30.
    expect(right.rect()).toMatchObject({
      left: 30,
      top: 0,
      width: 20,
      height: 10,
    });

    const bottom = new Actor("hero.svg", {
      topleft: [0, 0],
      loader: loaderWithSprites(),
    });
    bottom.bottom = 40;
    expect(bottom.bottom).toBe(40);
    // bottom = top + height (fixed at 10), so top becomes 40 - 10 = 30.
    expect(bottom.rect()).toMatchObject({
      left: 0,
      top: 30,
      width: 20,
      height: 10,
    });
  });

  test("x/y setters move the anchor point along a single axis, independent of rect edges", () => {
    // Explicit pos [10, 5] with the default center/center anchor on a
    // 20x10 image puts the rect's topleft at (0, 0).
    const x = new Actor("hero.svg", [10, 5], { loader: loaderWithSprites() });
    x.x = 100;
    expect(x.x).toBe(100);
    expect(x.pos).toEqual([100, 5]);
    // left = x - anchorX(10) = 90; top is untouched.
    expect(x.rect()).toMatchObject({ left: 90, top: 0, width: 20, height: 10 });

    const y = new Actor("hero.svg", [10, 5], { loader: loaderWithSprites() });
    y.y = 55;
    expect(y.y).toBe(55);
    expect(y.pos).toEqual([10, 55]);
    // top = y - anchorY(5) = 50; left is untouched.
    expect(y.rect()).toMatchObject({ left: 0, top: 50, width: 20, height: 10 });
  });
});

describe("Actor asset lifecycle", () => {
  test("ready() awaits an in-flight load and then resolves synchronously from cache", async () => {
    const loader = loaderWithSprites();
    // "mystery.svg" is not pre-defined via loader.define(), so
    // loaderWithSprites' loadAsset fallback (any unrecognized name -> a
    // 20x10 surface) is exercised through a genuine async load.
    const actor = new Actor("mystery.svg", { loader });

    const surface = await actor.ready();
    expect(surface.get_size()).toEqual([20, 10]);
    expect(actor.width).toBe(20);
    expect(actor.height).toBe(10);

    // Once loaded, ready() takes the `if (this._surface)` fast path and
    // resolves to the same cached surface instance.
    const again = await actor.ready();
    expect(again).toBe(surface);
  });

  test("unload_image() evicts the loader cache entry and clears the actor's own surface", async () => {
    const loader = loaderWithSprites();
    const actor = new Actor("hero.svg", { topleft: [0, 0], loader });
    expect(actor.width).toBe(20);
    expect(loader.has("hero.svg")).toBe(true);

    actor.unload_image();

    expect(loader.has("hero.svg")).toBe(false);
    // With no surface, width/height fall back to 0 (surfaceWidth/Height
    // default when `_surface` is null).
    expect(actor.width).toBe(0);
    expect(actor.height).toBe(0);
    // unload_image() also clears the pending-load promise, so ready()
    // has nothing left to await.
    await expect(actor.ready()).rejects.toThrow("Actor image is not loading.");
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
    expect(Math.round(actor.width)).toBe(10);
    expect(Math.round(actor.height)).toBe(20);
    expect(Math.round(actor.left)).toBe(5);
    expect(Math.round(actor.top)).toBe(-5);
    expect(Math.round(rect.width)).toBe(10);
    expect(Math.round(rect.height)).toBe(20);
    expect(Math.round(rect.left)).toBe(5);
    expect(Math.round(rect.top)).toBe(-5);
  });

  test("computes a genuinely rotated (non-axis-aligned) bounding rectangle at angle 30", () => {
    const actor = new Actor("hero.svg", {
      topleft: [0, 0],
      loader: loaderWithSprites(),
    });
    // hero.svg is 20x10 (see loaderWithSprites). The default anchor is
    // center/center, so rotation pivots around the rect's own center,
    // which sits at pos = (10, 5) for a rect at topleft [0, 0].
    actor.angle = 30;

    // Standard rotated-rectangle AABB formula for a w x h rect rotated
    // by angle θ around its own center:
    //   width'  = w*|cos θ| + h*|sin θ|
    //   height' = w*|sin θ| + h*|cos θ|
    // w=20, h=10, θ=30°: cos30° ≈ 0.8660254, sin30° = 0.5
    //   width'  = 20*0.8660254 + 10*0.5      = 17.320508 + 5  = 22.320508
    //   height' = 20*0.5       + 10*0.8660254 = 10       + 8.660254 = 18.660254
    // The rotated rect stays centered at (10, 5), so:
    //   left = 10 - width'/2  = 10 - 11.160254 = -1.160254
    //   top  = 5  - height'/2 = 5  - 9.330127   = -4.330127
    const expectedWidth = 22.320508;
    const expectedHeight = 18.660254;
    const expectedLeft = -1.160254;
    const expectedTop = -4.330127;

    const rect = actor.rect();
    expect(rect.left).toBeCloseTo(expectedLeft, 4);
    expect(rect.top).toBeCloseTo(expectedTop, 4);
    expect(rect.width).toBeCloseTo(expectedWidth, 4);
    expect(rect.height).toBeCloseTo(expectedHeight, 4);
    expect(actor.left).toBeCloseTo(expectedLeft, 4);
    expect(actor.top).toBeCloseTo(expectedTop, 4);
    expect(actor.width).toBeCloseTo(expectedWidth, 4);
    expect(actor.height).toBeCloseTo(expectedHeight, 4);
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

  test("restores canvas state when drawing throws", () => {
    const loader = loaderWithSprites();
    const context = new MockContext();
    context.throwOnDraw = true;
    const screen = new Screen(
      { width: 100, height: 80 },
      context as unknown as CanvasRenderingContext2D,
      { imageLoader: loader },
    );
    const actor = new Actor("hero.svg", [30, 40], { loader, screen });

    expect(() => actor.draw()).toThrow("draw failed");
    expect(context.operations.map((operation) => operation.name)).toEqual([
      "save",
      "translate",
      "drawImage",
      "restore",
    ]);
    expect(context.globalAlpha).toBe(1);
  });
});
