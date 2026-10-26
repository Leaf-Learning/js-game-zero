import { expect, test } from "@playwright/test";
import type { GameHandle } from "@js-game-zero/core";
import { collectPageErrors } from "./fixtures/harness-helpers";

/**
 * Pages that load the script-tag build with a plain <script src>, as the
 * docs' "game in one web page" does, and do nothing more for the game.
 */

declare global {
  interface Window {
    __jgzHeadGame?: GameHandle;
  }
}

test("a game started from <head> joins the page's <body> once there is one", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/fixtures/script-in-head");

  const canvas = page.locator("body > canvas");
  await expect(canvas).toHaveCount(1);
  // After the page's own content, as if the script had ended the <body>.
  expect(
    await page.evaluate(
      () =>
        document.querySelector("[data-jgz-page-text]")?.nextElementSibling
          ?.tagName,
    ),
  ).toBe("CANVAS");
  expect(await page.evaluate(() => window.__jgzHeadGame?.state)).toBe(
    "running",
  );

  const before = await canvas.screenshot();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowRight");
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test.describe("on a touch screen", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("a game started from <head> still gets its touch controls", async ({
    page,
  }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await page.goto("/fixtures/script-in-head");
    const controls = page.locator("[data-jgz-touch-controls]");
    await expect(controls).toBeVisible();
    await expect(
      controls.getByRole("button", { name: "Right", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

test("a page that passes no diagnostics callback hears about problems in the console", async ({
  page,
}) => {
  const messages: { type: string; text: string }[] = [];
  page.on("console", (message) =>
    messages.push({ type: message.type(), text: message.text() }),
  );
  await page.goto("/fixtures/unhandled-problems");

  await expect
    .poll(() => messages.filter((message) => message.type === "error"))
    .toHaveLength(1);
  expect(messages).toEqual([
    {
      type: "warning",
      text: expect.stringMatching(/^js-game-zero: .*updte/),
    },
    {
      type: "error",
      text: "js-game-zero: draw failed: screen.fil doesn't exist. Did you mean screen.fill? (line 4)",
    },
  ]);
  await expect(page.locator("canvas")).toHaveCount(0);
});
