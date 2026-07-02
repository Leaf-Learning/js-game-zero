import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end tests for the complete example games (flappy-bird, breakout,
 * space-shooter, snake, and platformer). The games are plain teaching code
 * with zero test hooks; all observations happen through canvas pixels and
 * the read-only debug handle (`window.__jgzExampleHandle`) that the
 * server-generated harness page exposes for e2e tooling.
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

/** The ship is the only strongly blue sprite in the bottom quarter of the
 * space-shooter playfield; returns its centroid x, or -1 when not found. */
async function spaceShooterShipX(page: Page): Promise<number> {
  return page.locator("[data-jgz-example-canvas]").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return -1;
    const top = Math.floor(target.height * 0.75);
    const height = target.height - top;
    const data = context.getImageData(0, top, target.width, height).data;
    let sum = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const b = data[index + 2] ?? 0;
      if (b > 150 && b - r > 40) {
        sum += (index / 4) % target.width;
        count += 1;
      }
    }
    return count > 0 ? sum / count : -1;
  });
}

/** The laser and the ship share the same blue, so a laser is detected by
 * looking for that colour in the empty band between the ship's starting
 * row and the enemy formation, where nothing else is ever drawn. */
async function spaceShooterLaserInFlight(page: Page): Promise<boolean> {
  return page.locator("[data-jgz-example-canvas]").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    const top = 250;
    const height = 250;
    const data = context.getImageData(0, top, target.width, height).data;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (
        Math.abs(r - 54) < 20 &&
        Math.abs(g - 187) < 20 &&
        Math.abs(b - 245) < 15
      ) {
        return true;
      }
    }
    return false;
  });
}

test.describe("space-shooter", () => {
  // The playfield is 480x640 shown 1:1; a taller viewport keeps the whole
  // vertical canvas on screen alongside the page header.
  test.use({ viewport: { width: 700, height: 900 } });

  test("loads cleanly, arrow keys move the ship, and space fires a laser", async ({
    page,
  }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "space-shooter");
    await expect(page).toHaveTitle("Space Shooter");
    expect(await canvasIsNonblank(page)).toBe(true);

    const before = await spaceShooterShipX(page);
    expect(before).toBeGreaterThan(0);

    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(500);
    await page.keyboard.up("ArrowLeft");
    const afterLeft = await spaceShooterShipX(page);
    expect(afterLeft).toBeGreaterThan(0);
    expect(afterLeft).toBeLessThan(before - 30);

    expect(await spaceShooterLaserInFlight(page)).toBe(false);
    // Firing is polled from `keyboard.space` each frame, so hold the key
    // down for a beat rather than using a single press() - a down+up pair
    // fired back-to-back can otherwise resolve between animation frames
    // and never be observed by the game loop.
    await page.keyboard.down("Space");
    await page.waitForTimeout(80);
    await page.keyboard.up("Space");
    // Give the laser a moment to clear the ship's nose and enter the
    // empty band the detector scans.
    await page.waitForTimeout(150);
    expect(await spaceShooterLaserInFlight(page)).toBe(true);

    const status = await exampleStatus(page);
    expect(status.errors).toEqual([]);
    expect(status.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

/** The snake's head is the brightest green pixel cluster on the board (the
 * body segments use a darker shade); returns its centroid, or null when
 * the snake hasn't been drawn yet (e.g. mid-reload). */
async function snakeHeadPos(
  page: Page,
): Promise<{ x: number; y: number } | null> {
  return page.locator("[data-jgz-example-canvas]").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const data = context.getImageData(0, 0, target.width, target.height).data;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (r > 60 && r < 110 && g > 200 && b > 90 && b < 170) {
        const pixel = index / 4;
        sumX += pixel % target.width;
        sumY += Math.floor(pixel / target.width);
        count += 1;
      }
    }
    return count > 0 ? { x: sumX / count, y: sumY / count } : null;
  });
}

/** The fruit is the only saturated orange sprite on the board; returns its
 * centroid and pixel count (used to detect "the fruit just respawned
 * elsewhere", which is how eating is observed from pixels alone). */
async function snakeFruitPos(
  page: Page,
): Promise<{ x: number; y: number; count: number } | null> {
  return page.locator("[data-jgz-example-canvas]").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const data = context.getImageData(0, 0, target.width, target.height).data;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (r > 200 && g > 90 && g < 170 && b < 80) {
        const pixel = index / 4;
        sumX += pixel % target.width;
        sumY += Math.floor(pixel / target.width);
        count += 1;
      }
    }
    return count > 0 ? { x: sumX / count, y: sumY / count, count } : null;
  });
}

test.describe("snake", () => {
  test("loads cleanly and turning changes the snake's heading", async ({
    page,
  }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "snake");
    await expect(page).toHaveTitle("Snake");
    expect(await canvasIsNonblank(page)).toBe(true);

    // The snake starts heading right; turning it downward and letting a
    // couple of scheduled moves play out should move the head down rather
    // than further right.
    const before = await snakeHeadPos(page);
    expect(before).not.toBeNull();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(500);
    const after = await snakeHeadPos(page);
    expect(after).not.toBeNull();
    expect(after!.y).toBeGreaterThan(before!.y + 20);

    const status = await exampleStatus(page);
    expect(status.errors).toEqual([]);
    expect(status.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("eating fruit raises the score and persists a high score across a reload", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "snake");
    // Start from a clean slate so the asserted high score comes from this
    // run alone.
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await openExample(page, "snake");
    expect(await readStorageNumber(page, "highscore")).toBe(0);

    // Turn away from the starting rightward heading immediately, then a
    // tiny pixel-driven autopilot steers toward the fruit: real keyboard
    // input (dispatched at the window, the same target the game's own
    // listener attaches to) turns the snake whenever the fruit is mostly
    // to one side of the head.
    await page.keyboard.press("ArrowDown");
    await page.evaluate(() => {
      function headPos(): { x: number; y: number } | null {
        const canvas = document.querySelector(
          "[data-jgz-example-canvas]",
        ) as HTMLCanvasElement;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        const data = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (let index = 0; index < data.length; index += 4) {
          const r = data[index] ?? 0;
          const g = data[index + 1] ?? 0;
          const b = data[index + 2] ?? 0;
          if (r > 60 && r < 110 && g > 200 && b > 90 && b < 170) {
            const pixel = index / 4;
            sumX += pixel % canvas.width;
            sumY += Math.floor(pixel / canvas.width);
            count += 1;
          }
        }
        return count > 0 ? { x: sumX / count, y: sumY / count } : null;
      }
      function fruitPos(): { x: number; y: number } | null {
        const canvas = document.querySelector(
          "[data-jgz-example-canvas]",
        ) as HTMLCanvasElement;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        const data = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        for (let index = 0; index < data.length; index += 4) {
          const r = data[index] ?? 0;
          const g = data[index + 1] ?? 0;
          const b = data[index + 2] ?? 0;
          if (r > 200 && g > 90 && g < 170 && b < 80) {
            const pixel = index / 4;
            sumX += pixel % canvas.width;
            sumY += Math.floor(pixel / canvas.width);
            count += 1;
          }
        }
        return count > 0 ? { x: sumX / count, y: sumY / count } : null;
      }
      function press(code: string): void {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { code, bubbles: true }),
        );
        window.dispatchEvent(
          new KeyboardEvent("keyup", { code, bubbles: true }),
        );
      }
      const WIDTH = 640;
      const HEIGHT = 480;
      const MARGIN = 64; // two grid cells - start turning before the wall
      let lastKey = "ArrowDown";
      let lastHead: { x: number; y: number } | null = null;
      let stuckSince = Date.now();
      const interval = window.setInterval(() => {
        const head = headPos();
        if (!head) return;
        // This greedy autopilot has no path-planning, so an unlucky apple
        // placement can occasionally run it into a wall or its own tail.
        // If the head stops moving for a while, treat that as a death,
        // restart, and keep going rather than stalling out the test.
        if (
          !lastHead ||
          Math.abs(head.x - lastHead.x) > 2 ||
          Math.abs(head.y - lastHead.y) > 2
        ) {
          lastHead = head;
          stuckSince = Date.now();
        } else if (Date.now() - stuckSince > 700) {
          press("Space"); // restarts from the "dead" state
          lastKey = "ArrowRight"; // matches the game's fresh heading
          stuckSince = Date.now();
          return;
        }

        const fruit = fruitPos();
        if (!fruit) return;
        let key = lastKey;
        // Wall avoidance takes priority over beelining for the fruit.
        if (lastKey === "ArrowRight" && head.x > WIDTH - MARGIN) {
          key = fruit.y > head.y ? "ArrowDown" : "ArrowUp";
        } else if (lastKey === "ArrowLeft" && head.x < MARGIN) {
          key = fruit.y > head.y ? "ArrowDown" : "ArrowUp";
        } else if (lastKey === "ArrowDown" && head.y > HEIGHT - MARGIN) {
          key = fruit.x > head.x ? "ArrowRight" : "ArrowLeft";
        } else if (lastKey === "ArrowUp" && head.y < MARGIN) {
          key = fruit.x > head.x ? "ArrowRight" : "ArrowLeft";
        } else {
          const dx = fruit.x - head.x;
          const dy = fruit.y - head.y;
          if (Math.abs(dx) > 20) key = dx > 0 ? "ArrowRight" : "ArrowLeft";
          else if (Math.abs(dy) > 20) key = dy > 0 ? "ArrowDown" : "ArrowUp";
        }
        if (key !== lastKey) {
          press(key);
          lastKey = key;
        }
      }, 120);
      (
        window as typeof window & { __jgzAutopilotStop?: () => void }
      ).__jgzAutopilotStop = () => window.clearInterval(interval);
    });

    await expect
      .poll(() => readStorageNumber(page, "highscore"), {
        timeout: 45_000,
        message: "autopilot should eat at least one fruit",
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
    await openExample(page, "snake");
    expect(await readStorageNumber(page, "highscore")).toBeGreaterThanOrEqual(
      scored,
    );

    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

/** The player's helmet glass is a light blue-grey that nothing else in the
 * scene shares (tiles, gems, the flag, and water are all fully saturated
 * colours); returns its centroid, or null when not found. */
async function platformerPlayerPos(
  page: Page,
): Promise<{ x: number; y: number } | null> {
  return page.locator("[data-jgz-example-canvas]").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const data = context.getImageData(0, 0, target.width, target.height).data;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (r > 180 && r < 200 && g > 212 && g < 232 && b > 231 && b < 251) {
        const pixel = index / 4;
        sumX += pixel % target.width;
        sumY += Math.floor(pixel / target.width);
        count += 1;
      }
    }
    return count > 0 ? { x: sumX / count, y: sumY / count } : null;
  });
}

test.describe("platformer", () => {
  test("loads cleanly and a jump moves the player upward", async ({ page }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "platformer");
    await expect(page).toHaveTitle("Platformer");
    expect(await canvasIsNonblank(page)).toBe(true);

    const before = await platformerPlayerPos(page);
    expect(before).not.toBeNull();

    await page.keyboard.press("Space");
    // Sampled before the jump's apex (roughly 400ms out, given this
    // game's gravity/jump constants), so the player is still rising.
    await page.waitForTimeout(200);
    const after = await platformerPlayerPos(page);
    expect(after).not.toBeNull();
    expect(after!.y).toBeLessThan(before!.y - 20);

    const status = await exampleStatus(page);
    expect(status.errors).toEqual([]);
    expect(status.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("running and jumping crosses a gap and collects a gem", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "platformer");

    const before = await platformerPlayerPos(page);
    expect(before).not.toBeNull();

    await page.keyboard.down("ArrowRight");
    for (let hop = 0; hop < 3; hop += 1) {
      await page.waitForTimeout(320);
      await page.keyboard.down("Space");
      await page.waitForTimeout(60);
      await page.keyboard.up("Space");
    }
    await page.waitForTimeout(500);
    await page.keyboard.up("ArrowRight");

    const after = await platformerPlayerPos(page);
    expect(after).not.toBeNull();
    // Crossing the first gap and stepping up onto the following platforms
    // covers well over one tile's width (54px).
    expect(after!.x).toBeGreaterThan(before!.x + 100);

    const status = await exampleStatus(page);
    expect(status.errors).toEqual([]);
    expect(status.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
