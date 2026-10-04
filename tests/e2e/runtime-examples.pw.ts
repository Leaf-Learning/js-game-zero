import { expect, test, type Page } from "@playwright/test";
import { exampleManifest } from "../../examples/manifest";
import {
  canvasIsNonblank,
  collectPageErrors,
  waitForExampleStatus,
  type ExampleStatus,
} from "./fixtures/harness-helpers";

/**
 * The examples themselves are plain teaching code with no test hooks.
 * Everything asserted here comes from the harness the server wraps around
 * each example page (`window.__jgzExampleStatus` and
 * `window.__jgzExampleHandle`, injected by apps/sandbox/src/server.ts) or
 * from reading canvas pixels directly.
 */

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Coarse whole-canvas fingerprint, used to detect that input visibly
 * changed what the example draws without the example exporting state. */
async function canvasFingerprint(page: Page): Promise<string> {
  return page.locator("[data-jgz-example-canvas]").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return "";
    const data = context.getImageData(0, 0, target.width, target.height).data;
    let hash = 0;
    for (let index = 0; index < data.length; index += 16) {
      hash = (hash * 31 + (data[index] ?? 0)) >>> 0;
    }
    return String(hash);
  });
}

async function pixelAt(
  page: Page,
  x: number,
  y: number,
): Promise<[number, number, number]> {
  return page.locator("[data-jgz-example-canvas]").evaluate(
    (canvas, point) => {
      const target = canvas as HTMLCanvasElement;
      const context = target.getContext("2d", { willReadFrequently: true });
      if (!context) return [0, 0, 0] as [number, number, number];
      const data = context.getImageData(point[0], point[1], 1, 1).data;
      return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0] as [
        number,
        number,
        number,
      ];
    },
    [x, y] as const,
  );
}

test("examples index links every shipped example", async ({ page }) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/examples");
  await expect(page).toHaveTitle("js-game-zero Examples");

  for (const example of exampleManifest) {
    await expect(
      page.locator(`[data-jgz-example-link="${example.slug}"]`),
    ).toHaveAttribute("href", `/examples/${example.slug}`);
  }

  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

for (const example of exampleManifest) {
  test(`example ${example.slug} is browser-playable`, async ({ page }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await page.goto(`/examples/${example.slug}`);
    await expect(page).toHaveTitle(example.title);

    const initial = await waitForExampleStatus(page, example.slug);
    expect(initial.mode).toBe(example.mode);
    expect(initial.nonblank).toBe(true);
    expect(
      await canvasIsNonblank(page.locator("[data-jgz-example-canvas]")),
    ).toBe(true);
    expect(initial.frames).toBeGreaterThan(0);
    expect(initial.errors).toEqual([]);
    expect(initial.diagnostics).toEqual([]);

    if (example.slug === "storage-save") {
      const canvas = page.locator("[data-jgz-example-canvas]");
      const before = await canvasFingerprint(page);
      await canvas.click({ position: { x: 244, y: 236 } });
      await canvas.click({ position: { x: 244, y: 236 } });
      await expect.poll(() => canvasFingerprint(page)).not.toBe(before);
      // Unsaved edits do not touch storage. Saving flushes the exact score,
      // subtracting changes only current, and loading restores the display.
      expect(
        (await waitForExampleStatus(page, example.slug)).storage?.score,
      ).toBeUndefined();
      await canvas.click({ position: { x: 396, y: 236 } });
      await expect
        .poll(() =>
          page.evaluate(() => {
            const raw = localStorage.getItem(
              "js-game-zero:storage-save:storage",
            );
            return raw ? JSON.parse(raw).score : null;
          }),
        )
        .toBe(2);
      await canvas.click({ position: { x: 96, y: 236 } });
      const edited = await canvasFingerprint(page);
      await canvas.click({ position: { x: 544, y: 236 } });
      await expect.poll(() => canvasFingerprint(page)).not.toBe(edited);
      await page.reload();
      const reloaded = await waitForExampleStatus(page, example.slug);
      expect(numeric(reloaded.storage?.score)).toBe(2);
      await canvas.click({ position: { x: 396, y: 236 } });
      expect(
        numeric(
          (await waitForExampleStatus(page, example.slug)).storage?.score,
        ),
      ).toBe(2);
    }

    if (example.slug === "animation-basics") {
      // The orb animates from x=48 to x=260 (y=90) in one second; once the
      // tween finishes the pixel at its destination is the orb's yellow.
      await expect
        .poll(
          async () => {
            const [r, g, b] = await pixelAt(page, 260, 90);
            return r > 200 && g > 150 && b < 120;
          },
          { timeout: 5_000 },
        )
        .toBe(true);
    }

    const canvas = page.locator("[data-jgz-example-canvas]");
    if (example.expectsInput === "keyboard") {
      // Both keyboard examples draw a static scene that only changes when
      // the player moves, so a fingerprint change proves the key worked.
      const before = await canvasFingerprint(page);
      await canvas.click();
      await page.keyboard.down("ArrowRight");
      try {
        await expect
          .poll(() => canvasFingerprint(page), { timeout: 5_000 })
          .not.toBe(before);
      } finally {
        await page.keyboard.up("ArrowRight");
      }
      const moved = await waitForExampleStatus(page, example.slug);
      expect(moved.interactions.keyboard).toBe(true);
    }

    if (example.expectsInput === "mouse") {
      const before = await canvasFingerprint(page);
      await canvas.click({ position: { x: 160, y: 82 } });
      await page.waitForFunction(
        () =>
          (window as typeof window & { __jgzExampleStatus?: ExampleStatus })
            .__jgzExampleStatus?.interactions.mouse,
      );
      if (example.slug === "sound-tone") {
        // The circle grows with each click, so the static scene changes.
        await expect
          .poll(() => canvasFingerprint(page), { timeout: 5_000 })
          .not.toBe(before);
      }
    }

    const finalStatus = await waitForExampleStatus(page, example.slug);
    expect(finalStatus.errors).toEqual([]);
    expect(finalStatus.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
