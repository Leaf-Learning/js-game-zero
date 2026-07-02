import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectsRoot = resolve(process.cwd(), ".jgz-projects");

// A well-known 1x1 transparent PNG, used to verify binary assets survive
// upload byte-for-byte.
const onePixelPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

let sequence = 0;
function uniqueName(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence}`.toLowerCase();
}

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

async function visibleCanvasIsNonblank(canvas: Locator): Promise<boolean> {
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

function previewCanvas(page: Page): Locator {
  return page
    .frameLocator("[data-jgz-preview]")
    .locator("[data-jgz-preview-canvas]");
}

/** Opens the "new project" chooser from the always-present sidebar button,
 * independent of whether other projects already exist (unlike the
 * first-run empty state, which only shows with zero projects). */
async function openNewProjectChooser(page: Page): Promise<void> {
  await page.locator("[data-jgz-new-project]").click();
}

async function submitDialogName(page: Page, name: string): Promise<void> {
  await page.locator("[data-jgz-dialog-input]").fill(name);
  await page.locator("[data-jgz-dialog-submit]").click();
}

async function createBlankProject(page: Page, name: string): Promise<void> {
  await openNewProjectChooser(page);
  await page.locator("[data-jgz-choose-blank]").click();
  await submitDialogName(page, name);
  await expect(page.locator(`[data-jgz-project="${name}"]`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

async function cloneExampleProject(
  page: Page,
  slug: string,
  name: string,
): Promise<void> {
  await openNewProjectChooser(page);
  await page.locator("[data-jgz-choose-example]").click();
  await page.locator(`[data-jgz-use-example="${slug}"]`).click();
  await submitDialogName(page, name);
  await expect(page.locator(`[data-jgz-project="${name}"]`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

async function setEditorContent(page: Page, source: string): Promise<void> {
  await page.locator("[data-jgz-editor-mount] .cm-content").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.locator("[data-jgz-editor-mount] .cm-content").fill(source);
}

test.beforeAll(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
});

test("create project, starter code runs on Play", async ({ page }) => {
  const { errors, pageErrors } = collectPageErrors(page);
  const name = uniqueName("starter");
  await page.goto("/");
  await expect(page).toHaveTitle("js-game-zero Sandbox");

  await createBlankProject(page, name);
  await expect(
    page.locator("[data-jgz-editor-mount] .cm-content"),
  ).toContainText("Use the arrow keys!");
  await expect(page.locator("[data-jgz-play]")).toBeEnabled();

  await page.locator("[data-jgz-play]").click();
  await expect(page.locator("[data-jgz-preview-status]")).toHaveText("Running");
  const canvas = previewCanvas(page);
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => visibleCanvasIsNonblank(canvas), { timeout: 8_000 })
    .toBe(true);
  await expect(page.locator("[data-jgz-diagnostics]")).toHaveAttribute(
    "data-count",
    "0",
  );

  expect(
    errors.filter((message) => !message.includes("willReadFrequently")),
  ).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("human-speed clicks on another project while a game is running still switch projects", async ({
  page,
}) => {
  const projectA = uniqueName("racer_a");
  const projectB = uniqueName("racer_b");
  await page.goto("/");

  await createBlankProject(page, projectA);
  await createBlankProject(page, projectB);

  // Go back to project A and start it running so the preview iframe is
  // actively posting status/diagnostic messages (previously every
  // animation frame, ~60x/sec) while we try to click project B.
  await page.locator(`[data-jgz-project="${projectA}"]`).click();
  await page.locator("[data-jgz-play]").click();
  await expect(previewCanvas(page)).toBeVisible();
  await expect
    .poll(() => visibleCanvasIsNonblank(previewCanvas(page)), {
      timeout: 8_000,
    })
    .toBe(true);

  // Let a couple of seconds of preview traffic flow, then click at
  // human speed (a real mousedown/mouseup gap) rather than an instant
  // synthetic click, to catch the DOM-teardown race the old UI had.
  await page.waitForTimeout(1200);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.locator(`[data-jgz-project="${projectB}"]`).click({ delay: 80 });
    await page.locator(`[data-jgz-project="${projectA}"]`).click({ delay: 80 });
  }
  await page.locator(`[data-jgz-project="${projectB}"]`).click({ delay: 80 });

  await expect(
    page.locator(`[data-jgz-project="${projectB}"]`),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-jgz-selected-file]")).toHaveText("main.js");
});

test("editing autosaves and survives a reload", async ({ page }) => {
  const name = uniqueName("autosave");
  await page.goto("/");
  await createBlankProject(page, name);

  const marker = `// e2e marker ${Date.now()}`;
  await setEditorContent(
    page,
    `${marker}\nfunction draw() { screen.fill("#123456"); }\n`,
  );
  await expect(page.locator("[data-jgz-save-status]")).toHaveText("Saved", {
    timeout: 4_000,
  });

  await page.reload();
  await expect(page.locator(`[data-jgz-project="${name}"]`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.locator("[data-jgz-editor-mount] .cm-content"),
  ).toContainText(marker);
});

test("uploading an image asset shows a thumbnail and never opens as text", async ({
  page,
}, testInfo) => {
  const name = uniqueName("assets");
  await page.goto("/");
  await createBlankProject(page, name);

  const pngPath = testInfo.outputPath("pixel.png");
  const pngBytes = Buffer.from(onePixelPngBase64, "base64");
  await writeFile(pngPath, pngBytes);

  await page.locator("[data-jgz-asset-file]").setInputFiles(pngPath);
  const assetRow = page.locator('[data-jgz-asset="images/pixel.png"]');
  await expect(assetRow).toBeVisible();
  await expect(assetRow.locator("img.asset-thumb")).toBeVisible();

  const onDiskBefore = await readFile(
    resolve(projectsRoot, name, "images", "pixel.png"),
  );
  expect(onDiskBefore).toEqual(pngBytes);

  // Clicking the asset (including its thumbnail) must never route it
  // through the code editor: no file-open handler exists on asset rows.
  await assetRow.click();
  await assetRow.locator("img.asset-thumb").click();
  await expect(page.locator("[data-jgz-selected-file]")).toHaveText("main.js");
  await expect(
    page.locator("[data-jgz-editor-mount] .cm-content"),
  ).not.toContainText("PNG");

  const onDiskAfter = await readFile(
    resolve(projectsRoot, name, "images", "pixel.png"),
  );
  expect(onDiskAfter).toEqual(pngBytes);
});

test("Stop halts the running game", async ({ page }) => {
  const name = uniqueName("stopgame");
  await page.goto("/");
  await createBlankProject(page, name);

  await page.locator("[data-jgz-play]").click();
  const canvas = previewCanvas(page);
  await expect
    .poll(() => visibleCanvasIsNonblank(canvas), { timeout: 8_000 })
    .toBe(true);
  await expect(page.locator("[data-jgz-preview-status]")).toHaveText("Running");

  await page.locator("[data-jgz-stop]").click();
  await expect(page.locator("[data-jgz-preview-status]")).toHaveText("Stopped");
  await expect(page.locator("[data-jgz-preview]")).toHaveCount(0);
  await expect(page.locator("[data-jgz-stop]")).toBeDisabled();
});

test("console.log from game code appears in the console pane", async ({
  page,
}) => {
  const name = uniqueName("consolelog");
  await page.goto("/");
  await createBlankProject(page, name);

  await setEditorContent(
    page,
    `WIDTH = 320;\nHEIGHT = 180;\nconsole.log("hello from e2e game code");\nfunction draw() { screen.fill("#101010"); }\n`,
  );
  await page.locator("[data-jgz-play]").click();

  await expect(page.locator("[data-jgz-console-output]")).toContainText(
    "hello from e2e game code",
    { timeout: 8_000 },
  );
});

test("a syntax error shows exactly one friendly diagnostic entry", async ({
  page,
}) => {
  const name = uniqueName("syntaxerr");
  await page.goto("/");
  await createBlankProject(page, name);

  await setEditorContent(
    page,
    `function draw() {\n  screen.fill("#f6c85f");\n`, // missing closing brace
  );
  await page.locator("[data-jgz-play]").click();

  await expect(page.locator("[data-jgz-diagnostics]")).toHaveAttribute(
    "data-count",
    "1",
    { timeout: 8_000 },
  );
  await expect(page.locator("[data-jgz-diagnostics] li")).toHaveCount(1);
  await expect(page.locator("[data-jgz-preview-status]")).toHaveText(
    "Something went wrong",
  );
});

test("cloning an example produces a running game", async ({ page }) => {
  const name = uniqueName("cloned");
  await page.goto("/");
  await cloneExampleProject(page, "actor-movement", name);

  await expect(
    page.locator("[data-jgz-editor-mount] .cm-content"),
  ).toContainText("new Actor");

  await page.locator("[data-jgz-play]").click();
  const canvas = previewCanvas(page);
  await expect
    .poll(() => visibleCanvasIsNonblank(canvas), { timeout: 8_000 })
    .toBe(true);
  await expect(page.locator("[data-jgz-diagnostics]")).toHaveAttribute(
    "data-count",
    "0",
  );
});

test("cloning an asset-heavy game copies its assets and runs", async ({
  page,
}) => {
  const name = uniqueName("flappy");
  await page.goto("/");
  await cloneExampleProject(page, "flappy-bird", name);

  await expect(
    page.locator("[data-jgz-editor-mount] .cm-content"),
  ).toContainText("Flappy Bird");

  // Every image and sound the game needs must have been copied into the
  // new project (visible in the assets panel and byte-identical on disk).
  const expectedAssets = [
    "images/background.png",
    "images/plane.png",
    "images/rock_top.png",
    "images/rock_bottom.png",
    "sounds/flap.ogg",
    "sounds/hit.ogg",
    "sounds/score.ogg",
  ];
  for (const asset of expectedAssets) {
    await expect(page.locator(`[data-jgz-asset="${asset}"]`)).toBeVisible();
    const copied = await readFile(resolve(projectsRoot, name, asset));
    const original = await readFile(
      resolve(process.cwd(), "examples/flappy-bird/assets", asset),
    );
    expect(copied).toEqual(original);
  }

  await page.locator("[data-jgz-play]").click();
  const canvas = previewCanvas(page);
  await expect
    .poll(() => visibleCanvasIsNonblank(canvas), { timeout: 8_000 })
    .toBe(true);
  await expect(page.locator("[data-jgz-diagnostics]")).toHaveAttribute(
    "data-count",
    "0",
  );
});

test("viewport 1024x700 shows Play with no clipped controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  const name = uniqueName("narrow");
  await page.goto("/");
  await createBlankProject(page, name);

  const playButton = page.locator("[data-jgz-play]");
  await expect(playButton).toBeVisible();
  const box = await playButton.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1024);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(700);
  }

  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(1024);
});
