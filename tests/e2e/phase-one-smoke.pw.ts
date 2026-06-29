import { expect, test } from "@playwright/test";

test("phase 1 sandbox smoke page renders a nonblank canvas", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  const canvas = page.locator("[data-jgz-phase-one-canvas]");
  await expect(canvas).toHaveAttribute("data-jgz-nonblank", "true");
  await expect(canvas).not.toHaveAttribute("data-jgz-pixel", "0,0,0,0");
  expect(errors).toEqual([]);
});
