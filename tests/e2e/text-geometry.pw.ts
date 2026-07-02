import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

type TextGeometryState = {
  ready: boolean;
  error?: string;
  boldInkCoverage: number;
  regularInkCoverage: number;
  scalarPositioning: {
    inkBounds: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
    } | null;
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

let harnessSource: string;

test.beforeAll(() => {
  // Playwright specs run under Node, so bundle the browser harness by
  // shelling out to the `bun build` CLI rather than the Bun.build API.
  const entryPath = fileURLToPath(
    new URL("./fixtures/text-geometry-harness.ts", import.meta.url),
  );
  harnessSource = execFileSync(
    "bun",
    ["build", entryPath, "--target=browser", "--format=iife"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (!harnessSource.includes("__jgzTextGeometry")) {
    throw new Error("Failed to bundle the text-geometry harness.");
  }
});

async function loadHarness(
  page: import("@playwright/test").Page,
): Promise<TextGeometryState> {
  await page.goto("/");
  await page.addScriptTag({ content: harnessSource });
  await page.waitForFunction(
    () =>
      (window as typeof window & { __jgzTextGeometry?: TextGeometryState })
        .__jgzTextGeometry?.ready,
  );
  const state = await page.evaluate(
    () =>
      (window as typeof window & { __jgzTextGeometry?: TextGeometryState })
        .__jgzTextGeometry,
  );
  if (!state) throw new Error("Missing text-geometry harness state.");
  expect(state.error).toBeUndefined();
  return state;
}

test("bold text renders with heavier ink coverage than regular text", async ({
  page,
}) => {
  const state = await loadHarness(page);
  expect(state.regularInkCoverage).toBeGreaterThan(0);
  expect(state.boldInkCoverage).toBeGreaterThan(0);
  // Same glyphs at the same size: the bold face must put down noticeably
  // more ink (thicker strokes) than the regular face.
  expect(state.boldInkCoverage).toBeGreaterThan(state.regularInkCoverage * 1.1);
});

test("right/bottom scalar positioning places text at the expected corner", async ({
  page,
}) => {
  const state = await loadHarness(page);
  const bounds = state.scalarPositioning.inkBounds;
  expect(bounds).not.toBeNull();
  if (!bounds) return;
  // A single "Z" glyph at fontsize 40 was drawn with right=190, bottom=140
  // on a 200x150 canvas. The text box's bottom-right corner sits exactly at
  // (190, 140); glyph ink must hug that corner: its right edge within a few
  // px of 190 and never past it, and its bottom edge above 140 but within
  // the descender/line-spacing slack (~40% of the 48px line height).
  expect(bounds.maxX).toBeLessThanOrEqual(190);
  expect(bounds.maxX).toBeGreaterThan(190 - 10);
  expect(bounds.maxY).toBeLessThanOrEqual(140);
  expect(bounds.maxY).toBeGreaterThan(140 - 30);
  // And nothing anywhere near the top-left: the glyph is only ~30px wide,
  // so its left edge must also sit close to the right side of the canvas.
  expect(bounds.minX).toBeGreaterThan(140);
  expect(bounds.minY).toBeGreaterThan(80);
});

test("textbox text is vertically centered within its rect", async ({
  page,
}) => {
  const state = await loadHarness(page);
  const { topMargin, bottomMargin, rectHeight } = state.textboxCentering;
  // Some ink must have been found inside the rect.
  expect(topMargin + bottomMargin).toBeLessThan(rectHeight);
  expect(topMargin).toBeGreaterThan(0);
  expect(bottomMargin).toBeGreaterThan(0);
  // Centered: top and bottom whitespace margins are approximately equal.
  // Glyph metrics (ascender vs descender space) make perfect symmetry
  // impossible, so allow a tolerance proportional to the rect height.
  expect(Math.abs(topMargin - bottomMargin)).toBeLessThan(rectHeight * 0.2);
  // And decidedly NOT top-anchored: the old behavior put the text at the
  // very top of the rect, i.e. topMargin << bottomMargin.
  expect(topMargin).toBeGreaterThan(rectHeight * 0.2);
});

test("a loaded custom font renders via fontname", async ({ page }) => {
  const state = await loadHarness(page);
  expect(state.customFont.documentFontLoaded).toBe(true);
  // The layout resolves fontname through the fonts loader to the loaded
  // FontFace family rather than using the raw asset name as a CSS family.
  expect(state.customFont.layoutFontContainsFamily).toBe(true);
  expect(state.customFont.fontFamilyDeclared).toBe(true);
  // Pixels drawn with the custom font differ from a generic fallback,
  // proving the glyph shapes actually came from the loaded font file.
  expect(state.customFont.pixelsDifferFromFallback).toBe(true);
});
