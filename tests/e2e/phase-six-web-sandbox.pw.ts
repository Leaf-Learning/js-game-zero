import { expect, test, type Page } from "@playwright/test";
import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectName = "phase_six_e2e";
const projectsRoot = resolve(process.cwd(), ".jgz-projects");

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

async function visibleCanvasIsNonblank(
  canvas: ReturnType<Page["locator"]>,
): Promise<boolean> {
  return canvas.evaluate((node) => {
    const target = node as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    const data = context.getImageData(0, 0, target.width, target.height).data;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) return true;
    }
    return false;
  });
}

test.beforeAll(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
});

test("phase 6 sandbox create, edit, upload, play, diagnostics, and reload workflow", async ({
  page,
}, testInfo) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/");
  await expect(page).toHaveTitle("js-game-zero Sandbox");
  await expect(page.locator("[data-jgz-play]")).toBeDisabled();

  await page.locator("[data-jgz-project-name]").fill(projectName);
  await page.locator("[data-jgz-create]").click();
  await expect(
    page.locator(`[data-jgz-project="${projectName}"]`),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-jgz-file="main.js"]')).toBeVisible();
  await expect(page.locator("[data-jgz-play]")).toBeEnabled();

  const validSource = `WIDTH = 320;
HEIGHT = 180;
let player = null;
images.load("player.svg").then(() => {
  player = images.player;
  storage.set("imagePropertyAccess", player.get_width());
});

function draw() {
  screen.fill("#07131f");
  screen.draw.filled_rect([18, 18, 80, 60], "#22c55e");
  if (player) {
    screen.blit(player, [140, 64]);
  }
}
`;

  const editor = page.locator("[data-jgz-editor]");
  await editor.fill(validSource);
  await expect(page.locator("body")).toHaveAttribute("data-jgz-dirty", "true");
  await expect(page.locator("[data-jgz-save]")).toBeEnabled();

  const assetPath = testInfo.outputPath("player.svg");
  await writeFile(
    assetPath,
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ef4444"/></svg>`,
    "utf8",
  );
  await page.locator("[data-jgz-asset-file]").setInputFiles(assetPath);
  await expect(page.locator("[data-jgz-upload]")).toBeEnabled();
  await page.locator("[data-jgz-upload]").click();
  await expect(
    page.locator('[data-jgz-file="images/player.svg"]'),
  ).toBeVisible();

  await page.locator("[data-jgz-play]").click();
  await expect(page.locator("body")).toHaveAttribute("data-jgz-dirty", "false");
  const previewCanvas = page
    .frameLocator("[data-jgz-preview]")
    .locator("[data-jgz-preview-canvas]");
  await expect(previewCanvas).toBeVisible();
  await expect
    .poll(() => visibleCanvasIsNonblank(previewCanvas), { timeout: 8_000 })
    .toBe(true);
  await expect(page.locator("[data-jgz-diagnostics]")).toHaveAttribute(
    "data-count",
    "0",
  );

  await editor.fill(`WIDTH = 320;
HEIGHT = 180;

function drwa() {
  screen.fill("#f6c85f");
}
`);
  await page.locator("[data-jgz-play]").click();
  await expect(page.locator("[data-jgz-diagnostics]")).toContainText(
    "Did you mean draw",
  );

  await page.reload();
  await expect(
    page.locator(`[data-jgz-project="${projectName}"]`),
  ).toBeVisible();
  await expect(page.locator('[data-jgz-file="main.js"]')).toBeVisible();
  await expect(
    page.locator('[data-jgz-file="images/player.svg"]'),
  ).toBeVisible();
  await expect(editor).toHaveValue(/drwa/);

  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
