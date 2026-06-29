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

test("phase 4 sound fixture plays, loops, and stops after a browser gesture", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/phase-four/sound");
  await expect(page).toHaveTitle("js-game-zero Phase 4 Sound");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Sound?: { ready?: boolean };
        }
      ).__jgzPhase4Sound?.ready,
  );

  await page.getByRole("button", { name: "Play Sound" }).click();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Sound?: {
            clicked?: boolean;
            activeAfterStop?: boolean;
          };
        }
      ).__jgzPhase4Sound?.clicked &&
      (
        window as typeof window & {
          __jgzPhase4Sound?: { activeAfterStop?: boolean };
        }
      ).__jgzPhase4Sound?.activeAfterStop === false,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Sound?: {
            clicked: boolean;
            dataUrlSound: boolean;
            activeAfterPlay: boolean;
            activeAfterStop: boolean;
            loop: boolean;
            volume: number;
            lastError: string | null;
            errors: string[];
          };
        }
      ).__jgzPhase4Sound,
  );
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing sound state.");
  expect(state.clicked).toBe(true);
  expect(state.dataUrlSound).toBe(true);
  expect(state.activeAfterPlay).toBe(true);
  expect(state.activeAfterStop).toBe(false);
  expect(state.loop).toBe(true);
  expect(state.volume).toBe(0.5);
  expect(state.lastError).toBe(null);
  expect(state.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("phase 4 tone fixture unlocks browser audio and schedules a tone", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/phase-four/tone");
  await expect(page).toHaveTitle("js-game-zero Phase 4 Tone");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Tone?: { ready?: boolean };
        }
      ).__jgzPhase4Tone?.ready,
  );

  await page.getByRole("button", { name: "Play Tone" }).click();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Tone?: { scheduled?: number };
        }
      ).__jgzPhase4Tone?.scheduled === 1,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Tone?: {
            clicked: boolean;
            scheduled: number;
            unlocked: boolean;
            contextState: string | null;
            errors: string[];
          };
        }
      ).__jgzPhase4Tone,
  );
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing tone state.");
  expect(state.clicked).toBe(true);
  expect(state.scheduled).toBe(1);
  expect(state.unlocked).toBe(true);
  expect(state.contextState).toBe("running");
  expect(state.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("phase 4 music fixture triggers on_music_end for a generated data URL track", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/phase-four/music");
  await expect(page).toHaveTitle("js-game-zero Phase 4 Music");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Music?: { ready?: boolean };
        }
      ).__jgzPhase4Music?.ready,
  );

  await page.getByRole("button", { name: "Play Music" }).click();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Music?: { endedCount?: number };
        }
      ).__jgzPhase4Music?.endedCount === 1,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Music?: {
            clicked: boolean;
            current: string | null;
            endedCount: number;
            dataUrlTrack: boolean;
            errors: string[];
          };
        }
      ).__jgzPhase4Music,
  );
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing music state.");
  expect(state.clicked).toBe(true);
  expect(state.dataUrlTrack).toBe(true);
  expect(state.current).toBe(null);
  expect(state.endedCount).toBe(1);
  expect(state.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("phase 4 storage fixture persists a high score across reloads", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/phase-four/storage");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Storage?: { ready?: boolean };
        }
      ).__jgzPhase4Storage?.ready,
  );
  await page.evaluate(() => {
    localStorage.removeItem("js-game-zero:phase_four_e2e:save/high_score");
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Storage?: { ready?: boolean; loadedScore?: unknown };
        }
      ).__jgzPhase4Storage?.ready,
  );

  const initial = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Storage?: { loadedScore: unknown; errors: string[] };
        }
      ).__jgzPhase4Storage,
  );
  expect(initial?.loadedScore).toBe(null);
  expect(initial?.errors).toEqual([]);

  await page.getByRole("button", { name: "Save Score" }).click();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Storage?: { wrote?: boolean };
        }
      ).__jgzPhase4Storage?.wrote,
  );

  await page.reload();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Storage?: { loadedScore?: unknown };
        }
      ).__jgzPhase4Storage?.loadedScore === 4242,
  );
  const persisted = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzPhase4Storage?: {
            loadedScore: unknown;
            path: string;
            errors: string[];
          };
        }
      ).__jgzPhase4Storage,
  );
  expect(persisted).toBeTruthy();
  if (!persisted) throw new Error("Missing storage state.");
  expect(persisted.loadedScore).toBe(4242);
  expect(persisted.path).toBe("js-game-zero:phase_four_e2e:save/high_score");
  expect(persisted.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
