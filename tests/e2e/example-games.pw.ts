import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end tests for the two complete example games (flappy-bird and
 * breakout). The games are plain teaching code with zero test hooks; all
 * observations happen through canvas pixels and the read-only debug
 * handle (`window.__jgzExampleHandle`) that the server-generated harness
 * page exposes for e2e tooling.
 */

type ExampleStatus = {
  slug: string;
  ready: boolean;
  nonblank: boolean;
  errors: string[];
  diagnostics: unknown[];
};

function collectPageErrors(page: Page): {
  errors: string[];
  pageErrors: string[];
} {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { errors, pageErrors };
}

async function openExample(page: Page, slug: string): Promise<void> {
  await page.goto(`/examples/${slug}`);
  await page.waitForFunction(
    (expectedSlug) => {
      const status = (
        window as typeof window & { __jgzExampleStatus?: ExampleStatus }
      ).__jgzExampleStatus;
      return status?.slug === expectedSlug && status.ready;
    },
    slug,
    { timeout: 10_000 },
  );
}

async function exampleStatus(page: Page): Promise<ExampleStatus> {
  return page.evaluate(
    () =>
      (window as typeof window & { __jgzExampleStatus?: ExampleStatus })
        .__jgzExampleStatus as ExampleStatus,
  );
}

async function canvasIsNonblank(page: Page): Promise<boolean> {
  return page.locator("[data-jgz-example-canvas]").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    const data = context.getImageData(0, 0, target.width, target.height).data;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) return true;
    }
    return false;
  });
}

async function readStorageNumber(page: Page, key: string): Promise<number> {
  const value = await page.evaluate(
    (storageKey) =>
      (
        window as typeof window & {
          __jgzExampleHandle?: { storage: { get(key: string): unknown } };
        }
      ).__jgzExampleHandle?.storage.get(storageKey),
    key,
  );
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The plane sprite is the only strongly yellow cluster on the left side
 * of the flappy-bird playfield (sky/clouds are pale blue and white, rocks
 * are brown, and the gold "Best" label sits in the middle of the screen,
 * outside the scanned band). Returns the median y of yellow pixels in the
 * plane's column band, or -1 when none are found.
 */
async function flappyPlaneY(page: Page): Promise<number> {
  return page.locator("[data-jgz-example-canvas]").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return -1;
    const left = 100;
    const width = 80;
    const data = context.getImageData(left, 0, width, target.height).data;
    const ys: number[] = [];
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (r > 180 && g > 140 && b < 160 && r - b > 80) {
        ys.push(Math.floor(index / 4 / width));
      }
    }
    if (ys.length < 10) return -1;
    ys.sort((a, b) => a - b);
    return ys[Math.floor(ys.length / 2)] ?? -1;
  });
}

test.describe("flappy-bird", () => {
  test("loads cleanly and a flap pushes the plane upward", async ({ page }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "flappy-bird");
    await expect(page).toHaveTitle("Flappy Bird");
    expect(await canvasIsNonblank(page)).toBe(true);

    // Let gravity act briefly, then measure, flap several times, and
    // measure again: real keyboard input must move the plane upward.
    await page.waitForTimeout(400);
    const before = await flappyPlaneY(page);
    expect(before).toBeGreaterThan(0);

    for (let flap = 0; flap < 3; flap += 1) {
      await page.keyboard.press("Space");
      await page.waitForTimeout(120);
    }
    const after = await flappyPlaneY(page);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before - 30);

    const status = await exampleStatus(page);
    expect(status.errors).toEqual([]);
    expect(status.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("scoring a real run persists the high score across a reload", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "flappy-bird");
    // Start from a clean slate so the asserted high score comes from this
    // run alone.
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await openExample(page, "flappy-bird");
    expect(await readStorageNumber(page, "highscore")).toBe(0);

    // A tiny pixel-driven autopilot plays the game for real: read the
    // plane's height and the next gap from the canvas, flap (synthetic
    // canvas mousedown/mouseup, the same channel a player's click uses)
    // whenever the plane sinks below the gap's centre.
    await page.evaluate(() => {
      const canvas = document.querySelector(
        "[data-jgz-example-canvas]",
      ) as HTMLCanvasElement;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;

      function planeY(): number {
        const left = 100;
        const width = 80;
        const data = context.getImageData(left, 0, width, canvas.height).data;
        const ys: number[] = [];
        for (let index = 0; index < data.length; index += 4) {
          const r = data[index] ?? 0;
          const g = data[index + 1] ?? 0;
          const b = data[index + 2] ?? 0;
          if (r > 180 && g > 140 && b < 160 && r - b > 80) {
            ys.push(Math.floor(index / 4 / width));
          }
        }
        if (ys.length < 10) return -1;
        ys.sort((a, b) => a - b);
        return ys[Math.floor(ys.length / 2)] ?? -1;
      }

      // Rocks are the only dark pixels below the score text (y > 120).
      // Their true opening is the SHORTEST bright vertical run across the
      // columns they cover: that is the run passing through both tips.
      function measuredGap(): number | null {
        const top = 120;
        const band = canvas.height - top;
        const data = context.getImageData(0, top, canvas.width, band).data;
        const dark = (x: number, y: number): boolean => {
          const index = (y * canvas.width + x) * 4;
          const r = data[index] ?? 0;
          const g = data[index + 1] ?? 0;
          const b = data[index + 2] ?? 0;
          return (r + g + b) / 3 < 185;
        };
        let best: { length: number; center: number } | null = null;
        for (let x = 210; x <= 640; x += 20) {
          let darkCount = 0;
          for (let y = 0; y < band; y += 1) if (dark(x, y)) darkCount += 1;
          if (darkCount < 60) continue; // no rock in this column yet
          // Widest bright vertical run in this column = the gap.
          let bestStart = 0;
          let bestLength = 0;
          let runStart = -1;
          for (let y = 0; y <= band; y += 1) {
            const bright = y < band && !dark(x, y);
            if (bright && runStart === -1) runStart = y;
            if (!bright && runStart !== -1) {
              if (y - runStart > bestLength) {
                bestLength = y - runStart;
                bestStart = runStart;
              }
              runStart = -1;
            }
          }
          if (bestLength === 0) continue;
          if (!best || bestLength < best.length) {
            best = {
              length: bestLength,
              center: top + bestStart + bestLength / 2,
            };
          }
        }
        return best ? best.center : null;
      }

      function flap(): void {
        const rect = canvas.getBoundingClientRect();
        const init = {
          bubbles: true,
          clientX: rect.left + 200,
          clientY: rect.top + 200,
          button: 0,
        };
        canvas.dispatchEvent(new MouseEvent("mousedown", init));
        canvas.dispatchEvent(new MouseEvent("mouseup", init));
      }

      // When the rock slides past the last scanned column (it is about to
      // cross the plane), keep steering toward its last known gap rather
      // than drifting back to a default height mid-pass.
      let lastGap = canvas.height / 2;
      const interval = window.setInterval(() => {
        const y = planeY();
        if (y === -1) return;
        const gap = measuredGap();
        if (gap !== null) lastGap = gap;
        // A flap climbs ~57px; triggering 22px below the gap centre keeps
        // the climb/fall bounce centred inside the opening.
        if (y > lastGap + 22) flap();
      }, 40);
      (
        window as typeof window & { __jgzAutopilotStop?: () => void }
      ).__jgzAutopilotStop = () => window.clearInterval(interval);
    });

    await expect
      .poll(() => readStorageNumber(page, "highscore"), {
        timeout: 45_000,
        message: "autopilot should pass at least one gap",
      })
      .toBeGreaterThan(0);
    await page.evaluate(() =>
      (
        window as typeof window & { __jgzAutopilotStop?: () => void }
      ).__jgzAutopilotStop?.(),
    );
    const scored = await readStorageNumber(page, "highscore");

    // Auto-save is debounced; give it a moment, then reload and confirm
    // the best score came back without the game ever calling save().
    await page.waitForTimeout(500);
    await page.reload();
    await openExample(page, "flappy-bird");
    expect(await readStorageNumber(page, "highscore")).toBeGreaterThanOrEqual(
      scored,
    );

    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

/** The paddle is the widest bright horizontal run near the bottom of the
 * breakout playfield; returns its centre x, or -1 when not found. */
async function breakoutPaddleX(page: Page): Promise<number> {
  return page.locator("[data-jgz-example-canvas]").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return -1;
    const row = 560; // paddle centre line: HEIGHT - 40
    const data = context.getImageData(0, row, target.width, 1).data;
    let bestStart = 0;
    let bestLength = 0;
    let runStart = -1;
    for (let x = 0; x <= target.width; x += 1) {
      const r = data[x * 4] ?? 0;
      const g = data[x * 4 + 1] ?? 0;
      const b = data[x * 4 + 2] ?? 0;
      const bright = x < target.width && (r + g + b) / 3 > 90;
      if (bright && runStart === -1) runStart = x;
      if (!bright && runStart !== -1) {
        if (x - runStart > bestLength) {
          bestLength = x - runStart;
          bestStart = runStart;
        }
        runStart = -1;
      }
    }
    if (bestLength < 40) return -1; // the ball is far narrower than the paddle
    return bestStart + bestLength / 2;
  });
}

/** Bricks are the only saturated pixels in the top part of the playfield;
 * counting them tracks how much of the wall is still standing. */
async function breakoutBrickPixels(page: Page): Promise<number> {
  return page.locator("[data-jgz-example-canvas]").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return 0;
    const data = context.getImageData(0, 80, target.width, 190).data;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 60) count += 1;
    }
    return count;
  });
}

test.describe("breakout", () => {
  // The playfield is 800x600 shown 1:1; a taller viewport keeps the whole
  // canvas (and the paddle row real mouse events must reach) on screen.
  test.use({ viewport: { width: 1100, height: 900 } });

  test("loads cleanly and the arrow keys move the paddle", async ({ page }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "breakout");
    await expect(page).toHaveTitle("Breakout");
    expect(await canvasIsNonblank(page)).toBe(true);

    const before = await breakoutPaddleX(page);
    expect(before).toBeGreaterThan(0);

    await page.locator("[data-jgz-example-canvas]").click();
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowLeft");

    const after = await breakoutPaddleX(page);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before - 40);

    const status = await exampleStatus(page);
    expect(status.errors).toEqual([]);
    expect(status.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("the mouse steers the paddle and rallies break bricks", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "breakout");

    // Real mouse input: move the pointer over the canvas and check the
    // paddle recentres under it (the harness canvas renders 1:1, so page
    // coordinates map directly onto game coordinates).
    const canvas = page.locator("[data-jgz-example-canvas]");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + 150, box.y + 560);
    await expect
      .poll(() => breakoutPaddleX(page), { timeout: 4_000 })
      .toBeLessThan(230);
    await page.mouse.move(box.x + 650, box.y + 560);
    await expect
      .poll(() => breakoutPaddleX(page), { timeout: 4_000 })
      .toBeGreaterThan(570);

    const wallBefore = await breakoutBrickPixels(page);
    expect(wallBefore).toBeGreaterThan(5_000);

    // Pixel-driven autopilot: keep the paddle under the ball via synthetic
    // canvas mousemove events (the same channel a player's mouse uses) and
    // let the rally knock bricks out.
    await page.evaluate(() => {
      const target = document.querySelector(
        "[data-jgz-example-canvas]",
      ) as HTMLCanvasElement;
      const context = target.getContext("2d", { willReadFrequently: true })!;

      function ballX(): number {
        // Between the brick wall and the paddle only the ball is bright.
        const top = 280;
        const height = 250;
        const data = context.getImageData(0, top, target.width, height).data;
        let sum = 0;
        let count = 0;
        for (let index = 0; index < data.length; index += 4) {
          const r = data[index] ?? 0;
          const g = data[index + 1] ?? 0;
          const b = data[index + 2] ?? 0;
          if ((r + g + b) / 3 > 90) {
            sum += (index / 4) % target.width;
            count += 1;
          }
        }
        return count > 0 ? sum / count : -1;
      }

      const rect = target.getBoundingClientRect();
      const interval = window.setInterval(() => {
        // Clicking is a no-op while a rally is running, but if all lives
        // drain it immediately restarts the game so the test can't stall.
        const init = {
          bubbles: true,
          clientX: rect.left + 400,
          clientY: rect.top + 560,
          button: 0,
        };
        target.dispatchEvent(new MouseEvent("mousedown", init));
        target.dispatchEvent(new MouseEvent("mouseup", init));
        const x = ballX();
        if (x === -1) return;
        target.dispatchEvent(
          new MouseEvent("mousemove", {
            bubbles: true,
            clientX: rect.left + x,
            clientY: rect.top + 560,
          }),
        );
      }, 40);
      (
        window as typeof window & { __jgzAutopilotStop?: () => void }
      ).__jgzAutopilotStop = () => window.clearInterval(interval);
    });

    await expect
      .poll(() => breakoutBrickPixels(page), {
        timeout: 30_000,
        message: "the rally should knock out at least one brick",
      })
      .toBeLessThan(wallBefore - 1_000);
    await page.evaluate(() =>
      (
        window as typeof window & { __jgzAutopilotStop?: () => void }
      ).__jgzAutopilotStop?.(),
    );

    const status = await exampleStatus(page);
    expect(status.errors).toEqual([]);
    expect(status.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
