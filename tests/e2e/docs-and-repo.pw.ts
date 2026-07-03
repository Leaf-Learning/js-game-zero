import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { exampleManifest } from "../../examples/manifest";

type ExampleStatus = {
  slug: string;
  ready: boolean;
  nonblank: boolean;
  interactions?: {
    keyboard: boolean;
    mouse: boolean;
  };
  storage?: Record<string, unknown>;
  errors: string[];
  diagnostics: unknown[];
};

const projectName = "comet_catcher_docs_check";

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

/**
 * Extracts the final, complete "win, lose, and play again" game from
 * docs/tutorial.md — the culmination of the tutorial's step-by-step build —
 * so this test proves the exact code a learner ends up with actually runs
 * cleanly in the real sandbox, not just that it compiles.
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

async function waitForExampleStatus(
  page: Page,
  slug: string,
): Promise<ExampleStatus> {
  await page.waitForFunction(
    (expectedSlug) => {
      const status = (
        window as typeof window & { __jgzExampleStatus?: ExampleStatus }
      ).__jgzExampleStatus;
      return status?.slug === expectedSlug && status.ready;
    },
    slug,
    { timeout: 8_000 },
  );
  return page.evaluate(
    () =>
      (window as typeof window & { __jgzExampleStatus?: ExampleStatus })
        .__jgzExampleStatus as ExampleStatus,
  );
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

function slugFromRoute(route: string): string {
  const slug = route.split("/").at(-1);
  if (!slug) throw new Error(`Route has no slug: ${route}`);
  return slug;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (!address || typeof address === "string") {
    throw new Error("Could not allocate a free port.");
  }
  return address.port;
}

async function startSandboxServer(
  projectsRoot: string,
  port: number,
): Promise<ChildProcess> {
  const server = spawn(
    "bun",
    [
      "apps/sandbox/src/server.ts",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--projects-root",
      projectsRoot,
    ],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stderr = "";
  server.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Sandbox server exited early: ${stderr}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return server;
    } catch {
      // Server is still starting.
    }
    await delay(100);
  }

  server.kill();
  throw new Error(`Sandbox server did not start: ${stderr}`);
}

async function stopSandboxServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([
    new Promise<void>((resolve) => server.once("exit", () => resolve())),
    delay(1_000),
  ]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("shipped examples launch from the live manifest", async ({ page }) => {
  // Routes come from examples/manifest.ts itself (the source of truth),
  // not from documentation prose, so this test always exercises whatever
  // examples actually ship rather than a list that can silently drift.
  const slugs = exampleManifest.map((example) => example.slug);
  expect(slugs.length).toBeGreaterThan(0);

  for (const slug of slugs) {
    const { errors, pageErrors } = collectPageErrors(page);
    await page.goto(`/examples/${slug}`);
    const status = await waitForExampleStatus(page, slug);
    expect(status.nonblank).toBe(true);
    expect(status.errors).toEqual([]);
    expect(status.diagnostics).toEqual([]);

    if (slug === "storage-save") {
      await page.waitForFunction(() => {
        const current = (
          window as typeof window & { __jgzExampleStatus?: ExampleStatus }
        ).__jgzExampleStatus;
        const score = current?.storage?.score;
        return typeof score === "number" && score > 0;
      });
    }
    if (slug === "sound-tone") {
      const canvas = page.locator("[data-jgz-example-canvas]");
      await canvas.click({ position: { x: 160, y: 82 } });
      await page.waitForFunction(
        () =>
          (window as typeof window & { __jgzExampleStatus?: ExampleStatus })
            .__jgzExampleStatus?.interactions?.mouse === true,
      );
    }

    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("every shipped example is documented", async () => {
  const examplesDoc = await readFile("docs/examples.md", "utf8");
  for (const example of exampleManifest) {
    expect(examplesDoc).toContain(`\`/examples/${example.slug}\``);
  }
});

test("browser runtime clears to opaque black", async ({ page }) => {
  await page.goto("/examples");
  const pixel = await page.evaluate(async () => {
    const runtimeUrl = "/runtime/core.js";
    const runtime = (await import(runtimeUrl)) as {
      Screen: new (canvas: HTMLCanvasElement) => {
        fill(color: string): void;
        clear(): void;
      };
    };
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    document.body.append(canvas);
    const screen = new runtime.Screen(canvas);
    screen.fill("#ff00ff");
    screen.clear();
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    return [...context.getImageData(0, 0, 1, 1).data] as number[];
  });

  expect(pixel).toEqual([0, 0, 0, 255]);
});

test("the tutorial's finished game runs from a clean sandbox project", async ({
  page,
}, testInfo) => {
  const { errors, pageErrors } = collectPageErrors(page);
  const source = await finalTutorialGameSource();
  const projectsRoot = testInfo.outputPath("projects-root");
  await rm(projectsRoot, { recursive: true, force: true });
  await mkdir(projectsRoot, { recursive: true });
  const port = await freePort();
  const server = await startSandboxServer(projectsRoot, port);

  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page).toHaveTitle("js-game-zero Sandbox");

    await page.locator("[data-jgz-new-project]").click();
    await page.locator("[data-jgz-choose-blank]").click();
    await page.locator("[data-jgz-dialog-input]").fill(projectName);
    await page.locator("[data-jgz-dialog-submit]").click();
    await expect(
      page.locator(`[data-jgz-project="${projectName}"]`),
    ).toHaveAttribute("aria-pressed", "true");

    const editor = page.locator("[data-jgz-editor-mount] .cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await editor.fill(source);
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
    await expect(page.locator("body")).toHaveAttribute(
      "data-jgz-dirty",
      "false",
    );
    await expect(page.locator("[data-jgz-diagnostics]")).toHaveAttribute(
      "data-count",
      "0",
    );
    const previewCanvas = page
      .frameLocator("[data-jgz-preview]")
      .locator("[data-jgz-preview-canvas]");
    await expect(previewCanvas).toBeVisible();
    await expect
      .poll(() => visibleCanvasIsNonblank(previewCanvas), { timeout: 8_000 })
      .toBe(true);

    await page.reload();
    await expect(
      page.locator(`[data-jgz-project="${projectName}"]`),
    ).toBeVisible();
    await expect(
      page.locator('[data-jgz-asset="images/player.svg"]'),
    ).toBeVisible();
    await expect(editor).toContainText("Comet Catcher");
    await expect(editor).toContainText("WIN_SCORE");

    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await stopSandboxServer(server);
  }
});
