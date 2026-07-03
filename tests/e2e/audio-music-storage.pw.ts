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

test("audio fixture sound plays, loops, and stops after a browser gesture", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/fixtures/audio/sound");
  await expect(page).toHaveTitle("js-game-zero Audio Fixture: Sound");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioSound?: { ready?: boolean };
        }
      ).__jgzAudioSound?.ready,
  );

  await page.getByRole("button", { name: "Play Sound" }).click();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioSound?: {
            clicked?: boolean;
            activeAfterStop?: boolean;
          };
        }
      ).__jgzAudioSound?.clicked &&
      (
        window as typeof window & {
          __jgzAudioSound?: { activeAfterStop?: boolean };
        }
      ).__jgzAudioSound?.activeAfterStop === false,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzAudioSound?: {
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
      ).__jgzAudioSound,
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

test("audio fixture tone unlocks browser audio and schedules a tone", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/fixtures/audio/tone");
  await expect(page).toHaveTitle("js-game-zero Audio Fixture: Tone");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioTone?: { ready?: boolean };
        }
      ).__jgzAudioTone?.ready,
  );

  await page.getByRole("button", { name: "Play Tone" }).click();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioTone?: { scheduled?: number };
        }
      ).__jgzAudioTone?.scheduled === 1,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzAudioTone?: {
            clicked: boolean;
            scheduled: number;
            unlocked: boolean;
            contextState: string | null;
            errors: string[];
          };
        }
      ).__jgzAudioTone,
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

test("audio fixture music triggers on_music_end for a generated data URL track", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/fixtures/audio/music");
  await expect(page).toHaveTitle("js-game-zero Audio Fixture: Music");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioMusic?: { ready?: boolean };
        }
      ).__jgzAudioMusic?.ready,
  );

  await page.getByRole("button", { name: "Play Music" }).click();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioMusic?: { endedCount?: number };
        }
      ).__jgzAudioMusic?.endedCount === 1,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzAudioMusic?: {
            clicked: boolean;
            current: string | null;
            endedCount: number;
            dataUrlTrack: boolean;
            errors: string[];
          };
        }
      ).__jgzAudioMusic,
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

test("audio fixture storage persists a high score across reloads", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/fixtures/audio/storage");
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioStorage?: { ready?: boolean };
        }
      ).__jgzAudioStorage?.ready,
  );
  await page.evaluate(() => {
    localStorage.removeItem("js-game-zero:audio_fixture_e2e:save/high_score");
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioStorage?: { ready?: boolean; loadedScore?: unknown };
        }
      ).__jgzAudioStorage?.ready,
  );

  const initial = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzAudioStorage?: { loadedScore: unknown; errors: string[] };
        }
      ).__jgzAudioStorage,
  );
  expect(initial?.loadedScore).toBe(null);
  expect(initial?.errors).toEqual([]);

  await page.getByRole("button", { name: "Save Score" }).click();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioStorage?: { wrote?: boolean };
        }
      ).__jgzAudioStorage?.wrote,
  );

  await page.reload();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioStorage?: { loadedScore?: unknown };
        }
      ).__jgzAudioStorage?.loadedScore === 4242,
  );
  const persisted = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzAudioStorage?: {
            loadedScore: unknown;
            path: string;
            errors: string[];
          };
        }
      ).__jgzAudioStorage,
  );
  expect(persisted).toBeTruthy();
  if (!persisted) throw new Error("Missing storage state.");
  expect(persisted.loadedScore).toBe(4242);
  expect(persisted.path).toBe("js-game-zero:audio_fixture_e2e:save/high_score");
  expect(persisted.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
