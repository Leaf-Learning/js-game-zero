import { expect, test, type Page } from "@playwright/test";
import {
  canvasIsNonblank,
  collectPageErrors,
  waitForExampleStatus,
  type ExampleStatus,
} from "./fixtures/harness-helpers";

/**
 * End-to-end tests for the complete example games (flappy-bird, breakout,
 * space-shooter, snake, and platformer). The games are plain teaching code
 * with zero test hooks; all observations happen through canvas pixels and
 * the read-only debug handle (`window.__jgzExampleHandle`) that the
 * server-generated harness page exposes for e2e tooling.
 */

// --- Sprite colour windows ----------------------------------------------------
// Every game's sprites are located purely from canvas pixels. These named,
// commented thresholds centralise the "magic numbers" that used to be inlined
// in each detector and autopilot; they are passed into page.evaluate() as an
// argument so the browser-side pixel scans share one source of truth. The
// values are UNCHANGED from the original inline checks -- this is a
// readability/maintainability refactor, not a behaviour change.

/** flappy: the plane is the only strongly-yellow cluster (red & green high,
 * blue low, with a wide red-over-blue margin) in its column band. `minCluster`
 * rejects a handful of stray matching pixels as noise. */
const FLAPPY_PLANE_YELLOW = {
  rMin: 180,
  gMin: 140,
  bMax: 160,
  rMinusBMin: 80,
  minCluster: 10,
} as const;

/** flappy: rocks are the dark pixels below the score text. A column counts as
 * containing a rock once it has at least `minDarkColumnPixels` pixels darker
 * than `avgMax` (mean channel value). */
const FLAPPY_ROCK_DARK = {
  avgMax: 185,
  minDarkColumnPixels: 60,
} as const;

/** breakout: the paddle and ball are the bright pixels near the bottom. The
 * paddle is the widest bright run (>= `minPaddleWidth`), so it is never
 * confused with the far narrower ball. */
const BREAKOUT_BRIGHT = {
  avgMin: 90,
  minPaddleWidth: 40,
} as const;

/** breakout: bricks are the only saturated pixels in the top of the playfield
 * (max-min channel spread exceeds `saturationMin`). */
const BREAKOUT_BRICK = {
  saturationMin: 60,
} as const;

/** space-shooter: the ship is the strongly-blue sprite in the bottom quarter
 * (blue high, and clearly bluer than it is red). */
const SPACE_SHIP_BLUE = {
  bMin: 150,
  bMinusRMin: 40,
} as const;

/** space-shooter: the laser is an exact accent blue (54,187,245), detected in
 * the empty band between the ship's start row and the enemy formation. */
const SPACE_LASER_BLUE = {
  r: 54,
  rTol: 20,
  g: 187,
  gTol: 20,
  b: 245,
  bTol: 15,
} as const;

/** snake: the head is the bright green (body segments use a darker shade). */
const SNAKE_HEAD_GREEN = {
  rMin: 60,
  rMax: 110,
  gMin: 200,
  bMin: 90,
  bMax: 170,
} as const;

/** snake: the fruit is the only saturated orange sprite on the board. */
const SNAKE_FRUIT_ORANGE = {
  rMin: 200,
  gMin: 90,
  gMax: 170,
  bMax: 80,
} as const;

/** platformer: the player's helmet glass is a light blue-grey that nothing
 * else in the scene shares (tiles, gems, the flag, and water are all fully
 * saturated colours). */
const PLATFORMER_HELMET_GLASS = {
  rMin: 180,
  rMax: 200,
  gMin: 212,
  gMax: 232,
  bMin: 231,
  bMax: 251,
} as const;

// --- Minimum observed motion to call an input "worked" ------------------------
/** flappy: a single Space flap sets a fixed upward velocity (~57px of climb);
 * require a clear rise above the pre-flap baseline. */
const FLAP_MIN_CLIMB_PX = 30;
const BREAKOUT_PADDLE_MIN_SHIFT_PX = 40;
const SPACE_SHIP_MIN_SHIFT_PX = 30;
const SNAKE_MIN_TURN_PX = 20;
const PLATFORMER_MIN_JUMP_PX = 20;
const PLATFORMER_MIN_ADVANCE_PX = 100;

async function openExample(page: Page, slug: string): Promise<void> {
  await page.goto(`/examples/${slug}`);
  await waitForExampleStatus(page, slug, { timeout: 10_000 });
}

async function exampleStatus(page: Page): Promise<ExampleStatus> {
  return page.evaluate(
    () =>
      (window as typeof window & { __jgzExampleStatus?: ExampleStatus })
        .__jgzExampleStatus as ExampleStatus,
  );
}

function exampleCanvas(page: Page) {
  return page.locator("[data-jgz-example-canvas]");
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

/** Reads the value a game auto-saved to localStorage (the whole storage object
 * is one JSON blob at `js-game-zero:<projectId>:storage`). Used to wait on the
 * debounced auto-save actually flushing, rather than sleeping for it. */
async function persistedStorageNumber(
  page: Page,
  projectId: string,
  key: string,
): Promise<number> {
  const value = await page.evaluate(
    ({ projectId, key }) => {
      const raw = window.localStorage.getItem(
        `js-game-zero:${projectId}:storage`,
      );
      if (!raw) return null;
      try {
        return (JSON.parse(raw) as Record<string, unknown>)[key] ?? null;
      } catch {
        return null;
      }
    },
    { projectId, key },
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
  return exampleCanvas(page).evaluate((canvas, plane) => {
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
      if (
        r > plane.rMin &&
        g > plane.gMin &&
        b < plane.bMax &&
        r - b > plane.rMinusBMin
      ) {
        ys.push(Math.floor(index / 4 / width));
      }
    }
    if (ys.length < plane.minCluster) return -1;
    ys.sort((a, b) => a - b);
    return ys[Math.floor(ys.length / 2)] ?? -1;
  }, FLAPPY_PLANE_YELLOW);
}

test.describe("flappy-bird", () => {
  test("loads cleanly and a flap pushes the plane upward", async ({ page }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "flappy-bird");
    await expect(page).toHaveTitle("Flappy Bird");
    expect(await canvasIsNonblank(exampleCanvas(page))).toBe(true);

    // Let gravity pull the plane below its spawn point: this proves the sim is
    // live and leaves headroom for a flap to visibly climb. Wait on the
    // observed descent rather than sleeping a fixed time.
    const spawnY = await flappyPlaneY(page);
    expect(spawnY).toBeGreaterThan(0);
    await expect
      .poll(() => flappyPlaneY(page), {
        timeout: 4_000,
        message: "the plane should sink under gravity",
      })
      .toBeGreaterThan(spawnY);
    const before = await flappyPlaneY(page);
    expect(before).toBeGreaterThan(0);

    // Flap on a steady cadence (each Space press re-applies the fixed upward
    // velocity) and wait until the plane clears the pre-flap baseline, instead
    // of sleeping between presses.
    await expect
      .poll(
        async () => {
          await page.keyboard.press("Space");
          const y = await flappyPlaneY(page);
          return y > 0 && y < before - FLAP_MIN_CLIMB_PX;
        },
        {
          intervals: [120],
          timeout: 5_000,
          message: "flapping should push the plane up",
        },
      )
      .toBe(true);

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
    await page.evaluate(
      (thresholds) => {
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
            if (
              r > thresholds.plane.rMin &&
              g > thresholds.plane.gMin &&
              b < thresholds.plane.bMax &&
              r - b > thresholds.plane.rMinusBMin
            ) {
              ys.push(Math.floor(index / 4 / width));
            }
          }
          if (ys.length < thresholds.plane.minCluster) return -1;
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
            return (r + g + b) / 3 < thresholds.rock.avgMax;
          };
          let best: { length: number; center: number } | null = null;
          for (let x = 210; x <= 640; x += 20) {
            let darkCount = 0;
            for (let y = 0; y < band; y += 1) if (dark(x, y)) darkCount += 1;
            if (darkCount < thresholds.rock.minDarkColumnPixels) continue; // no rock in this column yet
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
      },
      { plane: FLAPPY_PLANE_YELLOW, rock: FLAPPY_ROCK_DARK },
    );

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

    // Wait until the debounced auto-save has flushed the best score to
    // localStorage, then reload and confirm it came back without the game
    // ever calling save().
    await expect
      .poll(() => persistedStorageNumber(page, "flappy-bird", "highscore"), {
        timeout: 5_000,
        message: "the best score should be auto-saved to localStorage",
      })
      .toBeGreaterThanOrEqual(scored);
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
  return exampleCanvas(page).evaluate((canvas, bright) => {
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
      const isBright = x < target.width && (r + g + b) / 3 > bright.avgMin;
      if (isBright && runStart === -1) runStart = x;
      if (!isBright && runStart !== -1) {
        if (x - runStart > bestLength) {
          bestLength = x - runStart;
          bestStart = runStart;
        }
        runStart = -1;
      }
    }
    if (bestLength < bright.minPaddleWidth) return -1; // the ball is far narrower than the paddle
    return bestStart + bestLength / 2;
  }, BREAKOUT_BRIGHT);
}

/** Bricks are the only saturated pixels in the top part of the playfield;
 * counting them tracks how much of the wall is still standing. */
async function breakoutBrickPixels(page: Page): Promise<number> {
  return exampleCanvas(page).evaluate((canvas, brick) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return 0;
    const data = context.getImageData(0, 80, target.width, 190).data;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      if (Math.max(r, g, b) - Math.min(r, g, b) > brick.saturationMin) {
        count += 1;
      }
    }
    return count;
  }, BREAKOUT_BRICK);
}

test.describe("breakout", () => {
  // The playfield is 800x600 shown 1:1; a taller viewport keeps the whole
  // canvas (and the paddle row real mouse events must reach) on screen.
  test.use({ viewport: { width: 1100, height: 900 } });

  test("loads cleanly and the arrow keys move the paddle", async ({ page }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "breakout");
    await expect(page).toHaveTitle("Breakout");
    expect(await canvasIsNonblank(exampleCanvas(page))).toBe(true);

    const before = await breakoutPaddleX(page);
    expect(before).toBeGreaterThan(0);

    // Hold the key and wait until the paddle has visibly slid left, then
    // release -- no fixed sleep.
    await exampleCanvas(page).click();
    await page.keyboard.down("ArrowLeft");
    try {
      await expect
        .poll(
          async () => {
            const x = await breakoutPaddleX(page);
            return x > 0 && x < before - BREAKOUT_PADDLE_MIN_SHIFT_PX;
          },
          { timeout: 4_000, message: "ArrowLeft should slide the paddle left" },
        )
        .toBe(true);
    } finally {
      await page.keyboard.up("ArrowLeft");
    }

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
    const canvas = exampleCanvas(page);
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
    await page.evaluate((bright) => {
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
          if ((r + g + b) / 3 > bright.avgMin) {
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
    }, BREAKOUT_BRIGHT);

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
  return exampleCanvas(page).evaluate((canvas, ship) => {
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
      if (b > ship.bMin && b - r > ship.bMinusRMin) {
        sum += (index / 4) % target.width;
        count += 1;
      }
    }
    return count > 0 ? sum / count : -1;
  }, SPACE_SHIP_BLUE);
}

/** The laser and the ship share the same blue, so a laser is detected by
 * looking for that colour in the empty band between the ship's starting
 * row and the enemy formation, where nothing else is ever drawn. */
async function spaceShooterLaserInFlight(page: Page): Promise<boolean> {
  return exampleCanvas(page).evaluate((canvas, laser) => {
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
        Math.abs(r - laser.r) < laser.rTol &&
        Math.abs(g - laser.g) < laser.gTol &&
        Math.abs(b - laser.b) < laser.bTol
      ) {
        return true;
      }
    }
    return false;
  }, SPACE_LASER_BLUE);
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
    expect(await canvasIsNonblank(exampleCanvas(page))).toBe(true);

    const before = await spaceShooterShipX(page);
    expect(before).toBeGreaterThan(0);

    // Hold ArrowLeft and wait until the ship has moved left, then release.
    await page.keyboard.down("ArrowLeft");
    try {
      await expect
        .poll(
          async () => {
            const x = await spaceShooterShipX(page);
            return x > 0 && x < before - SPACE_SHIP_MIN_SHIFT_PX;
          },
          { timeout: 4_000, message: "ArrowLeft should move the ship left" },
        )
        .toBe(true);
    } finally {
      await page.keyboard.up("ArrowLeft");
    }
    const afterLeft = await spaceShooterShipX(page);
    expect(afterLeft).toBeGreaterThan(0);
    expect(afterLeft).toBeLessThan(before - 30);

    expect(await spaceShooterLaserInFlight(page)).toBe(false);
    // Firing is polled from `keyboard.space` each frame, so hold the key down
    // and wait until a laser has climbed into the band the detector scans,
    // rather than sleeping a fixed time.
    await page.keyboard.down("Space");
    try {
      await expect
        .poll(() => spaceShooterLaserInFlight(page), {
          timeout: 4_000,
          message: "holding Space should fire a laser into the band",
        })
        .toBe(true);
    } finally {
      await page.keyboard.up("Space");
    }

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
  return exampleCanvas(page).evaluate((canvas, head) => {
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
      if (
        r > head.rMin &&
        r < head.rMax &&
        g > head.gMin &&
        b > head.bMin &&
        b < head.bMax
      ) {
        const pixel = index / 4;
        sumX += pixel % target.width;
        sumY += Math.floor(pixel / target.width);
        count += 1;
      }
    }
    return count > 0 ? { x: sumX / count, y: sumY / count } : null;
  }, SNAKE_HEAD_GREEN);
}

/** The fruit is the only saturated orange sprite on the board; returns its
 * centroid and pixel count (used to detect "the fruit just respawned
 * elsewhere", which is how eating is observed from pixels alone). */
async function snakeFruitPos(
  page: Page,
): Promise<{ x: number; y: number; count: number } | null> {
  return exampleCanvas(page).evaluate((canvas, fruit) => {
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
      if (
        r > fruit.rMin &&
        g > fruit.gMin &&
        g < fruit.gMax &&
        b < fruit.bMax
      ) {
        const pixel = index / 4;
        sumX += pixel % target.width;
        sumY += Math.floor(pixel / target.width);
        count += 1;
      }
    }
    return count > 0 ? { x: sumX / count, y: sumY / count, count } : null;
  }, SNAKE_FRUIT_ORANGE);
}

test.describe("snake", () => {
  test("loads cleanly and turning changes the snake's heading", async ({
    page,
  }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "snake");
    await expect(page).toHaveTitle("Snake");
    expect(await canvasIsNonblank(exampleCanvas(page))).toBe(true);

    // The snake starts heading right; turning it downward and letting the
    // scheduled moves play out should carry the head downward. Wait on the
    // observed head position rather than sleeping.
    const before = await snakeHeadPos(page);
    expect(before).not.toBeNull();
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(
        async () => {
          const head = await snakeHeadPos(page);
          return head ? head.y : Number.NEGATIVE_INFINITY;
        },
        { timeout: 4_000, message: "turning down should move the head down" },
      )
      .toBeGreaterThan(before!.y + SNAKE_MIN_TURN_PX);

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
    await page.evaluate(
      (thresholds) => {
        function headPos(): { x: number; y: number } | null {
          const canvas = document.querySelector(
            "[data-jgz-example-canvas]",
          ) as HTMLCanvasElement;
          const context = canvas.getContext("2d", {
            willReadFrequently: true,
          })!;
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
            if (
              r > thresholds.head.rMin &&
              r < thresholds.head.rMax &&
              g > thresholds.head.gMin &&
              b > thresholds.head.bMin &&
              b < thresholds.head.bMax
            ) {
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
          const context = canvas.getContext("2d", {
            willReadFrequently: true,
          })!;
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
            if (
              r > thresholds.fruit.rMin &&
              g > thresholds.fruit.gMin &&
              g < thresholds.fruit.gMax &&
              b < thresholds.fruit.bMax
            ) {
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
      },
      { head: SNAKE_HEAD_GREEN, fruit: SNAKE_FRUIT_ORANGE },
    );

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

    // Wait until the debounced auto-save has flushed the best score to
    // localStorage, then reload and confirm it came back without the game
    // ever calling save().
    await expect
      .poll(() => persistedStorageNumber(page, "snake", "highscore"), {
        timeout: 5_000,
        message: "the best score should be auto-saved to localStorage",
      })
      .toBeGreaterThanOrEqual(scored);
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
  return exampleCanvas(page).evaluate((canvas, glass) => {
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
      if (
        r > glass.rMin &&
        r < glass.rMax &&
        g > glass.gMin &&
        g < glass.gMax &&
        b > glass.bMin &&
        b < glass.bMax
      ) {
        const pixel = index / 4;
        sumX += pixel % target.width;
        sumY += Math.floor(pixel / target.width);
        count += 1;
      }
    }
    return count > 0 ? { x: sumX / count, y: sumY / count } : null;
  }, PLATFORMER_HELMET_GLASS);
}

test.describe("platformer", () => {
  test("loads cleanly and a jump moves the player upward", async ({ page }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await openExample(page, "platformer");
    await expect(page).toHaveTitle("Platformer");
    expect(await canvasIsNonblank(exampleCanvas(page))).toBe(true);

    const before = await platformerPlayerPos(page);
    expect(before).not.toBeNull();

    // Jump, then wait until the player has visibly risen (caught during the
    // ascent by a tight poll interval) instead of sampling after a fixed
    // delay.
    await page.keyboard.press("Space");
    await expect
      .poll(
        async () => {
          const pos = await platformerPlayerPos(page);
          return pos ? pos.y : Number.POSITIVE_INFINITY;
        },
        {
          intervals: [80],
          timeout: 4_000,
          message: "a jump should lift the player",
        },
      )
      .toBeLessThan(before!.y - PLATFORMER_MIN_JUMP_PX);

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

    // Hold right and hop on a steady cadence (a Space press only jumps when
    // grounded -- coyote time gates it -- so spamming it mid-air is a no-op),
    // waiting until the player has advanced past the first gap onto the
    // platforms beyond it.
    await page.keyboard.down("ArrowRight");
    try {
      await expect
        .poll(
          async () => {
            await page.keyboard.press("Space");
            const pos = await platformerPlayerPos(page);
            return pos ? pos.x : Number.NEGATIVE_INFINITY;
          },
          {
            intervals: [250],
            timeout: 12_000,
            message:
              "running and hopping should carry the player across the gap",
          },
        )
        .toBeGreaterThan(before!.x + PLATFORMER_MIN_ADVANCE_PX);
    } finally {
      await page.keyboard.up("ArrowRight");
    }

    const status = await exampleStatus(page);
    expect(status.errors).toEqual([]);
    expect(status.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
