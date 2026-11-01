import { describe, expect, test } from "bun:test";
import {
  Screen,
  fonts,
  type FontAsset,
  type TextboxOptions,
} from "js-game-zero";
import {
  fitTextboxFontSize,
  layoutText,
  type CanvasLike,
} from "js-game-zero/host";

type Operation = { name: string; args: unknown[] };

class MockGradient {
  addColorStop(_offset: number, _color: string): void {}
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

  fillRect(...args: unknown[]): void {
    this.record("fillRect", ...args);
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
    // Font strings may now carry an "italic"/"bold" style prefix (e.g.
    // "italic bold 24px sans-serif"), so the size must be pulled out with a
    // regex rather than assuming it's the leading token.
    const match = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const size = match ? Number(match[1]) : 10;
    return { width: text.length * size * 0.5 } as TextMetrics;
  }

  private record(name: string, ...args: unknown[]): void {
    this.operations.push({ name, args });
  }
}

function screenAndContext(): { screen: Screen; context: MockContext } {
  const context = new MockContext();
  const canvas: CanvasLike = { width: 160, height: 120 };
  return {
    screen: new Screen(canvas, context as unknown as CanvasRenderingContext2D),
    context,
  };
}

describe("draw.text layout", () => {
  test("normalizes wrapping, alignment, anchor, and alpha options", () => {
    const context = new MockContext();
    const layout = layoutText(
      context as unknown as CanvasRenderingContext2D,
      "hello bright world",
      [80, 40],
      {
        fontsize: 10,
        width: 60,
        lineheight: 12,
        align: "center",
        anchor: "center",
        alpha: 2,
      },
    );

    expect(layout.lines).toEqual(["hello bright", "world"]);
    expect(layout.boxWidth).toBe(60);
    expect(layout.boxHeight).toBe(24);
    expect(layout.align).toBe("center");
    expect(layout.anchorOffset).toEqual([30, 12]);
    expect(layout.topLeft).toEqual([50, 28]);
    expect(layout.alpha).toBe(1);
  });

  test("places symbolic positions while preserving explicit anchors", () => {
    const context = new MockContext();
    const centered = layoutText(
      context as unknown as CanvasRenderingContext2D,
      "hello",
      undefined,
      {
        fontsize: 10,
        lineheight: 12,
        width: 50,
        center: [100, 100],
      },
    );
    const centeredWithAnchor = layoutText(
      context as unknown as CanvasRenderingContext2D,
      "hello",
      undefined,
      {
        fontsize: 10,
        lineheight: 12,
        width: 50,
        center: [100, 100],
        anchor: "center",
      },
    );
    const topRightWithAnchor = layoutText(
      context as unknown as CanvasRenderingContext2D,
      "pin",
      undefined,
      {
        fontsize: 10,
        lineheight: 12,
        width: 60,
        topRight: [80, 20],
        anchor: "center",
      },
    );

    expect(centered.topLeft).toEqual([75, 94]);
    expect(centered.anchorOffset).toEqual([25, 6]);
    expect(centeredWithAnchor.topLeft).toEqual([75, 94]);
    expect(centeredWithAnchor.anchorOffset).toEqual([25, 6]);
    expect(topRightWithAnchor.topLeft).toEqual([20, 20]);
    expect(topRightWithAnchor.anchorOffset).toEqual([30, 6]);
  });

  test("restores the previous canvas font when layout measurement throws", () => {
    const context = new MockContext();
    context.font = "13px serif";

    expect(() =>
      layoutText(
        context as unknown as CanvasRenderingContext2D,
        "cannot wrap",
        [0, 0],
        { fontsize: 20, width: 0 },
      ),
    ).toThrow(TypeError);
    expect(context.font).toBe("13px serif");
  });

  test("draws background, shadow, outline, gradient, and rotation", () => {
    const { screen, context } = screenAndContext();
    screen.draw.text("Score", [40, 30], {
      fontsize: 16,
      color: "white",
      gcolor: "yellow",
      background: "#102030",
      shadow: [2, 3],
      scolor: "black",
      owidth: 1,
      ocolor: "navy",
      anchor: "center",
      angle: 20,
      alpha: 0.5,
    });

    expect(context.operations.map((op) => op.name)).toContain("rotate");
    expect(context.operations.map((op) => op.name)).toContain("fillRect");
    expect(context.operations.map((op) => op.name)).toContain("strokeText");
    expect(
      context.operations.filter((op) => op.name === "fillText").length,
    ).toBe(2);
    expect(context.operations.map((op) => op.name)).toContain(
      "createLinearGradient",
    );
    expect(() => screen.draw.text("bad", [0, 0], { pos: [1, 1] })).toThrow(
      TypeError,
    );
  });
});

describe("beginner-friendly text calls", () => {
  function operationsFor(draw: (screen: Screen) => void): Operation[] {
    const { screen, context } = screenAndContext();
    draw(screen);
    return context.operations;
  }

  test("options can come second, in place of a position", () => {
    expect(
      operationsFor((screen) =>
        screen.draw.text("Game Over", { center: [80, 60], fontsize: 20 }),
      ),
    ).toEqual(
      operationsFor((screen) =>
        screen.draw.text("Game Over", undefined, {
          center: [80, 60],
          fontsize: 20,
        }),
      ),
    );
  });

  test("options given twice are rejected", () => {
    const { screen } = screenAndContext();
    expect(() =>
      screen.draw.text("Hi", { center: [1, 1] } as never, { fontsize: 9 }),
    ).toThrow("takes its options once");
  });

  test("readable option names match Pygame Zero's terse ones", () => {
    const terse = operationsFor((screen) =>
      screen.draw.text("Score", [40, 30], {
        fontsize: 16,
        gcolor: "yellow",
        shadow: [2, 3],
        scolor: "black",
        owidth: 1,
        ocolor: "navy",
      }),
    );
    const readable = operationsFor((screen) =>
      screen.draw.text("Score", [40, 30], {
        size: 16,
        gradientColor: "yellow",
        shadow: [2, 3],
        shadowColor: "black",
        outline: 1,
        outlineColor: "navy",
      }),
    );
    expect(readable).toEqual(terse);
    expect(
      operationsFor((screen) =>
        screen.draw.textbox("Hi", [0, 0, 80, 40], { minSize: 30 }),
      ),
    ).toEqual(
      operationsFor((screen) =>
        screen.draw.textbox("Hi", [0, 0, 80, 40], { minFontsize: 30 }),
      ),
    );
  });

  test("giving both names for one option is an error", () => {
    const { screen } = screenAndContext();
    expect(() =>
      screen.draw.text("Hi", [0, 0], { size: 10, fontsize: 12 }),
    ).toThrow("got both size and fontsize");
  });
});

describe("screen.measureText", () => {
  // The mock measures each character half its font size wide.
  test("measures as draw.text lays out: the widest line, the lines' height, and the lines", () => {
    const { screen, context } = screenAndContext();
    expect(screen.measureText("Play again", { size: 20 })).toEqual({
      width: 100,
      height: 24,
      lines: ["Play again"],
    });
    expect(screen.measureText("Hi\nthere", { size: 10 })).toEqual({
      width: 25,
      height: 24,
      lines: ["Hi", "there"],
    });
    // Wrapped at a width, it's as wide as its widest line, and lineheight
    // spaces its lines.
    expect(
      screen.measureText("hello bright world", {
        size: 10,
        width: 70,
        lineheight: 15,
      }),
    ).toEqual({ width: 60, height: 30, lines: ["hello bright", "world"] });
    expect(
      screen.measureText("hello bright world", { size: 10, widthem: 7 }).lines,
    ).toEqual(["hello bright", "world"]);
    // It draws nothing, and leaves the canvas's font as it was.
    expect(context.operations).toEqual([]);
    expect(context.font).toBe("10px sans-serif");
  });

  test("gives the box draw.text puts unwrapped text in", () => {
    const { screen, context } = screenAndContext();
    const layout = layoutText(
      context as unknown as CanvasRenderingContext2D,
      "Start",
      undefined,
      { center: [80, 60], fontsize: 20, bold: true },
    );
    expect(
      screen.measureText("Start", { center: [80, 60], size: 20, bold: true }),
    ).toEqual({
      width: layout.boxWidth,
      height: layout.boxHeight,
      lines: ["Start"],
    });
  });

  test("measures in the font draw.text would draw in", () => {
    const { screen, context } = screenAndContext();
    const measured: string[] = [];
    const measure = context.measureText.bind(context);
    context.measureText = (text: string): TextMetrics => {
      measured.push(context.font);
      return measure(text);
    };
    screen.measureText("Hi", {
      size: 18,
      bold: true,
      italic: true,
      sysfontname: "Georgia",
    });
    expect(measured).toEqual(['italic bold 18px "Georgia"']);
  });

  test("takes draw.text's arguments: a position and options, or options in its place", () => {
    const { screen } = screenAndContext();
    const expected = screen.measureText("Score: 3", { size: 16 });
    expect(screen.measureText("Score: 3", [20, 30], { size: 16 })).toEqual(
      expected,
    );
    // Where it goes and how it looks don't change its size.
    expect(
      screen.measureText("Score: 3", {
        size: 16,
        topRight: [150, 10],
        color: "gold",
        outline: 2,
        angle: 30,
      }),
    ).toEqual(expected);
    expect(screen.measureText("Score: 3", { fontsize: 16 })).toEqual(expected);
    // A number is measured as it reads, and the size is 24 unless given.
    expect(screen.measureText(12)).toEqual(
      screen.measureText("12", { size: 24 }),
    );
  });

  test("says what to change when a call is wrong", () => {
    const { screen } = screenAndContext();
    const loose = screen as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    expect(() => loose.measureText!()).toThrow(
      "screen.measureText is missing text: screen.measureText(text, options).",
    );
    expect(() => loose.measureText!({ size: 20 })).toThrow(
      `screen.measureText's text must be words in quotes or a number, but got {"size":20}.`,
    );
    expect(() => loose.measureText!("Score: 3", 20, 30, "white", 32)).toThrow(
      'screen.measureText takes its size in its options, as screen.draw.text does: screen.measureText("Score: 3", { size: 32 }) measures what screen.text("Score: 3", x, y, color, 32) draws.',
    );
    expect(() => loose.measureText!("Hi", [0, 0], {}, {})).toThrow(
      "screen.measureText takes the text and its options: screen.measureText(text, options).",
    );
    expect(() => screen.measureText("Hi", { colour: "red" } as never)).toThrow(
      "screen.measureText has no option called colour. Did you mean color?",
    );
    expect(() => screen.measureText("Hi", { size: 10, fontsize: 12 })).toThrow(
      "screen.measureText got both size and fontsize; they mean the same thing, so give just one.",
    );
    expect(() =>
      screen.measureText("Hi", { center: [1, 1] } as never, { size: 9 }),
    ).toThrow(
      'screen.measureText takes its options once: either second, as in measureText("Hi", { size: 20 }), or third, after a position.',
    );
    // draw.text's own message is unchanged.
    expect(() =>
      screen.draw.text("Hi", { center: [1, 1] } as never, { size: 9 }),
    ).toThrow(
      'screen.draw.text takes its options once: either second, as in text("Hi", { center: [x, y] }), or third, after a position.',
    );
  });
});

describe("draw.textbox", () => {
  test("chooses the largest font size that fits the target rect", () => {
    const context = new MockContext();
    const fit = fitTextboxFontSize(
      context as unknown as CanvasRenderingContext2D,
      "fit these words",
      [0, 0, 50, 24],
      { fontsize: 18, minFontsize: 6 },
    );

    expect(fit.fontSize).toBeGreaterThanOrEqual(6);
    expect(fit.fontSize).toBeLessThan(18);
    expect(fit.lines.length).toBeGreaterThan(1);
  });

  test("renders textbox text centered on the provided rectangle", () => {
    const { screen, context } = screenAndContext();
    screen.draw.textbox("compact label", [10, 12, 70, 28], {
      fontsize: 20,
      minFontsize: 6,
      color: "white",
      background: "black",
      align: "center",
    });

    // pgzero's drawbox anchors on the rect's center (0.5, 0.5), not its
    // top-left corner, so the canvas origin is translated to rect.center.
    expect(context.operations).toContainEqual({
      name: "translate",
      args: [45, 26],
    });
    expect(context.operations.some((op) => op.name === "fillText")).toBe(true);

    const fillRectOp = context.operations.find((op) => op.name === "fillRect");
    expect(fillRectOp).toBeTruthy();
    const [x = 0, y = 0, width = 0, height = 0] = (fillRectOp?.args ??
      []) as number[];
    // The background hugs the actual (fitted) text block, centered on the
    // translated origin, rather than the full requested rect.
    expect(x).toBeCloseTo(-width / 2, 5);
    expect(y).toBeCloseTo(-height / 2, 5);
    expect(width).toBeLessThanOrEqual(70);
    expect(height).toBeLessThanOrEqual(28);
  });

  test("textbox honors an explicit anchor override like pgzero's drawbox", () => {
    const { screen, context } = screenAndContext();
    screen.draw.textbox("hi", [10, 12, 70, 28], {
      fontsize: 12,
      minFontsize: 6,
      anchor: "topLeft",
    });

    // Upstream drawbox computes the position point as
    // rect.topLeft + anchor * rect.size and anchors the text there, so an
    // explicit "topLeft" lays the text out from the rect's own top-left.
    expect(context.operations).toContainEqual({
      name: "translate",
      args: [10, 12],
    });
  });

  test("textbox lines its text up the way its anchor places it, so centered by default", () => {
    // Where the line's x is on screen, and how the canvas aligns it there.
    function placed(options: TextboxOptions) {
      const { screen, context } = screenAndContext();
      screen.draw.textbox("You win!", [40, 60, 240, 80], options);
      const at = (name: string) =>
        context.operations.find((op) => op.name === name)?.args ?? [];
      const [x] = at("translate") as number[];
      const [, lineX] = at("fillText") as [string, number];
      return { x: (x ?? 0) + lineX, align: context.textAlign };
    }
    expect(placed({ size: 48 })).toEqual({ x: 160, align: "center" });
    expect(placed({ size: 48, anchor: "midBottom" })).toEqual({
      x: 160,
      align: "center",
    });
    expect(placed({ size: 48, anchor: "topLeft" })).toEqual({
      x: 40,
      align: "left",
    });
    expect(placed({ size: 48, anchor: "bottomRight" })).toEqual({
      x: 280,
      align: "right",
    });
    expect(placed({ size: 48, anchor: [10, "top"] })).toEqual({
      x: 40,
      align: "left",
    });
    expect(placed({ size: 48, align: "left" })).toEqual({
      x: 40,
      align: "left",
    });
  });
});

describe("draw.text bold/italic/underline", () => {
  function layout(options: Parameters<typeof layoutText>[3]) {
    const context = new MockContext();
    return layoutText(
      context as unknown as CanvasRenderingContext2D,
      "Hi",
      [0, 0],
      { fontsize: 20, ...options },
    );
  }

  test("bold sets the canvas font weight", () => {
    expect(layout({ bold: true }).font).toBe("bold 20px sans-serif");
  });

  test("italic sets the canvas font style", () => {
    expect(layout({ italic: true }).font).toBe("italic 20px sans-serif");
  });

  test("italic and bold combine in CSS shorthand order (style before weight)", () => {
    expect(layout({ italic: true, bold: true }).font).toBe(
      "italic bold 20px sans-serif",
    );
  });

  test("neither flag leaves the font string unchanged", () => {
    expect(layout({}).font).toBe("20px sans-serif");
  });

  test("underline draws a fillRect under each line at the expected offset/thickness", () => {
    const { screen, context } = screenAndContext();
    screen.draw.text("Hi", [0, 0], {
      fontsize: 20,
      underline: true,
      color: "white",
    });

    const fillRectOps = context.operations.filter(
      (op) => op.name === "fillRect",
    );
    expect(fillRectOps).toHaveLength(1);
    const [x, y, width, height] = fillRectOps[0]?.args as number[];
    // Left-aligned single line "Hi" at fontsize 20: measureText mock gives
    // width = 2 chars * 20 * 0.5 = 20. Underline spans [0, lineWidth].
    expect(x).toBeCloseTo(0, 5);
    expect(width).toBeCloseTo(20, 5);
    // Offset ~0.9 * fontsize below the line's top, thickness ~fontsize/15.
    expect(y).toBeCloseTo(20 * 0.9 - Math.max(1, 20 / 15) / 2, 5);
    expect(height).toBeCloseTo(Math.max(1, 20 / 15), 5);
  });

  test("underline respects alignment when computing the line's horizontal extent", () => {
    const { screen, context } = screenAndContext();
    screen.draw.text("Hi", [100, 0], {
      fontsize: 20,
      underline: true,
      align: "right",
      anchor: "topRight",
    });
    const fillRectOps = context.operations.filter(
      (op) => op.name === "fillRect",
    );
    expect(fillRectOps).toHaveLength(1);
    const [x = 0, , width = 0] = fillRectOps[0]?.args as number[];
    // Right-aligned: the underline's right edge sits at the anchor (x=0
    // relative to the translated origin), extending left by lineWidth.
    expect(x + width).toBeCloseTo(0, 5);
  });

  test("no underline fillRect is drawn when underline is unset", () => {
    const { screen, context } = screenAndContext();
    screen.draw.text("Hi", [0, 0], { fontsize: 20 });
    expect(context.operations.some((op) => op.name === "fillRect")).toBe(false);
  });
});

describe("draw.text sysfontname", () => {
  test("sysfontname is used verbatim as a CSS font family", () => {
    const layout = (() => {
      const context = new MockContext();
      return layoutText(
        context as unknown as CanvasRenderingContext2D,
        "Hi",
        [0, 0],
        { fontsize: 20, sysfontname: "Comic Sans MS" },
      );
    })();
    expect(layout.font).toBe('20px "Comic Sans MS"');
  });

  test("combining fontname and sysfontname throws", () => {
    const context = new MockContext();
    expect(() =>
      layoutText(context as unknown as CanvasRenderingContext2D, "Hi", [0, 0], {
        fontsize: 20,
        fontname: "myfont",
        sysfontname: "Arial",
      }),
    ).toThrow(TypeError);
  });
});

describe("draw.text fontname resolves through the fonts loader", () => {
  test("a loaded font's family is used once cached", () => {
    const asset: FontAsset = {
      kind: "font",
      name: "text_test_loaded.ttf",
      url: "/assets/default/fonts/text_test_loaded.ttf",
      family: "TextTestLoadedFamily",
    };
    fonts.define("text_test_loaded.ttf", asset);
    try {
      const context = new MockContext();
      const layout = layoutText(
        context as unknown as CanvasRenderingContext2D,
        "Hi",
        [0, 0],
        { fontsize: 20, fontname: "text_test_loaded.ttf" },
      );
      expect(layout.font).toBe('20px "TextTestLoadedFamily"');
    } finally {
      fonts.unload("text_test_loaded.ttf");
    }
  });

  test("an unloaded (but validly-named) fontname falls back to being treated as a literal CSS family, and starts loading", () => {
    const context = new MockContext();
    const layout = layoutText(
      context as unknown as CanvasRenderingContext2D,
      "Hi",
      [0, 0],
      { fontsize: 20, fontname: "text_test_not_yet_loaded" },
    );
    expect(layout.font).toBe('20px "text_test_not_yet_loaded"');
    // The lookup should have kicked off a load, participating in the
    // runtime's existing pendingCount()/waitForIdle() preload gate — no
    // separate wiring needed since it's the same global `fonts` loader.
    expect(fonts.pendingCount()).toBeGreaterThan(0);
    fonts.unload("text_test_not_yet_loaded");
  });

  test("a fontname that isn't a valid loader identifier still falls back gracefully (no crash)", () => {
    const context = new MockContext();
    const layout = layoutText(
      context as unknown as CanvasRenderingContext2D,
      "Hi",
      [0, 0],
      { fontsize: 20, fontname: "My Custom Font" },
    );
    expect(layout.font).toBe('20px "My Custom Font"');
  });

  test("a previously-fallback fontname renders correctly once it becomes available (no permanently wrong first paint)", () => {
    const name = "text_test_late_load";
    const layoutBefore = (() => {
      const context = new MockContext();
      return layoutText(
        context as unknown as CanvasRenderingContext2D,
        "Hi",
        [0, 0],
        { fontsize: 20, fontname: name },
      );
    })();
    expect(layoutBefore.font).toBe('20px "text_test_late_load"');

    // Simulate the load settling (as the real fonts loader would once the
    // FontFace fetch/decoded resolves).
    fonts.define(name, {
      kind: "font",
      name,
      url: `/assets/default/fonts/${name}`,
      family: "LateLoadedFamily",
    });
    try {
      const layoutAfter = (() => {
        const context = new MockContext();
        return layoutText(
          context as unknown as CanvasRenderingContext2D,
          "Hi",
          [0, 0],
          { fontsize: 20, fontname: name },
        );
      })();
      expect(layoutAfter.font).toBe('20px "LateLoadedFamily"');
    } finally {
      fonts.unload(name);
    }
  });
});

describe("draw.text scalar positioning kwargs", () => {
  function topLeftFor(options: Parameters<typeof layoutText>[3]) {
    const context = new MockContext();
    return layoutText(
      context as unknown as CanvasRenderingContext2D,
      "hi",
      undefined,
      { fontsize: 10, lineheight: 12, width: 50, ...options },
    ).topLeft;
  }

  test("right + top combine per-axis (a corner without needing `topRight`)", () => {
    expect(topLeftFor({ right: 780, top: 10 })).toEqual([730, 10]);
  });

  test("left + bottom combine per-axis", () => {
    // boxHeight = max(lineheight, 1 line * 12) = 12
    expect(topLeftFor({ left: 100, bottom: 200 })).toEqual([100, 188]);
  });

  test("centerX + centerY combine per-axis", () => {
    expect(topLeftFor({ centerX: 400, centerY: 300 })).toEqual([375, 294]);
  });

  test("a lone scalar falls back to the matching axis of `pos`", () => {
    const context = new MockContext();
    const layout = layoutText(
      context as unknown as CanvasRenderingContext2D,
      "hi",
      [5, 42],
      { fontsize: 10, lineheight: 12, width: 50, right: 780 },
    );
    expect(layout.topLeft).toEqual([730, 42]);
  });

  test("a scalar with no pos and no companion axis throws", () => {
    const context = new MockContext();
    expect(() =>
      layoutText(
        context as unknown as CanvasRenderingContext2D,
        "hi",
        undefined,
        { fontsize: 10, lineheight: 12, width: 50, right: 780 },
      ),
    ).toThrow(TypeError);
  });

  test("combining a scalar with a named compound key throws", () => {
    const context = new MockContext();
    expect(() =>
      layoutText(
        context as unknown as CanvasRenderingContext2D,
        "hi",
        undefined,
        {
          fontsize: 10,
          lineheight: 12,
          width: 50,
          right: 10,
          topLeft: [1, 2],
        },
      ),
    ).toThrow(TypeError);
  });

  test("two scalars on the same axis throw", () => {
    const context = new MockContext();
    expect(() =>
      layoutText(
        context as unknown as CanvasRenderingContext2D,
        "hi",
        undefined,
        { fontsize: 10, lineheight: 12, width: 50, left: 1, right: 2 },
      ),
    ).toThrow(TypeError);
  });

  test("draw.text renders using scalar positioning end-to-end", () => {
    const { screen, context } = screenAndContext();
    screen.draw.text("hi", undefined, {
      fontsize: 10,
      lineheight: 12,
      width: 50,
      right: 100,
      bottom: 80,
    });
    expect(context.operations).toContainEqual({
      name: "translate",
      args: [100, 80],
    });
  });
});

describe("wrap parity with ptext.py's wrap()", () => {
  function wrapped(
    text: string,
    width: number | undefined,
    strip?: boolean,
  ): readonly string[] {
    // measureText mock: 1 unit of width per character (font size 2 => *0.5).
    const context = new MockContext();
    context.font = "2px sans-serif";
    return layoutText(
      context as unknown as CanvasRenderingContext2D,
      text,
      [0, 0],
      {
        fontsize: 2,
        ...(width === undefined ? {} : { width }),
        ...(strip === undefined ? {} : { strip }),
      },
    ).lines;
  }

  test("preserves leading indentation", () => {
    expect(wrapped("  indented start of a longer line that wraps", 20)).toEqual(
      ["  indented start of", "a longer line that", "wraps"],
    );
  });

  test("leading indentation survives even with strip disabled", () => {
    expect(
      wrapped("  indented start of a longer line that wraps", 20, false),
    ).toEqual(["  indented start of ", "a longer line that", " wraps"]);
  });

  test("multi-space runs collapse only at chosen break points when stripping", () => {
    expect(wrapped("hello   world  foo bar baz", 10)).toEqual([
      "hello",
      "world  foo",
      "bar baz",
    ]);
  });

  test("multi-space runs are preserved verbatim when strip is false", () => {
    expect(wrapped("hello   world  foo bar baz", 10, false)).toEqual([
      "hello   ",
      "world  foo",
      " bar baz",
    ]);
  });

  test("a single overlong word is hard-broken onto its own line, not merged with neighbors", () => {
    expect(wrapped("supercalifragilisticexpialidocious short", 10)).toEqual([
      "supercalifragilisticexpialidocious",
      "short",
    ]);
  });

  test("a lone overlong word does not crash and occupies a single line", () => {
    expect(wrapped("supercalifragilisticexpialidocious", 10)).toEqual([
      "supercalifragilisticexpialidocious",
    ]);
  });

  test("trailing whitespace is stripped per line by default", () => {
    expect(
      wrapped("trailing spaces here    \nand another line   ", 30),
    ).toEqual(["trailing spaces here", "and another line"]);
  });

  test("trailing whitespace is preserved when strip is false", () => {
    expect(
      wrapped("trailing spaces here    \nand another line   ", 30, false),
    ).toEqual(["trailing spaces here   ", "and another line  "]);
  });

  test("width=undefined skips wrapping but still respects strip", () => {
    expect(wrapped("line one\nline two  ", undefined)).toEqual([
      "line one",
      "line two",
    ]);
    expect(wrapped("line one\nline two  ", undefined, false)).toEqual([
      "line one",
      "line two  ",
    ]);
  });

  test("tabs expand to four spaces before wrapping", () => {
    expect(wrapped("a\tb\tc", 20)).toEqual(["a    b    c"]);
  });

  test("does not crash on all-whitespace text with strip disabled", () => {
    expect(() => wrapped("     ", 10, false)).not.toThrow();
  });

  test("does not crash on leading spaces followed by a single unbreakable word", () => {
    expect(() => wrapped("   word", 10)).not.toThrow();
    expect(wrapped("   word", 10)).toEqual(["   word"]);
  });
});

describe("draw.text strip option", () => {
  test("strip defaults to true", () => {
    const context = new MockContext();
    const layout = layoutText(
      context as unknown as CanvasRenderingContext2D,
      "hello   ",
      [0, 0],
      { fontsize: 20 },
    );
    expect(layout.lines).toEqual(["hello"]);
  });

  test("strip: false preserves trailing whitespace", () => {
    const context = new MockContext();
    const layout = layoutText(
      context as unknown as CanvasRenderingContext2D,
      "hello   ",
      [0, 0],
      { fontsize: 20, strip: false },
    );
    expect(layout.lines).toEqual(["hello   "]);
  });
});
