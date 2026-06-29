import { describe, expect, test } from "bun:test";
import { chromium } from "@playwright/test";
import {
  ImageSurface,
  Screen,
  createImageLoader,
  normalizeColor,
  type CanvasLike,
  type DrawableImage,
  type SurfaceLike,
} from "@js-game-zero/core";

type Operation = { name: string; args: unknown[] };

class MockGradient {
  readonly stops: Array<[number, string]> = [];

  addColorStop(offset: number, color: string): void {
    this.stops.push([offset, color]);
  }
}

class MockContext {
  readonly operations: Operation[] = [];
  fillStyle: unknown = "black";
  strokeStyle: unknown = "black";
  lineWidth = 1;
  globalAlpha = 1;
  font = "10px sans-serif";
  textBaseline = "alphabetic";
  textAlign = "left";

  save(): void {
    this.record("save");
  }

  restore(): void {
    this.record("restore");
  }

  clearRect(...args: unknown[]): void {
    this.record("clearRect", ...args);
  }

  fillRect(...args: unknown[]): void {
    this.record("fillRect", ...args);
  }

  strokeRect(...args: unknown[]): void {
    this.record("strokeRect", ...args);
  }

  beginPath(): void {
    this.record("beginPath");
  }

  moveTo(...args: unknown[]): void {
    this.record("moveTo", ...args);
  }

  lineTo(...args: unknown[]): void {
    this.record("lineTo", ...args);
  }

  closePath(): void {
    this.record("closePath");
  }

  stroke(): void {
    this.record("stroke");
  }

  fill(): void {
    this.record("fill");
  }

  arc(...args: unknown[]): void {
    this.record("arc", ...args);
  }

  drawImage(...args: unknown[]): void {
    this.record("drawImage", ...args);
  }

  fillText(...args: unknown[]): void {
    this.record("fillText", ...args);
  }

  strokeText(...args: unknown[]): void {
    this.record("strokeText", ...args);
  }

  translate(...args: unknown[]): void {
    this.record("translate", ...args);
  }

  rotate(...args: unknown[]): void {
    this.record("rotate", ...args);
  }

  createLinearGradient(...args: unknown[]): MockGradient {
    this.record("createLinearGradient", ...args);
    return new MockGradient();
  }

  measureText(text: string): TextMetrics {
    const size = Number.parseFloat(this.font) || 10;
    return { width: text.length * size * 0.5 } as TextMetrics;
  }

  private record(name: string, ...args: unknown[]): void {
    this.operations.push({ name, args });
  }
}

function mockScreen(loader?: ReturnType<typeof createImageLoader>): {
  screen: Screen;
  context: MockContext;
} {
  const context = new MockContext();
  const canvas: CanvasLike = { width: 120, height: 80 };
  return {
    screen: new Screen(canvas, context as unknown as CanvasRenderingContext2D, {
      ...(loader ? { imageLoader: loader } : {}),
    }),
    context,
  };
}

function surface(width = 12, height = 8): SurfaceLike {
  return new ImageSurface(
    { width, height } as unknown as DrawableImage,
    width,
    height,
  );
}

describe("Screen canvas drawing", () => {
  test("clears, fills, gradients, and reports bounds", () => {
    const { screen, context } = mockScreen();
    screen.clear();
    expect(context.operations.at(-1)).toEqual({
      name: "clearRect",
      args: [0, 0, 120, 80],
    });

    screen.fill([1, 2, 3]);
    expect(context.fillStyle).toBe("rgb(1, 2, 3)");
    expect(context.operations.at(-1)).toEqual({
      name: "fillRect",
      args: [0, 0, 120, 80],
    });

    screen.fill("#112233", "#445566");
    expect(
      context.operations.find((op) => op.name === "createLinearGradient"),
    ).toEqual({
      name: "createLinearGradient",
      args: [0, 0, 0, 80],
    });
    expect(screen.bounds()).toMatchObject({
      left: 0,
      top: 0,
      width: 120,
      height: 80,
    });
  });

  test("samples real browser gradient pixels on a small canvas", async () => {
    const result = await Bun.build({
      entrypoints: ["packages/core/src/index.ts"],
      target: "browser",
      format: "esm",
    });
    expect(result.success).toBe(true);
    const source = await result.outputs[0]?.text();
    expect(source).toBeTruthy();
    if (!source) throw new Error("Missing browser bundle for gradient test.");

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const pixels = await page.evaluate(async (bundle) => {
        const url = URL.createObjectURL(
          new Blob([bundle], { type: "text/javascript" }),
        );
        const { Screen } = (await import(url)) as {
          Screen: new (canvas: HTMLCanvasElement) => Screen;
        };
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 4;
        const screen = new Screen(canvas);
        screen.fill("#ff0000", "#0000ff");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Missing browser canvas context.");
        return {
          top: [...context.getImageData(2, 0, 1, 1).data],
          bottom: [...context.getImageData(2, 3, 1, 1).data],
        };
      }, source);

      expect(pixels.top[0]).toBeGreaterThan(pixels.bottom[0] ?? 0);
      expect(pixels.bottom[2]).toBeGreaterThan(pixels.top[2] ?? 0);
      expect(pixels.top[3]).toBe(255);
      expect(pixels.bottom[3]).toBe(255);
    } finally {
      await browser.close();
    }
  });

  test("normalizes color tuples and rejects invalid colors", () => {
    expect(normalizeColor([10, 20, 30])).toBe("rgb(10, 20, 30)");
    expect(normalizeColor([10, 20, 30, 128])).toBe(
      "rgba(10, 20, 30, 0.5019607843137255)",
    );
    expect(() => normalizeColor([300, 0, 0])).toThrow(TypeError);
  });

  test("draw primitives validate inputs and call canvas operations", () => {
    const { screen, context } = mockScreen();
    screen.draw.line([1, 2], [10, 20], "red", 3);
    screen.draw.circle([20, 20], 5, "blue", 2);
    screen.draw.filled_circle([30, 30], 6, "green");
    screen.draw.polygon(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      "white",
    );
    screen.draw.filled_polygon(
      [
        [0, 0],
        [5, 0],
        [5, 5],
      ],
      "yellow",
    );
    screen.draw.rect([1, 2, 3, 4], "purple", 4);
    screen.draw.filled_rect({ left: 5, top: 6, width: 7, height: 8 }, "orange");

    expect(context.operations.map((op) => op.name)).toContain("lineTo");
    expect(context.operations.filter((op) => op.name === "arc")).toHaveLength(
      2,
    );
    expect(
      context.operations.filter((op) => op.name === "closePath"),
    ).toHaveLength(2);
    expect(context.operations).toContainEqual({
      name: "strokeRect",
      args: [1, 2, 3, 4],
    });
    expect(context.operations).toContainEqual({
      name: "fillRect",
      args: [5, 6, 7, 8],
    });
    expect(() => screen.draw.line([0, Number.NaN], [1, 1], "red")).toThrow(
      TypeError,
    );
    expect(() => screen.draw.circle([0, 0], 0, "red")).toThrow(TypeError);
    expect(() => screen.draw.filled_circle([0, 0], -1, "red")).toThrow(
      TypeError,
    );
    expect(() =>
      screen.draw.polygon(
        [
          [0, 0],
          [1, 1],
        ],
        "red",
      ),
    ).toThrow(TypeError);
    expect(() =>
      screen.draw.filled_polygon(
        [
          [0, 0],
          [1, 1],
        ],
        "red",
      ),
    ).toThrow(TypeError);
    expect(() => screen.draw.rect([1, 2] as never, "red")).toThrow(TypeError);
    expect(() => screen.draw.filled_rect([1, 2] as never, "red")).toThrow(
      TypeError,
    );
  });

  test("blits surfaces and cached image names", async () => {
    const loader = createImageLoader({
      projectId: "phase_three",
      loadAsset: async () => surface(4, 5),
    });
    loader.define("hero.svg", surface(10, 11));
    const { screen, context } = mockScreen(loader);

    screen.blit(surface(6, 7), [3, 4]);
    screen.blit("hero.svg", [1, 2, 30, 40]);
    await screen.blit("missing", [0, 0]);

    expect(context.operations).toContainEqual({
      name: "drawImage",
      args: [expect.anything(), 3, 4],
    });
    expect(context.operations).toContainEqual({
      name: "drawImage",
      args: [expect.anything(), 1, 2, 30, 40],
    });
    expect(context.operations).toContainEqual({
      name: "drawImage",
      args: [expect.anything(), 0, 0],
    });
  });
});
