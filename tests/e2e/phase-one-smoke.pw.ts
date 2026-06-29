import { expect, test } from "@playwright/test";

test("phase 1 sandbox smoke page renders a nonblank canvas", async ({
  page,
}) => {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/phase-one");
  await expect(page).toHaveTitle("js-game-zero Phase 1 Smoke");
  await expect(
    page.getByRole("heading", { name: "js-game-zero sandbox scaffold" }),
  ).toBeVisible();
  const canvas = page.locator("[data-jgz-phase-one-canvas]");
  await expect(canvas).toHaveAttribute("data-jgz-nonblank", "true");

  const nonzeroPixels = await canvas.evaluate((node) => {
    const canvasNode = node as HTMLCanvasElement;
    const ctx = canvasNode.getContext("2d");
    if (!ctx) return 0;
    const pixels = ctx.getImageData(
      0,
      0,
      canvasNode.width,
      canvasNode.height,
    ).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (
        pixels[index] !== 0 ||
        pixels[index + 1] !== 0 ||
        pixels[index + 2] !== 0 ||
        pixels[index + 3] !== 0
      ) {
        count += 1;
      }
    }
    return count;
  });

  expect(nonzeroPixels).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
