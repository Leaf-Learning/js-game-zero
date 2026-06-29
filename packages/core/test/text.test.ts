import { describe, expect, test } from "bun:test";
import {
  Screen,
  fitTextboxFontSize,
  layoutText,
  type CanvasLike,
} from "@js-game-zero/core";

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
    const size = Number.parseFloat(this.font) || 10;
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
        topright: [80, 20],
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

describe("draw.textbox", () => {
  test("chooses the largest font size that fits the target rect", () => {
    const context = new MockContext();
    const fit = fitTextboxFontSize(
      context as unknown as CanvasRenderingContext2D,
      "fit these words",
      [0, 0, 50, 24],
      { fontsize: 18, min_fontsize: 6 },
    );

    expect(fit.fontSize).toBeGreaterThanOrEqual(6);
    expect(fit.fontSize).toBeLessThan(18);
    expect(fit.lines.length).toBeGreaterThan(1);
  });

  test("renders textbox text inside the provided rectangle", () => {
    const { screen, context } = screenAndContext();
    screen.draw.textbox("compact label", [10, 12, 70, 28], {
      fontsize: 20,
      min_fontsize: 6,
      color: "white",
      background: "black",
      align: "center",
    });

    expect(context.operations).toContainEqual({
      name: "translate",
      args: [10, 12],
    });
    expect(context.operations.some((op) => op.name === "fillText")).toBe(true);
  });
});
