import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { e2eProjectsRoot as projectsRoot } from "./fixtures/e2e-projects-root";
import { exampleManifest } from "../../examples/manifest";
import {
  canvasIsNonblank,
  collectPageErrors,
} from "./fixtures/harness-helpers";
import {
  cloneExampleProject,
  createBlankProject,
  expectCurrentProject,
  openAssetPanel,
  submitDialogName,
  switchProject,
  waitForSandbox,
} from "./fixtures/sandbox-ui";

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

test("theme follows the system, toggles without losing editor state, and persists", async ({
  page,
}) => {
  const name = uniqueName("theme");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  const toggle = page.locator("[data-jgz-theme-toggle]");
  await expect(toggle).toHaveAttribute("aria-label", "Switch to light mode");
  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      ),
    )
    .toBe("dark");
  await createBlankProject(page, name);

  const content = page.locator("[data-jgz-editor-mount] .cm-content");
  const editor = page.locator("[data-jgz-editor-mount] .cm-editor");
  const darkEditorClasses = await editor.getAttribute("class");
  await content.click();
  await page.keyboard.press("ControlOrMeta+A");
  await toggle.click();

  await expect(toggle).toHaveAttribute("aria-label", "Switch to dark mode");
  await expect(page.locator("html")).toHaveAttribute("data-jgz-theme", "light");
  // CodeMirror marks its light and dark facets with generated class names.
  // A compartment reconfiguration must therefore change the actual editor
  // theme classes, not only the surrounding sandbox palette.
  await expect
    .poll(() => editor.getAttribute("class"))
    .not.toBe(darkEditorClasses);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("jgz-sandbox:theme")))
    .toBe("light");

  // Reconfiguring CodeMirror must preserve its selection as well as the
  // document. Refocusing and typing replaces the selection made above.
  await content.focus();
  await page.keyboard.type("THEME_STATE_PRESERVED");
  await expect(content).toHaveText("THEME_STATE_PRESERVED");

  // The explicit light choice wins over the still-dark system preference.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-jgz-theme", "light");
  await expect(toggle).toHaveAttribute("aria-label", "Switch to dark mode");
  await expect(content).toContainText("THEME_STATE_PRESERVED");
});

test("documentation opens in a separate tab without disturbing the editor or preview", async ({
  page,
}) => {
  const name = uniqueName("docs");
  await page.goto("/");
  await createBlankProject(page, name);
  await setEditorContent(
    page,
    'function draw() { screen.fill("#345678"); }\n// DOCS_STATE_MARKER',
  );
  await expect(page.locator("[data-jgz-save-status]")).toHaveText("Saved", {
    timeout: 4_000,
  });
  await page.locator("[data-jgz-play]").click();
  await expect(page.locator("[data-jgz-preview-status]")).toHaveText("Running");

  const docsButton = page.locator("[data-jgz-open-docs]");
  await expect(docsButton).toHaveAttribute("target", "_blank");
  await expect(docsButton).toHaveAttribute("rel", "noopener");
  const [docsPage] = await Promise.all([
    page.waitForEvent("popup"),
    docsButton.click(),
  ]);
  // The docs open at their first page, which the address bar then names.
  await expect(docsPage).toHaveURL(/\/docs(\?page=[\w/-]+)?$/);
  await expect
    .poll(() => docsPage.evaluate(() => window.opener === null))
    .toBe(true);

  const docsShell = docsPage.locator("[data-jgz-docs-page]");
  const content = docsPage.locator("[data-jgz-docs-content]");
  await expect(docsShell).toBeVisible();
  await expect(
    content.getByRole("heading", { name: "Getting Started" }),
  ).toBeVisible();

  await expect(
    docsPage.locator('[data-jgz-doc="reference/actor"]'),
  ).toBeVisible();
  const examplesDocButton = docsPage.locator('[data-jgz-doc="examples"]');
  await examplesDocButton.click();
  await expect(
    content.getByRole("heading", { name: "Examples", exact: true }),
  ).toBeVisible();
  await expect(examplesDocButton).toBeFocused();

  // The existing credit link uses README.md#credits. The documentation browser
  // keeps that legacy anchor working even though the rendered heading ID is
  // derived from the full "License and credits" text.
  const readmeLink = content.getByRole("link", { name: "README" });
  await readmeLink.focus();
  await docsPage.keyboard.press("Enter");
  const creditsHeading = content.getByRole("heading", {
    name: "License and credits",
  });
  await expect(creditsHeading).toBeVisible();
  await expect(creditsHeading).toBeFocused();

  await examplesDocButton.click();
  await expect(
    content.getByRole("heading", { name: "Examples", exact: true }),
  ).toBeVisible();

  // A relative documentation link stays in the documentation tab and lands
  // on its heading anchor rather than navigating the sandbox page.
  const sandboxGuideLink = content.getByRole("link", {
    name: /docs\/sandbox\.md#example-gallery/,
  });
  await sandboxGuideLink.focus();
  await docsPage.keyboard.press("Enter");
  const exampleGalleryHeading = content.getByRole("heading", {
    name: "Example gallery",
  });
  await expect(exampleGalleryHeading).toBeVisible();
  await expect(exampleGalleryHeading).toBeFocused();
  await expect
    .poll(() =>
      docsShell.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await expect
    .poll(async () => {
      const headingBox = await exampleGalleryHeading.boundingBox();
      const contentBox = await content.boundingBox();
      return headingBox && contentBox
        ? Math.abs(headingBox.y - contentBox.y)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(90);

  const screenshot = content.locator('img[alt*="sandbox running a game"]');
  await expect(screenshot).toBeVisible();
  await expect(screenshot).toHaveAttribute(
    "src",
    "/docs/media/main-view-running-game.png",
  );

  await docsPage.locator('[data-jgz-doc="getting-started"]').click();
  await content.getByRole("link", { name: "docs/reference/" }).click();
  await expect(
    content.getByRole("heading", { name: "Hooks And Input Constants" }),
  ).toBeVisible();
  await docsPage.locator('[data-jgz-doc="getting-started"]').click();
  const external = content.getByRole("link", { name: "Bun" }).first();
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", "noopener noreferrer");

  // The original tab remains fully interactive while the reference stays
  // open. Editing and autosaving there must not stop its running preview.
  await page.bringToFront();
  await setEditorContent(
    page,
    'function draw() { screen.fill("#345678"); }\n// EDITED_WITH_DOCS_OPEN',
  );
  await expect(page.locator("[data-jgz-save-status]")).toHaveText("Saved", {
    timeout: 4_000,
  });
  await expect(page.locator("[data-jgz-preview-status]")).toHaveText("Running");
  await expect(
    page.locator("[data-jgz-editor-mount] .cm-content"),
  ).toContainText("EDITED_WITH_DOCS_OPEN");
  await expectCurrentProject(page, name);
  // The docs tab's address names the page it was left on.
  await expect(docsPage).toHaveURL(/\/docs\?page=getting-started$/);
});

test("documentation load failures offer a working retry", async ({
  page,
  context,
}) => {
  let failManifest = true;
  await context.route("**/api/docs", async (route) => {
    if (failManifest) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Temporary documentation failure.",
          code: "internal_error",
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  const [docsPage] = await Promise.all([
    page.waitForEvent("popup"),
    page.locator("[data-jgz-open-docs]").click(),
  ]);
  const content = docsPage.locator("[data-jgz-docs-content]");
  await expect(
    content.getByRole("heading", {
      name: "Documentation couldn't be loaded",
    }),
  ).toBeVisible();
  const retry = content.getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible();

  failManifest = false;
  await retry.click();
  await expect(
    content.getByRole("heading", { name: "Getting Started" }),
  ).toBeVisible();
});

test("learner preview origin cannot mutate editor projects", async ({
  page,
}) => {
  const name = uniqueName("isolated");
  await page.goto("/");
  await createBlankProject(page, name);
  await page.locator("[data-jgz-play]").click();
  await expect(previewCanvas(page)).toBeVisible();
  const editorOrigin = new URL(page.url()).origin;

  await page
    .frameLocator("[data-jgz-preview]")
    .locator("body")
    .evaluate(
      async (_body, { editorOrigin, project }) => {
        const send = (path: string, method: string, body?: string) =>
          fetch(`${editorOrigin}${path}`, {
            method,
            mode: "no-cors",
            headers: { "content-type": "text/plain" },
            ...(body === undefined ? {} : { body }),
          }).catch(() => undefined);
        await Promise.all([
          send(
            "/api/projects",
            "POST",
            JSON.stringify({ name: "created_by_learner" }),
          ),
          send(
            `/api/projects/${project}/rename`,
            "POST",
            JSON.stringify({ name: "renamed_by_learner" }),
          ),
          send(
            `/api/projects/${project}/files/main.js`,
            "PUT",
            JSON.stringify({
              content: "MUTATED",
              baseVersion: 0,
              revision: 99,
              sessionId: "learner-preview",
            }),
          ),
          send(`/api/projects/${project}`, "DELETE"),
        ]);
      },
      { editorOrigin, project: name },
    );

  const projects = await page.evaluate(async () =>
    fetch("/api/projects").then((response) => response.json()),
  );
  expect(projects).toMatchObject({
    projects: expect.arrayContaining([expect.objectContaining({ name })]),
  });
  expect(JSON.stringify(projects)).not.toContain("created_by_learner");
  expect(JSON.stringify(projects)).not.toContain("renamed_by_learner");
  expect(
    await readFile(resolve(projectsRoot, name, "main.js"), "utf8"),
  ).not.toBe("MUTATED");
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
  await switchProject(page, projectA);
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
    await switchProject(page, projectB, { delay: 80 });
    await switchProject(page, projectA, { delay: 80 });
  }
  await switchProject(page, projectB, { delay: 80 });

  await expectCurrentProject(page, projectB);
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
  await expectCurrentProject(page, name);
  await expect(
    page.locator("[data-jgz-editor-mount] .cm-content"),
  ).toContainText(marker);
});

test("unload save cannot let an older in-flight write overwrite newer work", async ({
  page,
}) => {
  const name = uniqueName("unload_order");
  await page.goto("/");
  await createBlankProject(page, name);

  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolveBlocked) => {
    releaseFirst = resolveBlocked;
  });
  let markFirstSeen!: () => void;
  const firstSeen = new Promise<void>((resolveSeen) => {
    markFirstSeen = resolveSeen;
  });
  const revisions: number[] = [];
  let firstRevision: number | null = null;
  await page.route(`**/api/projects/${name}/files/main.js`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const body = route.request().postDataJSON() as { revision: number };
    revisions.push(body.revision);
    if (firstRevision === null) {
      firstRevision = body.revision;
      markFirstSeen();
      await firstBlocked;
    }
    await route.continue();
  });

  await setEditorContent(page, "REVISION_ONE");
  await page.locator("[data-jgz-save]").click();
  await firstSeen;
  await setEditorContent(page, "REVISION_TWO");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
  await expect
    .poll(() => revisions.some((revision) => revision > (firstRevision ?? 0)))
    .toBe(true);

  releaseFirst();
  await expect(page.locator("[data-jgz-save-status]")).toHaveText("Saved", {
    timeout: 8_000,
  });
  await expect
    .poll(() => readFile(resolve(projectsRoot, name, "main.js"), "utf8"), {
      timeout: 8_000,
    })
    .toBe("REVISION_TWO");
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
  // In the learner's terms, not the runtime wrapper's "Unexpected token ')'".
  await expect(page.locator("[data-jgz-diagnostics] li")).toContainText(
    "Something isn't closed",
  );
  await expect(page.locator("[data-jgz-preview-status]")).toHaveText(
    "Needs a fix",
  );
});

test("undo right after opening a game leaves its code alone", async ({
  page,
}) => {
  const name = uniqueName("undo");
  await page.goto("/");
  await cloneExampleProject(page, "snake", name);
  const code = page.locator("[data-jgz-editor-mount] .cm-content");
  await expect(code).toContainText("TITLE");
  const opened = await code.textContent();

  await code.click();
  await page.keyboard.press("ControlOrMeta+Z");
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(code).toHaveText(opened!);
  await expect(page.locator("[data-jgz-save-status]")).toHaveText("Saved");
});

test("with a problem showing, a click lands on the line clicked, and its line number follows edits", async ({
  page,
}) => {
  const name = uniqueName("lensclick");
  await page.goto("/");
  await createBlankProject(page, name);
  await setEditorContent(
    page,
    'function draw() {\n  screen.fil("navy");\n}\nlet a = 1;\nlet b = 2;\n',
  );
  await page.locator("[data-jgz-play]").click();
  const lens = page.locator("[data-jgz-problem-lens]");
  await expect(lens).toBeVisible({ timeout: 8_000 });

  // Below the box: the click goes to the line under the pointer.
  await page.locator(".cm-line", { hasText: "let a = 1;" }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" // here");
  await expect(page.locator(".cm-line", { hasText: "// here" })).toHaveText(
    "let a = 1; // here",
  );

  // A line added above moves the problem, and every "line N" with it.
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.type("// a note\n");
  await expect(page.locator("[data-jgz-stage-show-line]")).toHaveText(
    "Show me line 3",
  );
  await expect(page.locator("[data-jgz-problem-line]")).toHaveText(/3/);
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

for (const example of exampleManifest.filter(
  (entry) => entry.mode === "global",
)) {
  test(`gallery clones ${example.slug} using the example's own name`, async ({
    page,
  }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await page.goto("/");
    await cloneExampleProject(page, example.slug, example.slug);
    await page.locator("[data-jgz-play]").click();
    await expect
      .poll(() => canvasIsNonblank(previewCanvas(page)), { timeout: 8_000 })
      .toBe(true);
    await expect(page.locator("[data-jgz-diagnostics]")).toHaveAttribute(
      "data-count",
      "0",
    );
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

test("cloning an asset-heavy game copies its assets and runs", async ({
  page,
}) => {
  const name = uniqueName("flappy");
  await page.goto("/");
  await cloneExampleProject(page, "tappy-plane", name);

  await expect(
    page.locator("[data-jgz-editor-mount] .cm-content"),
  ).toContainText("Tappy Plane");

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
    await openAssetPanel(
      page,
      asset.startsWith("images/") ? "images" : "sounds",
    );
    await expect(page.locator(`[data-jgz-asset="${asset}"]`)).toBeVisible();
    const copied = await readFile(resolve(projectsRoot, name, asset));
    const original = await readFile(
      resolve(process.cwd(), "examples/tappy-plane/assets", asset),
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
  await expectCurrentProject(page, exampleName);
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

  for (const control of [
    page.locator("[data-jgz-open-docs]"),
    page.locator("[data-jgz-open-examples]"),
    page.locator("[data-jgz-theme-toggle]"),
  ]) {
    await expect(control).toBeVisible();
    const controlBox = await control.boundingBox();
    expect(controlBox).not.toBeNull();
    if (controlBox) {
      expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(1024);
    }
  }

  const [docsPage] = await Promise.all([
    page.waitForEvent("popup"),
    page.locator("[data-jgz-open-docs]").click(),
  ]);
  await docsPage.setViewportSize({ width: 1024, height: 700 });
  const docsShell = docsPage.locator("[data-jgz-docs-page]");
  await expect(docsShell).toBeVisible();
  const docsBox = await docsShell.boundingBox();
  expect(docsBox).not.toBeNull();
  if (docsBox) {
    expect(docsBox.x).toBeCloseTo(0, 0);
    expect(docsBox.y).toBeCloseTo(0, 0);
    expect(docsBox.width).toBeCloseTo(1024, 0);
    expect(docsBox.height).toBeCloseTo(700, 0);
  }

  await docsPage.setViewportSize({ width: 760, height: 560 });
  const compactDocsBox = await docsShell.boundingBox();
  expect(compactDocsBox).not.toBeNull();
  if (compactDocsBox) {
    expect(compactDocsBox.x).toBeCloseTo(0, 0);
    expect(compactDocsBox.y).toBeCloseTo(0, 0);
    expect(compactDocsBox.width).toBeCloseTo(760, 0);
    expect(compactDocsBox.height).toBeCloseTo(560, 0);
  }
  await expect(docsPage.locator("[data-jgz-docs-navigation]")).toBeVisible();
  await expect(docsPage.locator("[data-jgz-docs-content]")).toBeVisible();
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
  // Tall enough that the game's width, not its height, sets its size, so a
  // wider panel shows a bigger game.
  await page.setViewportSize({ width: 1280, height: 960 });
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

  // Sizes survive a reload. The workspace appears once the games load.
  await page.reload();
  await waitForSandbox(page);
  expect((await pane.boundingBox())?.width ?? 0).toBeCloseTo(paneAfter, 0);
  expect((await consolePanel.boundingBox())?.height ?? 0).toBeCloseTo(
    consoleAfter,
    0,
  );
});

/** Clicks the scaled preview's center, which the game must see as ~(400, 240). */
async function clickPreviewCenter(page: Page, density: number): Promise<void> {
  const name = uniqueName("mousemap");
  await page.goto("/");
  await createBlankProject(page, name);
  await setEditorContent(
    page,
    [
      "WIDTH = 800;",
      "HEIGHT = 480;",
      'function draw() { screen.fill("purple"); }',
      "function onMouseDown(pos) {",
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
  // The canvas holds the game's pixels at the screen's density.
  expect(
    await canvas.evaluate((node) => [
      (node as HTMLCanvasElement).width,
      (node as HTMLCanvasElement).height,
    ]),
  ).toEqual([800 * density, 480 * density]);

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
  expect(box.width / box.height).toBeCloseTo(800 / 480, 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator(".console-line").first()).toHaveText(
    /^POS (399|400|401),(239|240|241)$/,
  );
}

test("mouse positions map to game coordinates on the scaled preview", async ({
  page,
}) => {
  await clickPreviewCenter(page, 1);
});

test.describe("on a 2x screen", () => {
  test.use({ deviceScaleFactor: 2 });

  test("the preview draws at density 2 and maps the mouse to game coordinates", async ({
    page,
  }) => {
    await clickPreviewCenter(page, 2);
  });
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
  await expectCurrentProject(page, name);
  await expect(
    page.locator('[data-jgz-asset="images/player.svg"]'),
  ).toBeVisible();
  const editor = page.locator("[data-jgz-editor-mount] .cm-content");
  await expect(editor).toContainText("Comet Catcher");
  await expect(editor).toContainText("WIN_SCORE");

  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
