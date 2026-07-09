import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { e2eProjectsRoot as projectsRoot } from "./fixtures/e2e-projects-root";
import {
  canvasIsNonblank,
  collectPageErrors,
} from "./fixtures/harness-helpers";

// A well-known 1x1 transparent PNG, used to verify binary assets survive
// upload byte-for-byte.
const onePixelPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

let sequence = 0;
function uniqueName(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence}`.toLowerCase();
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

/**
 * Extracts the final, complete "win, lose, and play again" game from
 * docs/tutorial.md -- the culmination of the tutorial's step-by-step build --
 * so the tutorial test below proves the exact code a learner ends up with
 * actually runs cleanly in the real sandbox, not just that it compiles.
 */
async function finalTutorialGameSource(): Promise<string> {
  const tutorial = await readFile("docs/tutorial.md", "utf8");
  const match =
    /## 10\. Win, lose, and play again[\s\S]*?```js\n([\s\S]*?)```/.exec(
      tutorial,
    );
  if (!match?.[1]) {
    throw new Error("Missing the tutorial's final game snippet.");
  }
  return match[1].trim();
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
    .poll(() => canvasIsNonblank(canvas), { timeout: 8_000 })
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
    .poll(() => canvasIsNonblank(previewCanvas(page)), {
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
    .poll(() => canvasIsNonblank(canvas), { timeout: 8_000 })
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
    .poll(() => canvasIsNonblank(canvas), { timeout: 8_000 })
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
    .poll(() => canvasIsNonblank(canvas), { timeout: 8_000 })
    .toBe(true);
  await expect(page.locator("[data-jgz-diagnostics]")).toHaveAttribute(
    "data-count",
    "0",
  );
});

test("naming an example project opens above the gallery dialog", async ({
  page,
}) => {
  const name = uniqueName("zorder");
  await page.goto("/");
  await createBlankProject(page, name);

  // Regression: the gallery and the prompt dialogs live in separate fixed
  // hosts, and the naming prompt used to paint *behind* the gallery
  // whenever the prompt host was created first. Reconstruct that order: a
  // fresh page load whose first dialog is a plain prompt (new file),
  // canceled, then the gallery flow.
  await page.reload();
  await page.locator("[data-jgz-new-file]").click();
  await page.locator("[data-jgz-dialog-cancel]").click();
  await page.locator("[data-jgz-open-examples]").click();
  await page.locator('[data-jgz-use-example="snake"]').click();

  // fill + click hit-test the prompt: both fail if the gallery covers it.
  const exampleName = uniqueName("zorder_snake");
  await submitDialogName(page, exampleName);
  await expect(
    page.locator(`[data-jgz-project="${exampleName}"]`),
  ).toHaveAttribute("aria-pressed", "true");
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

async function dragHandle(
  page: Page,
  handle: Locator,
  dx: number,
  dy: number,
): Promise<void> {
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 5 });
  await page.mouse.up();
}

test("panel dividers resize the layout, scale the game, and persist", async ({
  page,
}) => {
  const name = uniqueName("resize");
  await page.goto("/");
  await createBlankProject(page, name);
  await page.locator("[data-jgz-play]").click();
  const canvas = previewCanvas(page);
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => canvasIsNonblank(canvas), { timeout: 8_000 })
    .toBe(true);

  // The displayed canvas must keep the game's own aspect ratio (no more
  // stretching into a fixed 16:9 box).
  const logical = await canvas.evaluate((node) => {
    const target = node as HTMLCanvasElement;
    return { width: target.width, height: target.height };
  });
  const displayedBefore = await canvas.boundingBox();
  expect(displayedBefore).not.toBeNull();
  if (!displayedBefore) return;
  expect(displayedBefore.width / displayedBefore.height).toBeCloseTo(
    logical.width / logical.height,
    1,
  );

  // Dragging the preview divider left widens the pane and grows the game.
  const pane = page.locator("[data-jgz-preview-pane]");
  const paneBefore = (await pane.boundingBox())?.width ?? 0;
  await dragHandle(page, page.locator('[data-jgz-resize="preview"]'), -120, 0);
  const paneAfter = (await pane.boundingBox())?.width ?? 0;
  expect(paneAfter).toBeCloseTo(paneBefore + 120, 0);
  const displayedAfter = await canvas.boundingBox();
  expect(displayedAfter).not.toBeNull();
  if (!displayedAfter) return;
  expect(displayedAfter.width).toBeGreaterThan(displayedBefore.width);
  expect(displayedAfter.width / displayedAfter.height).toBeCloseTo(
    logical.width / logical.height,
    1,
  );

  // Dragging the console divider up grows the console at the frame's expense.
  const consolePanel = page.locator("[data-jgz-console-panel]");
  const consoleBefore = (await consolePanel.boundingBox())?.height ?? 0;
  await dragHandle(page, page.locator('[data-jgz-resize="console"]'), 0, -60);
  const consoleAfter = (await consolePanel.boundingBox())?.height ?? 0;
  expect(consoleAfter).toBeCloseTo(consoleBefore + 60, 0);

  // Sizes survive a reload.
  await page.reload();
  expect((await pane.boundingBox())?.width ?? 0).toBeCloseTo(paneAfter, 0);
  expect((await consolePanel.boundingBox())?.height ?? 0).toBeCloseTo(
    consoleAfter,
    0,
  );
});

test("mouse positions map to game coordinates on the scaled preview", async ({
  page,
}) => {
  const name = uniqueName("mousemap");
  await page.goto("/");
  await createBlankProject(page, name);
  await setEditorContent(
    page,
    [
      "WIDTH = 800;",
      "HEIGHT = 480;",
      'function draw() { screen.fill("purple"); }',
      "function on_mouse_down(pos) {",
      '  console.log("POS " + Math.round(pos[0]) + "," + Math.round(pos[1]));',
      "}",
    ].join("\n"),
  );
  await page.locator("[data-jgz-play]").click();
  const canvas = previewCanvas(page);
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => canvasIsNonblank(canvas), { timeout: 8_000 })
    .toBe(true);

  // The first click lands on the focus overlay; it only claims focus.
  const overlay = page.locator("[data-jgz-focus-overlay]");
  if (await overlay.isVisible()) await overlay.click();

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  // The canvas is displayed smaller than its 800x480 logical size, so an
  // unscaled mapping would report the raw CSS offset instead of the game
  // coordinate. Click the displayed center: the game must see ~(400, 240).
  expect(box.width).toBeLessThan(700);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".console-line").first()).toHaveText(
    /^POS (399|400|401),(239|240|241)$/,
  );
});

test("the tutorial's finished game runs from a clean sandbox project", async ({
  page,
}, testInfo) => {
  const { errors, pageErrors } = collectPageErrors(page);
  const name = uniqueName("tutorial");
  const source = await finalTutorialGameSource();

  await page.goto("/");
  await createBlankProject(page, name);

  await setEditorContent(page, source);
  await expect(page.locator("[data-jgz-save-status]")).toHaveText("Saved", {
    timeout: 4_000,
  });

  const assetPath = testInfo.outputPath("player.svg");
  await writeFile(
    assetPath,
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="12" fill="#22c55e"/></svg>`,
    "utf8",
  );
  await page.locator("[data-jgz-asset-file]").setInputFiles(assetPath);
  await expect(
    page.locator('[data-jgz-asset="images/player.svg"]'),
  ).toBeVisible();

  await page.locator("[data-jgz-play]").click();
  await expect(page.locator("body")).toHaveAttribute("data-jgz-dirty", "false");
  await expect(page.locator("[data-jgz-diagnostics]")).toHaveAttribute(
    "data-count",
    "0",
  );
  const canvas = previewCanvas(page);
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => canvasIsNonblank(canvas), { timeout: 8_000 })
    .toBe(true);

  // The finished game, its uploaded asset, and its source all survive a
  // reload of the shared sandbox.
  await page.reload();
  await expect(page.locator(`[data-jgz-project="${name}"]`)).toBeVisible();
  await expect(
    page.locator('[data-jgz-asset="images/player.svg"]'),
  ).toBeVisible();
  const editor = page.locator("[data-jgz-editor-mount] .cm-content");
  await expect(editor).toContainText("Comet Catcher");
  await expect(editor).toContainText("WIN_SCORE");

  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
