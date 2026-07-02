// Real-browser harness for tests/e2e/text-geometry.pw.ts. Bundled on the fly
// (see the spec file) via `bun build ... --format=iife` and injected into an
// already-loaded sandbox page with `page.addScriptTag`, so it never needs
// its own server route. It draws directly with `@js-game-zero/core`'s
// `Screen`/`layoutText`/`fitTextboxFontSize`/`fonts` — independent of
// whatever fixture markup happens to be on the host page — and reports raw
// pixel/layout data on `window.__jgzTextGeometry` for the spec to assert on.

import { Screen, fonts, layoutText } from "@js-game-zero/core";

type InkBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

declare global {
  interface Window {
    __jgzTextGeometry?: {
      ready: boolean;
      error?: string;
      boldInkCoverage: number;
      regularInkCoverage: number;
      scalarPositioning: {
        inkBounds: InkBounds | null;
        fontString: string;
      };
      textboxCentering: {
        topMargin: number;
        bottomMargin: number;
        rectHeight: number;
      };
      customFont: {
        fontFamilyDeclared: boolean;
        layoutFontContainsFamily: boolean;
        pixelsDifferFromFallback: boolean;
        documentFontLoaded: boolean;
      };
    };
  }
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  document.body.appendChild(canvas);
  return canvas;
}

function readback(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Missing 2d context");
  return context;
}

/** Sum of the red channel (proxy for "ink") over a region — higher means heavier/denser glyph strokes. */
function inkCoverage(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  const { data } = context.getImageData(x, y, width, height);
  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    total += data[index] ?? 0;
  }
  return total;
}

/** Bounding box of all pixels whose red channel exceeds the threshold, in canvas coordinates. */
function inkBoundingBox(
  canvas: HTMLCanvasElement,
  threshold = 40,
): InkBounds | null {
  const context = readback(canvas);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      if ((data[index] ?? 0) > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

/** Topmost/bottommost row index (relative to `y`) in `[y, y+height)` containing ink across `[x, x+width)`. */
function inkRowExtent(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): { top: number; bottom: number } | null {
  const { data } = context.getImageData(x, y, width, height);
  let top = -1;
  let bottom = -1;
  for (let row = 0; row < height; row += 1) {
    let rowHasInk = false;
    for (let col = 0; col < width; col += 1) {
      const index = (row * width + col) * 4;
      if ((data[index] ?? 0) > 40) {
        rowHasInk = true;
        break;
      }
    }
    if (rowHasInk) {
      if (top === -1) top = row;
      bottom = row;
    }
  }
  if (top === -1) return null;
  return { top, bottom };
}

async function run(): Promise<void> {
  const state: NonNullable<Window["__jgzTextGeometry"]> = {
    ready: false,
    boldInkCoverage: 0,
    regularInkCoverage: 0,
    scalarPositioning: {
      inkBounds: null,
      fontString: "",
    },
    textboxCentering: { topMargin: 0, bottomMargin: 0, rectHeight: 0 },
    customFont: {
      fontFamilyDeclared: false,
      layoutFontContainsFamily: false,
      pixelsDifferFromFallback: false,
      documentFontLoaded: false,
    },
  };
  window.__jgzTextGeometry = state;

  // --- 1. bold vs regular ink coverage ---------------------------------
  {
    const canvas = makeCanvas(200, 140);
    const screen = new Screen(canvas, readback(canvas));
    screen.fill("#000000");
    screen.draw.text("MAg", [10, 10], {
      fontsize: 64,
      color: "#ffffff",
      bold: false,
    });
    screen.draw.text("MAg", [10, 70], {
      fontsize: 64,
      color: "#ffffff",
      bold: true,
    });
    const context = readback(canvas);
    state.regularInkCoverage = inkCoverage(context, 0, 0, 200, 65);
    state.boldInkCoverage = inkCoverage(context, 0, 65, 200, 75);
  }

  // --- 2. right/bottom scalar positioning -------------------------------
  {
    const canvas = makeCanvas(200, 150);
    const screen = new Screen(canvas, readback(canvas));
    screen.fill("#000000");
    screen.draw.text("Z", undefined, {
      fontsize: 40,
      color: "#ffffff",
      right: 190,
      bottom: 140,
    });
    // The text box's bottom-right corner should land at (190, 140); the
    // spec asserts the glyph's ink bounding box hugs that corner (with
    // slack for glyph side bearings, descender space, and line spacing).
    state.scalarPositioning.inkBounds = inkBoundingBox(canvas);
    const layout = layoutText(readback(canvas), "Z", undefined, {
      fontsize: 40,
      right: 190,
      bottom: 140,
    });
    state.scalarPositioning.fontString = layout.font;
  }

  // --- 3. textbox vertical centering ------------------------------------
  {
    const canvas = makeCanvas(220, 200);
    const screen = new Screen(canvas, readback(canvas));
    screen.fill("#000000");
    const rect: [number, number, number, number] = [10, 10, 200, 180];
    screen.draw.textbox("hi", rect, {
      fontsize: 24,
      min_fontsize: 6,
      color: "#ffffff",
    });
    const context = readback(canvas);
    const extent = inkRowExtent(context, rect[0], rect[1], rect[2], rect[3]);
    if (extent) {
      state.textboxCentering.topMargin = extent.top;
      state.textboxCentering.bottomMargin = rect[3] - 1 - extent.bottom;
    }
    state.textboxCentering.rectHeight = rect[3];
  }

  // --- 4. custom loaded font renders via fontname -----------------------
  {
    const fontUrl = "/assets/phase_three/fonts/ui.woff";
    const response = await fetch(fontUrl);
    const bytes = await response.arrayBuffer();
    const family = "jgz-text-geometry-ui";
    const face = new FontFace(family, bytes);
    await face.load();
    document.fonts.add(face);
    fonts.define("ui.woff", {
      kind: "font",
      name: "ui.woff",
      url: fontUrl,
      bytes,
      family,
    });
    state.customFont.documentFontLoaded = [...document.fonts].some(
      (loadedFace) =>
        loadedFace.family === family && loadedFace.status === "loaded",
    );

    const canvasCustom = makeCanvas(160, 80);
    const screenCustom = new Screen(canvasCustom, readback(canvasCustom));
    screenCustom.fill("#000000");
    screenCustom.draw.text("Fonts 0123", [8, 8], {
      fontsize: 32,
      color: "#ffffff",
      fontname: "ui.woff",
    });
    const layout = layoutText(readback(canvasCustom), "Fonts 0123", [8, 8], {
      fontsize: 32,
      fontname: "ui.woff",
    });
    state.customFont.layoutFontContainsFamily = layout.font.includes(family);
    state.customFont.fontFamilyDeclared = layout.font.includes(
      JSON.stringify(family).slice(1, -1),
    );

    const canvasFallback = makeCanvas(160, 80);
    const screenFallback = new Screen(canvasFallback, readback(canvasFallback));
    screenFallback.fill("#000000");
    screenFallback.draw.text("Fonts 0123", [8, 8], {
      fontsize: 32,
      color: "#ffffff",
      sysfontname: "monospace",
    });

    const customContext = readback(canvasCustom);
    const fallbackContext = readback(canvasFallback);
    const customData = customContext.getImageData(0, 0, 160, 80).data;
    const fallbackData = fallbackContext.getImageData(0, 0, 160, 80).data;
    let differingPixels = 0;
    for (let index = 0; index < customData.length; index += 4) {
      if (
        Math.abs((customData[index] ?? 0) - (fallbackData[index] ?? 0)) > 40
      ) {
        differingPixels += 1;
      }
    }
    state.customFont.pixelsDifferFromFallback = differingPixels > 20;
  }

  state.ready = true;
}

run().catch((error: unknown) => {
  const state = window.__jgzTextGeometry ?? {
    ready: false,
    boldInkCoverage: 0,
    regularInkCoverage: 0,
    scalarPositioning: {
      inkBounds: null,
      fontString: "",
    },
    textboxCentering: { topMargin: 0, bottomMargin: 0, rectHeight: 0 },
    customFont: {
      fontFamilyDeclared: false,
      layoutFontContainsFamily: false,
      pixelsDifferFromFallback: false,
      documentFontLoaded: false,
    },
  };
  state.error = error instanceof Error ? error.message : String(error);
  state.ready = true;
  window.__jgzTextGeometry = state;
});
