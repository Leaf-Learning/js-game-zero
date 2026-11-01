import { describe, expect, test } from "bun:test";
import { chromium } from "@playwright/test";
import {
  ImageSurface,
  Screen,
  rgb,
  type RuntimeDiagnostic,
  type SurfaceLike,
  type TextSize,
} from "js-game-zero";
import {
  createImageLoader,
  getScreen,
  normalizeColor,
  setScreen,
  type CanvasLike,
  type DrawableImage,
} from "js-game-zero/host";
import { setActiveDiagnosticEmit } from "../src/runtime-diagnostics";

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
    const match = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const size = match ? Number(match[1]) : 10;
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
    expect(context.fillStyle).toBe("black");
    expect(context.operations.slice(-3)).toEqual([
      { name: "save", args: [] },
      { name: "fillRect", args: [0, 0, 120, 80] },
      { name: "restore", args: [] },
    ]);

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

  test("samples real browser clear and gradient pixels on a small canvas", async () => {
    const result = await Bun.build({
      entrypoints: ["packages/js-game-zero/src/index.ts"],
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
        screen.fill("#ff00ff");
        screen.clear();
        screen.fill("#ff0000", "#0000ff");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Missing browser canvas context.");
        screen.clear();
        const clearPixel = [...context.getImageData(2, 2, 1, 1).data];
        screen.fill("#ff0000", "#0000ff");
        return {
          clearPixel,
          top: [...context.getImageData(2, 0, 1, 1).data],
          bottom: [...context.getImageData(2, 3, 1, 1).data],
        };
      }, source);

      expect(pixels.clearPixel).toEqual([0, 0, 0, 255]);
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

  test("accepts every way of writing a CSS color", () => {
    for (const color of [
      "white",
      "LightBlue",
      "rebeccapurple",
      "transparent",
      "#f80",
      "#ff8800",
      "#0b1220cc",
      "rgb(20, 30, 40)",
      "rgba(0, 0, 0, 0.5)",
      "hsl(200 50% 40%)",
      "oklch(70% 0.1 200)",
    ]) {
      expect(normalizeColor(color)).toBe(color);
    }
  });

  test("rejects misspelled colors with a suggestion instead of drawing the wrong one", () => {
    expect(() => normalizeColor("lightblu")).toThrow(
      '"lightblu" isn\'t a color name. Did you mean "lightblue"?',
    );
    expect(() => normalizeColor("redd")).toThrow('Did you mean "red"?');
    expect(() => normalizeColor("light blue")).toThrow(
      'Did you mean "lightblue"?',
    );
    expect(() => normalizeColor("sparkly")).toThrow(
      'Use a color name like "red"',
    );
    expect(() => normalizeColor("#12345")).toThrow("isn't a hex color");
    expect(() => normalizeColor("")).toThrow(TypeError);
  });

  test("explains that tuple alpha is 0-255, not 0-1", () => {
    expect(() => normalizeColor([255, 0, 0, 0.5])).toThrow(
      "for half see-through use 128, not 0.5",
    );
    expect(() => normalizeColor([255, 0, 0, 300])).toThrow(
      "goes from 0 (invisible) to 255 (solid)",
    );
    expect(normalizeColor([255, 0, 0, 0])).toBe("rgba(255, 0, 0, 0)");
    expect(() => normalizeColor([1.5, 0, 0])).toThrow("whole numbers");
  });

  test("text and textbox reject options they don't have", () => {
    const { screen } = mockScreen();
    expect(() =>
      screen.draw.text("hi", [0, 0], { colour: "red" } as never),
    ).toThrow(
      "screen.draw.text has no option called colour. Did you mean color?",
    );
    expect(() =>
      screen.draw.textbox("hi", [0, 0, 40, 20], { width: 30 } as never),
    ).toThrow("screen.draw.textbox has no option called width.");
    // Pygame Zero spellings name the camelCase option or anchor.
    expect(() => screen.draw.text("hi", { topleft: [0, 0] } as never)).toThrow(
      "screen.draw.text has no option called topleft. Did you mean topLeft?",
    );
    expect(() =>
      screen.draw.text("hi", [0, 0], { outline_color: "red" } as never),
    ).toThrow("Did you mean outlineColor?");
    expect(() =>
      screen.draw.textbox("hi", [0, 0, 40, 20], { min_fontsize: 8 } as never),
    ).toThrow("Did you mean minFontsize?");
    expect(() =>
      screen.draw.text("hi", [0, 0], { anchor: "midbottom" } as never),
    ).toThrow("Unknown text anchor: midbottom. Did you mean midBottom?");
  });

  test("textbox refuses position options up front, since its rect places its text", () => {
    const { screen, context } = mockScreen();
    const options = {
      center: [20, 10],
      topLeft: [0, 0],
      pos: [0, 0],
      left: 5,
      centerY: 10,
    };
    for (const [option, value] of Object.entries(options)) {
      expect(() =>
        screen.draw.textbox("hi", [0, 0, 40, 20], {
          [option]: value,
        } as never),
      ).toThrow(
        `screen.draw.textbox places its text with its rect, so it has no option called ${option}. Move the rect to move the text, and use anchor (like anchor: "topLeft") and align to place the text inside it.`,
      );
    }
    expect(context.operations).toEqual([]);
  });

  test("draw.image draws an image like blit", () => {
    const loader = createImageLoader({
      projectId: "draw_image",
      loadAsset: async () => surface(),
    });
    loader.define("tree.png", surface());
    const viaImage = mockScreen(loader);
    const viaBlit = mockScreen(loader);
    viaImage.screen.draw.image("tree.png", [5, 6]);
    viaBlit.screen.blit("tree.png", [5, 6]);
    expect(viaImage.context.operations).toEqual(viaBlit.context.operations);
    expect(viaImage.context.operations.map((op) => op.name)).toContain(
      "drawImage",
    );
  });

  test("draw primitives validate inputs and call canvas operations", () => {
    const { screen, context } = mockScreen();
    screen.draw.line([1, 2], [10, 20], "red", 3);
    screen.draw.circle([20, 20], 5, "blue", 2);
    screen.draw.filledCircle([30, 30], 6, "green");
    screen.draw.polygon(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      "white",
    );
    screen.draw.filledPolygon(
      [
        [0, 0],
        [5, 0],
        [5, 5],
      ],
      "yellow",
    );
    screen.draw.rect([1, 2, 3, 4], "purple", 4);
    screen.draw.filledRect({ left: 5, top: 6, width: 7, height: 8 }, "orange");

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
    expect(() => screen.draw.filledCircle([0, 0], -1, "red")).toThrow(
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
      screen.draw.filledPolygon(
        [
          [0, 0],
          [1, 1],
        ],
        "red",
      ),
    ).toThrow(TypeError);
    expect(() => screen.draw.rect([1, 2] as never, "red")).toThrow(TypeError);
    expect(() => screen.draw.filledRect([1, 2] as never, "red")).toThrow(
      TypeError,
    );
  });

  test("restores saved canvas state when a drawing operation throws", () => {
    const { screen, context } = mockScreen();

    expect(() => screen.draw.line([0, 0], [1, 1], [999, 0, 0])).toThrow(
      TypeError,
    );
    expect(context.operations.map((operation) => operation.name)).toEqual([
      "save",
      "restore",
    ]);
  });

  test("blits surfaces and cached image names", async () => {
    const loader = createImageLoader({
      projectId: "test_project",
      loadAsset: async () => surface(4, 5),
    });
    loader.define("hero.svg", surface(10, 11));
    const { screen, context } = mockScreen(loader);

    screen.blit(surface(6, 7), [3, 4]);
    screen.blit("hero.svg", [1, 2, 30, 40]);

    expect(context.operations).toContainEqual({
      name: "drawImage",
      args: [expect.anything(), 3, 4],
    });
    expect(context.operations).toContainEqual({
      name: "drawImage",
      args: [expect.anything(), 1, 2],
    });
  });

  test("an image that hasn't loaded draws nothing, even once it loads", async () => {
    const loader = createImageLoader({
      projectId: "test_project",
      loadAsset: async () => surface(4, 5),
    });
    const { screen, context } = mockScreen(loader);
    const drawnAt = (x: number, y: number) =>
      context.operations.filter(
        (operation) =>
          operation.name === "drawImage" &&
          operation.args[1] === x &&
          operation.args[2] === y,
      ).length;

    // Painting it later would land on top of whatever came after it.
    await screen.blit("late", [7, 8]);
    expect(drawnAt(7, 8)).toBe(0);

    screen.blit("late", [7, 8]);
    expect(drawnAt(7, 8)).toBe(1);
  });

  test("a missing image is reported to the run once, with no unhandled rejection", async () => {
    const loader = createImageLoader({
      projectId: "test_project",
      loadAsset: async () => {
        throw new Error("404");
      },
    });
    const { screen } = mockScreen(loader);
    const diagnostics: RuntimeDiagnostic[] = [];
    let unhandled: unknown;
    const onUnhandledRejection = (reason: unknown) => {
      unhandled = reason;
    };
    process.on("unhandledRejection", onUnhandledRejection);
    try {
      // A draw() blits it every frame, ignoring what blit returns.
      for (let frame = 0; frame < 3; frame += 1) {
        const previous = setActiveDiagnosticEmit((diagnostic) =>
          diagnostics.push(diagnostic),
        );
        screen.blit("missing", [0, 0]);
        setActiveDiagnosticEmit(previous);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      }
      expect(unhandled).toBeUndefined();
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        phase: "asset",
        message: expect.stringContaining('Failed to load image "missing"'),
      }),
    ]);
    // The loader keeps the failures for the runtime's asset gate, and
    // awaiting blit still rejects.
    await expect(loader.waitForIdle()).rejects.toThrow(
      "3 image assets failed to load.",
    );
    await expect(screen.blit("missing", [0, 0])).rejects.toThrow(
      "Missing image asset: missing",
    );
  });
});

/** The short forms take values the typed API rejects, so tests reach them untyped. */
type Loose = Record<string, (...args: unknown[]) => unknown>;

/** What a drawing call leaves on the canvas: its operations and styles. */
function drawn(draw: (screen: Screen) => void) {
  const { screen, context } = mockScreen();
  draw(screen);
  return {
    operations: context.operations,
    fillStyle: context.fillStyle,
    strokeStyle: context.strokeStyle,
    lineWidth: context.lineWidth,
  };
}

describe("Screen short forms", () => {
  test("draw exactly what the screen.draw long forms draw", () => {
    expect(drawn((screen) => screen.circle(200, 150, 25, "gold"))).toEqual(
      drawn((screen) => screen.draw.filledCircle([200, 150], 25, "gold")),
    );
    expect(drawn((screen) => screen.rect(10, 20, 30, 40, "red"))).toEqual(
      drawn((screen) => screen.draw.filledRect([10, 20, 30, 40], "red")),
    );
    expect(
      drawn((screen) => screen.triangle(160, 40, 120, 120, 200, 120, "lime")),
    ).toEqual(
      drawn((screen) =>
        screen.draw.filledPolygon(
          [
            [160, 40],
            [120, 120],
            [200, 120],
          ],
          "lime",
        ),
      ),
    );
    expect(drawn((screen) => screen.line(1, 2, 10, 20, "blue", 3))).toEqual(
      drawn((screen) => screen.draw.line([1, 2], [10, 20], "blue", 3)),
    );
  });

  test("fill their shapes, with x, y as the rect's top-left corner", () => {
    const circle = drawn((screen) => screen.circle(200, 150, 25, "gold"));
    expect(circle.operations.map((op) => op.name)).toContain("fill");
    expect(circle.operations.map((op) => op.name)).not.toContain("stroke");
    expect(circle.operations).toContainEqual({
      name: "arc",
      args: [200, 150, 25, 0, Math.PI * 2],
    });
    expect(
      drawn((screen) => screen.rect(10, 20, 30, 40)).operations,
    ).toContainEqual({ name: "fillRect", args: [10, 20, 30, 40] });
    const triangle = drawn((screen) => screen.triangle(0, 0, 10, 0, 5, 8));
    expect(triangle.operations.map((op) => op.name)).toEqual([
      "save",
      "beginPath",
      "moveTo",
      "lineTo",
      "lineTo",
      "closePath",
      "fill",
      "restore",
    ]);
  });

  test("default to white, and a line to width 1", () => {
    expect(drawn((screen) => screen.circle(5, 5, 2)).fillStyle).toBe("white");
    expect(drawn((screen) => screen.rect(0, 0, 4, 4)).fillStyle).toBe("white");
    expect(drawn((screen) => screen.triangle(0, 0, 4, 0, 2, 3)).fillStyle).toBe(
      "white",
    );
    const line = drawn((screen) => screen.line(0, 0, 9, 9));
    expect(line.strokeStyle).toBe("white");
    expect(line.lineWidth).toBe(1);
  });

  test("take every color the long forms take, checked the same way", () => {
    expect(drawn((screen) => screen.circle(5, 5, 2, "#ff8800")).fillStyle).toBe(
      "#ff8800",
    );
    expect(
      drawn((screen) => screen.rect(0, 0, 4, 4, [10, 20, 30])).fillStyle,
    ).toBe("rgb(10, 20, 30)");
    expect(
      drawn((screen) => screen.line(0, 0, 9, 9, [255, 0, 0, 51])).strokeStyle,
    ).toBe("rgba(255, 0, 0, 0.2)");
    const { screen } = mockScreen();
    expect(() => screen.circle(5, 5, 2, "lightblu")).toThrow(
      'Did you mean "lightblue"?',
    );
    expect(() => screen.rect(0, 0, 4, 4, [255, 0, 0, 0.5])).toThrow(
      "for half see-through use 128, not 0.5",
    );
    expect(() => screen.circle(5, 5, 0)).toThrow(
      "radius must be a positive finite number.",
    );
    expect(() => screen.line(0, 0, 9, 9, "red", 0)).toThrow(
      "width must be a positive finite number.",
    );
  });

  test("a list where numbers belong points to the screen.draw method for lists", () => {
    const screen = mockScreen().screen as unknown as Loose;
    expect(() => screen.circle!([200, 150], 25)).toThrow(
      'screen.circle takes x, y as two numbers, like screen.circle(200, 150, 25, "gold"). For an [x, y] list, use screen.draw.filledCircle([x, y], radius, color).',
    );
    expect(() => screen.circle!([200, 150], 25)).toThrow(TypeError);
    expect(() => screen.rect!([10, 20, 30, 40], "red")).toThrow(
      "For a list or a Rect, use screen.draw.filledRect([x, y, width, height], color).",
    );
    expect(() =>
      screen.rect!({ left: 0, top: 0, width: 4, height: 4 }),
    ).toThrow("screen.rect takes x, y, width, height as four numbers");
    expect(() => screen.triangle!([0, 0], [10, 0], [5, 8])).toThrow(
      "use screen.draw.filledPolygon([[x1, y1], [x2, y2], [x3, y3]], color)",
    );
    expect(() => screen.line!([0, 0], [10, 10], "red")).toThrow(
      "use screen.draw.line([x1, y1], [x2, y2], color, width)",
    );
  });

  test("a missing or non-number argument is named", () => {
    const screen = mockScreen().screen as unknown as Loose;
    expect(() => screen.circle!(200, 150)).toThrow(
      "screen.circle is missing radius: screen.circle(x, y, radius, color).",
    );
    expect(() => screen.rect!(10, 20, 30)).toThrow(
      "screen.rect is missing height: screen.rect(x, y, width, height, color).",
    );
    expect(() => screen.triangle!(0, 0, 10, 0, 5)).toThrow(
      "screen.triangle is missing y3",
    );
    expect(() => screen.line!(0, 0, 10)).toThrow("screen.line is missing y2");
    expect(() => screen.circle!("200", 150, 25)).toThrow(
      'screen.circle\'s x must be a number, but got "200".',
    );
    expect(() => screen.line!(0, Number.NaN, 10, 10)).toThrow(
      "screen.line's y1 must be a number, but got NaN.",
    );
  });

  test("an outline width points to the outline method, since short forms fill", () => {
    const screen = mockScreen().screen as unknown as Loose;
    expect(() => screen.circle!(200, 150, 25, "gold", 2)).toThrow(
      "screen.circle always fills, so it has no outline width. For an outline, use screen.draw.circle([x, y], radius, color, width).",
    );
    expect(() => screen.rect!(0, 0, 4, 4, "red", 2)).toThrow(
      "use screen.draw.rect([x, y, width, height], color, width)",
    );
    expect(() => screen.triangle!(0, 0, 4, 0, 2, 3, "red", 2)).toThrow(
      "use screen.draw.polygon(",
    );
    expect(() => screen.line!(0, 0, 9, 9, "red", 2, 3)).toThrow(
      "screen.line takes at most six values",
    );
  });

  test("leave the canvas untouched when a call is wrong", () => {
    const { screen, context } = mockScreen();
    expect(() => (screen as unknown as Loose).circle!([1, 2], 3)).toThrow();
    expect(() => (screen as unknown as Loose).text!("Hi", [1, 2])).toThrow();
    expect(context.operations).toEqual([]);
  });

  test("screen.text draws what screen.draw.text draws from its top-left", () => {
    expect(
      drawn((screen) => screen.text("Score: 3", 20, 30, "gold", 32)),
    ).toEqual(
      drawn((screen) =>
        screen.draw.text("Score: 3", [20, 30], { color: "gold", size: 32 }),
      ),
    );
    // White and 24 tall unless told otherwise, and a number reads as itself.
    expect(drawn((screen) => screen.text(12, 5, 5))).toEqual(
      drawn((screen) =>
        screen.draw.text("12", [5, 5], { color: "white", size: 24 }),
      ),
    );
  });

  test("screen.text says what to change when a call is wrong", () => {
    const screen = mockScreen().screen as unknown as Loose;
    expect(() => screen.text!()).toThrow(
      "screen.text is missing text: screen.text(text, x, y, color, size).",
    );
    expect(() => screen.text!({ a: 1 }, 1, 2)).toThrow(
      "screen.text's text must be words in quotes or a number, but got",
    );
    expect(() => screen.text!("Hi", [20, 30])).toThrow(
      "For an [x, y] list or options such as center, use screen.draw.text(text, [x, y], options).",
    );
    expect(() => screen.text!("Hi", 20)).toThrow(
      "screen.text is missing y: screen.text(text, x, y, color, size).",
    );
    expect(() => screen.text!("Hi", "20", 30)).toThrow(
      'screen.text\'s x must be a number, but got "20".',
    );
    expect(() => screen.text!("Hi", 1, 2, "red", 20, 3)).toThrow(
      "screen.text takes at most five values",
    );
  });
});

describe("Rounded rectangles", () => {
  const looseScreen = (): { short: Loose; draw: Loose } => {
    const { screen } = mockScreen();
    return {
      short: screen as unknown as Loose,
      draw: screen.draw as unknown as Loose,
    };
  };

  test("round each corner with a quarter circle, then fill or outline", () => {
    const filled = drawn((screen) =>
      screen.draw.filledRoundedRect([10, 20, 100, 40], 8, "gold"),
    );
    expect(filled.operations).toEqual([
      { name: "save", args: [] },
      { name: "beginPath", args: [] },
      { name: "moveTo", args: [18, 20] },
      { name: "arc", args: [102, 28, 8, -Math.PI / 2, 0] },
      { name: "arc", args: [102, 52, 8, 0, Math.PI / 2] },
      { name: "arc", args: [18, 52, 8, Math.PI / 2, Math.PI] },
      { name: "arc", args: [18, 28, 8, Math.PI, Math.PI * 1.5] },
      { name: "closePath", args: [] },
      { name: "fill", args: [] },
      { name: "restore", args: [] },
    ]);
    expect(filled.fillStyle).toBe("gold");

    const outline = drawn((screen) =>
      screen.draw.roundedRect(
        { left: 10, top: 20, width: 100, height: 40 },
        8,
        [255, 0, 0],
        3,
      ),
    );
    expect(outline.operations.map((op) => op.name)).toEqual(
      filled.operations.map((op) => (op.name === "fill" ? "stroke" : op.name)),
    );
    expect(outline.strokeStyle).toBe("rgb(255, 0, 0)");
    expect(outline.lineWidth).toBe(3);
    expect(
      drawn((screen) => screen.draw.roundedRect([0, 0, 9, 9], 2, "red"))
        .lineWidth,
    ).toBe(1);
  });

  test("a radius past half the shorter side gives round ends, and 0 square corners", () => {
    const radii = (draw: (screen: Screen) => void): unknown[] =>
      drawn(draw)
        .operations.filter((op) => op.name === "arc")
        .map((op) => op.args[2]);
    expect(
      radii((screen) =>
        screen.draw.filledRoundedRect([0, 0, 100, 30], 50, "white"),
      ),
    ).toEqual([15, 15, 15, 15]);
    expect(
      radii((screen) =>
        screen.draw.filledRoundedRect([0, 0, 40, 40], 99, "red"),
      ),
    ).toEqual([20, 20, 20, 20]);
    expect(
      radii((screen) =>
        screen.draw.filledRoundedRect([0, 0, 10, 10], 0, "red"),
      ),
    ).toEqual([0, 0, 0, 0]);
  });

  test("a negative width or height counts back from x, y, as fillRect does", () => {
    expect(
      drawn((screen) =>
        screen.draw.filledRoundedRect([110, 50, -100, -30], 6, "white"),
      ).operations,
    ).toEqual(
      drawn((screen) =>
        screen.draw.filledRoundedRect([10, 20, 100, 30], 6, "white"),
      ).operations,
    );
  });

  test("screen.roundedRect is filledRoundedRect's short form, white unless told", () => {
    expect(
      drawn((screen) => screen.roundedRect(10, 20, 30, 40, 6, "red")),
    ).toEqual(
      drawn((screen) =>
        screen.draw.filledRoundedRect([10, 20, 30, 40], 6, "red"),
      ),
    );
    expect(drawn((screen) => screen.roundedRect(0, 0, 4, 4, 1)).fillStyle).toBe(
      "white",
    );
  });

  test("a color where the radius belongs says the radius comes first", () => {
    const { short, draw } = looseScreen();
    expect(() => short.roundedRect!(40, 40, 120, 60, "orange", 12)).toThrow(
      'screen.roundedRect takes the corners\' radius before the color, like screen.roundedRect(40, 40, 120, 60, 12, "orange").',
    );
    expect(() => short.roundedRect!(40, 40, 120, 60, [255, 0, 0])).toThrow(
      "screen.roundedRect takes the corners' radius before the color",
    );
    expect(() => draw.filledRoundedRect!([0, 0, 10, 10], "red", 4)).toThrow(
      "screen.draw.filledRoundedRect takes the corners' radius before the color: screen.draw.filledRoundedRect(rect, radius, color).",
    );
    expect(() => draw.roundedRect!([0, 0, 10, 10], [1, 2, 3], 4)).toThrow(
      "screen.draw.roundedRect takes the corners' radius before the color: screen.draw.roundedRect(rect, radius, color, width).",
    );
  });

  test("a missing, non-number or negative radius is named", () => {
    const { short, draw } = looseScreen();
    expect(() => short.roundedRect!(0, 0, 10, 10)).toThrow(
      "screen.roundedRect is missing radius: screen.roundedRect(x, y, width, height, radius, color).",
    );
    expect(() => draw.filledRoundedRect!([0, 0, 10, 10])).toThrow(
      "screen.draw.filledRoundedRect is missing radius: screen.draw.filledRoundedRect(rect, radius, color).",
    );
    expect(() => short.roundedRect!(0, 0, 10, 10, Number.NaN)).toThrow(
      "screen.roundedRect's radius must be a number, but got NaN.",
    );
    expect(() => draw.roundedRect!([0, 0, 10, 10], true, "red")).toThrow(
      "screen.draw.roundedRect's radius must be a number, but got true.",
    );
    expect(() => short.roundedRect!(0, 0, 10, 10, -2)).toThrow(
      "screen.roundedRect's radius must be 0 or more, but got -2.",
    );
    expect(() => draw.filledRoundedRect!([0, 0, 10, 10], -1, "red")).toThrow(
      "screen.draw.filledRoundedRect's radius must be 0 or more, but got -1.",
    );
  });

  test("a list points to the draw form, and an outline width to the outline method", () => {
    const { short, draw } = looseScreen();
    expect(() => short.roundedRect!([0, 0, 10, 10], 4, "red")).toThrow(
      "For a list or a Rect, use screen.draw.filledRoundedRect([x, y, width, height], radius, color).",
    );
    expect(() => short.roundedRect!(0, 0, 10, 10, 4, "red", 2)).toThrow(
      "screen.roundedRect always fills, so it has no outline width. For an outline, use screen.draw.roundedRect([x, y, width, height], radius, color, width).",
    );
    expect(() => draw.filledRoundedRect!([0, 0, 10, 10], 4, "red", 2)).toThrow(
      "screen.draw.filledRoundedRect always fills, so it has no outline width. For an outline, use screen.draw.roundedRect(rect, radius, color, width).",
    );
    expect(() => draw.roundedRect!([0, 0, 10, 10], 4, "red", 0)).toThrow(
      "width must be a positive finite number.",
    );
    expect(() => draw.roundedRect!([0, 0, 10, 10], 4, "lightblu")).toThrow(
      'Did you mean "lightblue"?',
    );
  });

  test("leave the canvas untouched when the call is wrong", () => {
    const { screen, context } = mockScreen();
    const loose = screen as unknown as Loose;
    const draw = screen.draw as unknown as Loose;
    expect(() => loose.roundedRect!(0, 0, 10, 10, "red")).toThrow();
    expect(() => draw.filledRoundedRect!([0, 0, 10, 10], -1, "red")).toThrow();
    expect(() =>
      draw.filledRoundedRect!([0, 0, 10, 10], 4, "red", 2),
    ).toThrow();
    expect(() => draw.roundedRect!([0, 0], 4, "red")).toThrow(TypeError);
    expect(context.operations).toEqual([]);
  });
});

describe("Rounded rectangles and measured text in a real browser", () => {
  test("round the corners a game draws, and measure text as it draws it", async () => {
    const result = await Bun.build({
      entrypoints: ["packages/js-game-zero/src/browser.ts"],
      target: "browser",
      format: "iife",
    });
    expect(result.success).toBe(true);
    const bundle = await result.outputs[0]?.text();
    if (!bundle) throw new Error("Missing script-tag bundle.");

    const game = (density: number) => `
WIDTH = 200
HEIGHT = 120
PIXEL_DENSITY = ${density}
let label = null
let wrapped = null
function draw() {
  screen.fill("black")
  screen.roundedRect(20, 20, 100, 60, 20, "white")
  screen.draw.filledRoundedRect([130, 20, 60, 20], 50, "red")
  screen.draw.roundedRect([130, 60, 60, 40], 10, "lime", 4)
  label = screen.measureText("Play again", { size: 20, bold: true })
  wrapped = screen.measureText("one two three four", [0, 0], { size: 16, width: 60 })
  screen.draw.text("Play again", [10, 90], { size: 20, bold: true, color: "yellow" })
}
`;

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ content: bundle });
      const results = await page.evaluate(
        async (sources) => {
          const jgz = window.JGZ!;
          const played = [];
          for (const source of sources) {
            const canvas = document.createElement("canvas");
            document.body.append(canvas);
            const handle = jgz.run(source, { canvas, autostart: false });
            await handle.ready;
            handle.step(1 / 60);
            const inspector = jgz.getGameInspector(handle)!;
            const context = canvas.getContext("2d")!;
            const density = canvas.width / 200;
            const pixel = (x: number, y: number): number[] => [
              ...context.getImageData(
                Math.floor(x * density),
                Math.floor(y * density),
                1,
                1,
              ).data,
            ];
            // The rightmost column with yellow in it, in screen pixels.
            let inkRight = 0;
            const rows = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
            for (let y = Math.floor(88 * density); y < rows.height; y += 1) {
              for (let x = 0; x < rows.width; x += 1) {
                const at = (y * rows.width + x) * 4;
                if (rows.data[at]! > 128 && rows.data[at + 2]! < 100) {
                  inkRight = Math.max(inkRight, (x + 1) / density);
                }
              }
            }
            played.push({
              label: inspector.inspect("label"),
              wrapped: inspector.inspect("wrapped"),
              drawn: inspector.inspect("$drawn"),
              inkRight,
              roundedCorner: pixel(22, 22),
              roundedEdge: pixel(70, 21),
              roundedInside: pixel(30, 30),
              pillCorner: pixel(131, 21),
              pillEnd: pixel(131, 30),
              outlineEdge: pixel(160, 61),
              outlineInside: pixel(160, 80),
              outlineCorner: pixel(130, 60),
            });
            handle.stop();
          }
          return played;
        },
        [game(1), game(2)],
      );

      const [plain, dense] = results;
      if (!plain || !dense) throw new Error("Missing game results.");
      const black = [0, 0, 0, 255];
      expect(plain.roundedCorner).toEqual(black);
      expect(plain.roundedEdge).toEqual([255, 255, 255, 255]);
      expect(plain.roundedInside).toEqual([255, 255, 255, 255]);
      expect(plain.pillCorner).toEqual(black);
      expect(plain.pillEnd).toEqual([255, 0, 0, 255]);
      expect(plain.outlineEdge).toEqual([0, 255, 0, 255]);
      expect(plain.outlineInside).toEqual(black);
      expect(plain.outlineCorner).toEqual(black);

      const label = plain.label as unknown as TextSize;
      expect(label).toEqual({
        width: expect.any(Number),
        height: 24,
        lines: ["Play again"],
      });
      // The text drawn with the same options has the box that was measured,
      // and its last ink a pixel or two inside it.
      expect(plain.drawn).toContainEqual({
        kind: "text",
        text: "Play again",
        x: 10,
        y: 90,
        width: label.width,
        height: 24,
        color: "yellow",
      });
      expect(plain.inkRight).toBeLessThanOrEqual(10 + label.width + 1);
      expect(plain.inkRight).toBeGreaterThan(10 + label.width - 4);
      expect(plain.wrapped).toMatchObject({
        height: 16 * 1.2 * 3,
        lines: ["one two", "three", "four"],
      });
      expect((plain.wrapped as { width: number }).width).toBeLessThan(60);
      expect(plain.drawn).toContainEqual({
        kind: "rect",
        x: 20,
        y: 20,
        width: 100,
        height: 60,
        color: "white",
        filled: true,
        radius: 20,
      });
      // Logical pixels, whatever the density.
      expect(dense.label).toEqual(plain.label);
      expect(dense.wrapped).toEqual(plain.wrapped);
      expect(dense.roundedCorner).toEqual(black);
      expect(dense.pillEnd).toEqual([255, 0, 0, 255]);
    } finally {
      await browser.close();
    }
  });
});

describe("rgb", () => {
  test("returns the matching RGB or RGBA list, which drawing calls accept", () => {
    expect(rgb(255, 140, 105)).toEqual([255, 140, 105]);
    expect(rgb(255, 140, 105, 128)).toEqual([255, 140, 105, 128]);
    expect(rgb(0, 0, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(normalizeColor(rgb(255, 140, 105))).toBe("rgb(255, 140, 105)");
    expect(
      drawn((screen) => screen.circle(5, 5, 2, rgb(1, 2, 3))).fillStyle,
    ).toBe("rgb(1, 2, 3)");
  });

  test("checks each number like a color list does", () => {
    expect(() => rgb(300, 0, 0)).toThrow(
      "rgb(300, 0, 0) isn't a color: red, green and blue must be whole numbers from 0 to 255.",
    );
    expect(() => rgb(127.5, 0, 0)).toThrow("whole numbers from 0 to 255");
    expect(() => rgb(255, 0, 0, 0.5)).toThrow(
      "rgb(255, 0, 0, 0.5) isn't a color: the fourth number (alpha) goes from 0 (invisible) to 255 (solid), so for half see-through use 128, not 0.5.",
    );
    expect(() => rgb(255, 0, 0, 300)).toThrow(
      "goes from 0 (invisible) to 255 (solid).",
    );
  });

  test("names a missing or non-number argument", () => {
    const loose = rgb as unknown as (...args: unknown[]) => unknown;
    expect(() => loose(255, 140)).toThrow(
      "rgb is missing blue: rgb(red, green, blue), each from 0 to 255.",
    );
    expect(() => loose()).toThrow("rgb is missing red");
    expect(() => loose(255, "140", 105)).toThrow(
      'rgb\'s green must be a number, but got "140".',
    );
    expect(() => loose(255, 140, 105, null)).toThrow(
      "rgb's alpha must be a number, but got null.",
    );
    expect(() => loose(255, 140, 105)).not.toThrow();
  });
});

describe("getScreen() active-screen tracking", () => {
  test("throws with no active Screen configured, then resolves once one is activated via setScreen()", () => {
    // rendering.ts tracks the "active" Screen in module-level state
    // toggled by setScreen(); other test files sharing this process may
    // leave a stray Screen active, so reset explicitly first to make
    // this assertion deterministic regardless of file/test execution
    // order.
    setScreen(null);
    try {
      expect(() => getScreen()).toThrow(
        "No active Screen has been configured.",
      );

      const { screen } = mockScreen();
      setScreen(screen);
      expect(getScreen()).toBe(screen);
    } finally {
      setScreen(null);
    }
  });
});
