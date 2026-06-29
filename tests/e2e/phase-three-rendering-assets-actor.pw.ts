import { expect, test } from "@playwright/test";

function collectPageErrors(page: import("@playwright/test").Page): {
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

function expectOpaque(pixel: number[]): void {
  expect(pixel.at(3)).toBe(255);
}

function expectNotColor(
  pixel: number[],
  color: [number, number, number],
): void {
  const [red, green, blue] = pixel;
  const [targetRed, targetGreen, targetBlue] = color;
  expect(
    Math.abs((red ?? 0) - targetRed) +
      Math.abs((green ?? 0) - targetGreen) +
      Math.abs((blue ?? 0) - targetBlue),
  ).toBeGreaterThan(20);
}

test("phase 3 drawing example renders canvas primitives and gradient pixels", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/phase-three/drawing");
  await expect(page).toHaveTitle("js-game-zero Phase 3 Drawing");
  await expect(
    page.getByRole("heading", { name: "js-game-zero rendering fixture" }),
  ).toBeVisible();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase3Drawing?: { ready?: boolean };
        }
      ).__jgzPhase3Drawing?.ready,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzPhase3Drawing?: {
            gradientTop: number[];
            gradientBottom: number[];
            clearedAlpha: number;
            rectPixel: number[];
            linePixel: number[];
            circlePixel: number[];
            polygonPixel: number[];
          };
        }
      ).__jgzPhase3Drawing,
  );
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing drawing state.");

  expectOpaque(state.gradientTop);
  expectOpaque(state.gradientBottom);
  expect(state.gradientTop.slice(0, 3)).not.toEqual(
    state.gradientBottom.slice(0, 3),
  );
  expect(state.clearedAlpha).toBe(0);
  expect(state.rectPixel[0]).toBeGreaterThan(180);
  expect(state.rectPixel[1]).toBeLessThan(100);
  expectOpaque(state.linePixel);
  expect(state.circlePixel[1]).toBeGreaterThan(180);
  expect(state.circlePixel[0]).toBeLessThan(100);
  expect(state.polygonPixel[0]).toBeGreaterThan(220);
  expect(state.polygonPixel[1]).toBeGreaterThan(220);
  expect(state.polygonPixel[2]).toBeGreaterThan(220);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("phase 3 text example renders text and textbox regions", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/phase-three/text");
  await expect(page).toHaveTitle("js-game-zero Phase 3 Text");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase3Text?: { ready?: boolean };
        }
      ).__jgzPhase3Text?.ready,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzPhase3Text?: {
            headingLayout: {
              lineCount: number;
              align: string;
              anchorOffset: [number, number];
              topLeft: [number, number];
            };
            symbolicLayout: {
              anchorOffset: [number, number];
              actualCenter: [number, number];
              topLeft: [number, number];
              changed: boolean;
            };
            textboxFitFontSize: number;
            headingChanged: boolean;
            textboxChanged: boolean;
            alphaPixel: number[];
            rotatedChanged: boolean;
          };
        }
      ).__jgzPhase3Text,
  );
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing text state.");
  expect(state.headingLayout.lineCount).toBeGreaterThan(1);
  expect(state.headingLayout.align).toBe("center");
  expect(state.headingLayout.anchorOffset[0]).toBeGreaterThan(80);
  expect(state.headingLayout.topLeft[0]).toBeLessThan(40);
  expect(state.symbolicLayout.anchorOffset).toEqual([16, 12]);
  expect(state.symbolicLayout.topLeft).toEqual([206, 52]);
  expect(state.symbolicLayout.actualCenter).toEqual([222, 64]);
  expect(state.symbolicLayout.changed).toBe(true);
  expect(state.textboxFitFontSize).toBeLessThan(24);
  expect(state.headingChanged).toBe(true);
  expect(state.textboxChanged).toBe(true);
  expectNotColor(state.alphaPixel, [23, 33, 43]);
  expect(state.alphaPixel[0]).toBeLessThan(255);
  expect(state.rotatedChanged).toBe(true);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("phase 3 loader example resolves cached assets and blits the sprite", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/phase-three/loader");
  await expect(page).toHaveTitle("js-game-zero Phase 3 Loader");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase3Loader?: { ready?: boolean };
        }
      ).__jgzPhase3Loader?.ready,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzPhase3Loader?: {
            cacheHit: boolean;
            dimensions: [number, number];
            imagePixel: number[];
            soundName: string;
            musicName: string;
            fontFamily: string;
            fontLoaded: boolean;
            unloaded: boolean;
          };
        }
      ).__jgzPhase3Loader,
  );
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing loader state.");

  expect(state.cacheHit).toBe(true);
  expect(state.dimensions).toEqual([32, 24]);
  expectNotColor(state.imagePixel, [15, 23, 42]);
  expect(state.soundName).toBe("tap.wav");
  expect(state.musicName).toBe("theme.ogg");
  expect(state.fontFamily).toBe("ui");
  expect(state.fontLoaded).toBe(true);
  expect(state.unloaded).toBe(true);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("phase 3 actor example renders, moves, rotates, and reports collision state", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/phase-three/actor");
  await expect(page).toHaveTitle("js-game-zero Phase 3 Actor");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase3Actor?: { ready?: boolean };
        }
      ).__jgzPhase3Actor?.ready,
  );

  const initial = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzPhase3Actor?: {
            pos: [number, number];
            spritePixel: number[];
            rect: { width: number; height: number };
            anchorRect: {
              left: number;
              top: number;
              width: number;
              height: number;
            };
            colliding: boolean;
          };
        }
      ).__jgzPhase3Actor,
  );
  expect(initial).toBeTruthy();
  if (!initial) throw new Error("Missing initial actor state.");
  expect(initial.pos).toEqual([60, 52]);
  expectNotColor(initial.spritePixel, [15, 23, 42]);
  expect(initial.rect).toMatchObject({ width: 32, height: 24 });
  expect(initial.anchorRect).toEqual({
    left: 18,
    top: 112,
    width: 32,
    height: 24,
  });
  expect(initial.colliding).toBe(false);

  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase3Actor?: { moved?: boolean };
        }
      ).__jgzPhase3Actor?.moved,
  );

  const moved = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzPhase3Actor?: {
            pos: [number, number];
            opacity: number;
            rotatedRect: { width: number; height: number };
            colliding: boolean;
          };
        }
      ).__jgzPhase3Actor,
  );
  expect(moved).toBeTruthy();
  if (!moved) throw new Error("Missing moved actor state.");
  expect(moved.pos).toEqual([112, 52]);
  expect(moved.opacity).toBe(0.55);
  expect(moved.rotatedRect.width).toBeGreaterThan(32);
  expect(moved.rotatedRect.height).toBeGreaterThan(24);
  expect(moved.colliding).toBe(true);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
