import { expect, test, type Page } from "@playwright/test";

/**
 * Proves the "synchronous feel" parity fixes in a real browser, without
 * requiring any new sandbox server routes:
 *
 * - An Actor constructed in top-level code, plus a `screen.blit(...)`
 *   call in `draw()`, both reference an asset that must be fetched over
 *   the network. The runtime's preload/late-load gate must hold every
 *   frame until those assets are loaded, so the very first `draw()`
 *   call that actually executes already has correct Actor geometry and
 *   already paints the blitted sprite (Pygame Zero parity: nothing
 *   half-loaded is ever presented).
 * - A storage mutation made with no explicit `save()` call survives a
 *   full page reload, proving storage is auto-loaded before the first
 *   frame and auto-saved (via the `pagehide` flush) with no code in the
 *   game ever calling `storage.save()`.
 *
 * Both scenarios drive `/runtime/core.js` (the already-served core
 * bundle) directly from an injected script, reusing the existing
 * `/assets/asset-sync-fixture/*` fixture assets and the `/examples` page
 * as a neutral origin that does not itself run a game.
 */

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

type FirstFrameResult = {
  drawInvocationsAtCapture: unknown;
  firstFrameHeroWidth: unknown;
  firstFrameHeroHeight: unknown;
  firstFramePos: unknown;
  firstFrameHeroPixel: number[];
  firstFrameBlitPixel: number[];
  firstFrameBackgroundPixel: number[];
};

function colorDistance(a: readonly number[], b: readonly number[]): number {
  return (
    Math.abs((a[0] ?? 0) - (b[0] ?? 0)) +
    Math.abs((a[1] ?? 0) - (b[1] ?? 0)) +
    Math.abs((a[2] ?? 0) - (b[2] ?? 0))
  );
}

test("an Actor + blit game renders correct data on its first presented frame", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);

  // A neutral page: it has no canvas and runs no game of its own, so it
  // cannot interfere with the game this test injects and drives itself.
  await page.goto("/examples");

  const result = await page.evaluate<FirstFrameResult>(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 150;
    document.body.append(canvas);

    const coreRuntimeUrl = "/runtime/core.js";
    const { run } = await import(coreRuntimeUrl);

    const source = `
let hero = new Actor("player.svg", { center: [40, 75] });

function draw() {
  screen.fill("#101010");
  screen.blit("player.svg", [120, 10]);
  hero.draw();

  const draws = (storage.get("drawInvocations") ?? 0) + 1;
  storage.set("drawInvocations", draws);
  if (draws === 1) {
    storage.set("firstFrameHeroWidth", hero.width);
    storage.set("firstFrameHeroHeight", hero.height);
    storage.set("firstFramePos", hero.pos);
    storage.set(
      "firstFrameHeroPixel",
      Array.from(screen.context.getImageData(hero.pos[0], hero.pos[1], 1, 1).data),
    );
    storage.set(
      "firstFrameBlitPixel",
      Array.from(screen.context.getImageData(138, 24, 1, 1).data),
    );
    storage.set(
      "firstFrameBackgroundPixel",
      Array.from(screen.context.getImageData(5, 5, 1, 1).data),
    );
  }
}
`;

    const handle = run(source, {
      canvas,
      projectId: "asset-sync-fixture",
      assetBaseUrl: "/assets",
    });

    const deadline = Date.now() + 8000;
    while ((handle.storage.get("drawInvocations") ?? 0) < 1) {
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for the first draw() call.");
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const captured = {
      drawInvocationsAtCapture: handle.storage.get("drawInvocations"),
      firstFrameHeroWidth: handle.storage.get("firstFrameHeroWidth"),
      firstFrameHeroHeight: handle.storage.get("firstFrameHeroHeight"),
      firstFramePos: handle.storage.get("firstFramePos"),
      firstFrameHeroPixel: handle.storage.get("firstFrameHeroPixel"),
      firstFrameBlitPixel: handle.storage.get("firstFrameBlitPixel"),
      firstFrameBackgroundPixel: handle.storage.get(
        "firstFrameBackgroundPixel",
      ),
    };
    handle.stop();
    return captured as FirstFrameResult;
  });

  // The very first executed draw() already had the fully loaded sprite:
  // correct dimensions and a center position matching the constructor.
  expect(result.drawInvocationsAtCapture).toBe(1);
  expect(result.firstFrameHeroWidth).toBe(36);
  expect(result.firstFrameHeroHeight).toBe(28);
  expect(result.firstFramePos).toEqual([40, 75]);

  // Both the Actor and the blit painted real, opaque pixels distinct
  // from the background fill on that same first frame — nothing was
  // silently skipped while the asset was still loading.
  expect(result.firstFrameHeroPixel[3]).toBe(255);
  expect(result.firstFrameBlitPixel[3]).toBe(255);
  expect(
    colorDistance(result.firstFrameHeroPixel, result.firstFrameBackgroundPixel),
  ).toBeGreaterThan(20);
  expect(
    colorDistance(result.firstFrameBlitPixel, result.firstFrameBackgroundPixel),
  ).toBeGreaterThan(20);

  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("a storage mutation with no explicit save() persists across a page reload", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  const projectId = "sync_assets_storage_e2e";
  const storageKey = `js-game-zero:${projectId}:storage`;

  await page.goto("/examples");
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);

  async function runGameAndReadScore(): Promise<unknown> {
    return page.evaluate(async (pid) => {
      const canvas = document.createElement("canvas");
      document.body.append(canvas);
      const coreRuntimeUrl = "/runtime/core.js";
      const { run } = await import(coreRuntimeUrl);

      // No call to storage.save() anywhere in this game or this harness.
      const source = `
storage.score = (storage.get("score") ?? 0) + 1;

function update() {}
function draw() {}
`;
      const handle = run(source, { canvas, projectId: pid });
      await handle.ready;
      return handle.storage.get("score");
    }, projectId);
  }

  const firstScore = await runGameAndReadScore();
  expect(firstScore).toBe(1);

  // A real navigation: the outgoing document fires `pagehide`, which the
  // runtime's auto-save wiring uses to flush any unsaved mutation before
  // the page is torn down.
  await page.reload();

  const secondScore = await runGameAndReadScore();
  expect(secondScore).toBe(2);

  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
