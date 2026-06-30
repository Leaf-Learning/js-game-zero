import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

type ExampleStatus = {
  slug: string;
  ready: boolean;
  nonblank: boolean;
  storage?: Record<string, unknown>;
  errors: string[];
  diagnostics: unknown[];
};

const expectedTutorialRoutes = [
  "/examples/drawing-basics",
  "/examples/actor-movement",
  "/examples/sound-tone",
  "/examples/storage-save",
  "/examples/sandbox-starter",
];

const projectName = "phase_seven_docs";

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

async function tutorialRoutesFromDocs(): Promise<string[]> {
  const tutorials = await readFile("docs/tutorials.md", "utf8");
  return [...tutorials.matchAll(/Example route: `([^`]+)`/g)].map(
    (match) => match[1] ?? "",
  );
}

async function sandboxSnippetFromDocs(): Promise<string> {
  const tutorials = await readFile("docs/tutorials.md", "utf8");
  const match =
    /## Tutorial 5: Sandbox Workflow[\s\S]*?```js\n([\s\S]*?)```/.exec(
      tutorials,
    );
  if (!match?.[1]) throw new Error("Missing sandbox workflow snippet.");
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

test("phase 7 tutorial-backed examples launch from docs routes", async ({
  page,
}) => {
  const routes = await tutorialRoutesFromDocs();
  expect(routes).toEqual(expectedTutorialRoutes);

  for (const route of routes) {
    const { errors, pageErrors } = collectPageErrors(page);
    await page.goto(route);
    const slug = slugFromRoute(route);
    const status = await waitForExampleStatus(page, slug);
    expect(status.nonblank).toBe(true);
    expect(status.errors).toEqual([]);
    expect(status.diagnostics).toEqual([]);

    if (slug === "storage-save") {
      expect(status.storage?.drawn).toBe(true);
      expect(numeric(status.storage?.score)).toBeGreaterThan(0);
    }

    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  }
});

test("phase 7 sandbox guide workflow runs from a clean project", async ({
  page,
}, testInfo) => {
  const { errors, pageErrors } = collectPageErrors(page);
  const source = await sandboxSnippetFromDocs();
  const projectsRoot = testInfo.outputPath("projects-root");
  await rm(projectsRoot, { recursive: true, force: true });
  await mkdir(projectsRoot, { recursive: true });
  const port = await freePort();
  const server = await startSandboxServer(projectsRoot, port);

  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page).toHaveTitle("js-game-zero Sandbox");
    await page.locator("[data-jgz-project-name]").fill(projectName);
    await page.locator("[data-jgz-create]").click();
    await expect(
      page.locator(`[data-jgz-project="${projectName}"]`),
    ).toHaveAttribute("aria-pressed", "true");

    const editor = page.locator("[data-jgz-editor]");
    await editor.fill(source);

    const assetPath = testInfo.outputPath("player.svg");
    await writeFile(
      assetPath,
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="12" fill="#22c55e"/></svg>`,
      "utf8",
    );
    await page.locator("[data-jgz-asset-file]").setInputFiles(assetPath);
    await page.locator("[data-jgz-upload]").click();
    await expect(
      page.locator('[data-jgz-file="images/player.svg"]'),
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
    await expect(page.locator('[data-jgz-file="main.js"]')).toBeVisible();
    await expect(
      page.locator('[data-jgz-file="images/player.svg"]'),
    ).toBeVisible();
    await expect(editor).toHaveValue(/Sandbox Starter/);

    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await stopSandboxServer(server);
  }
});
