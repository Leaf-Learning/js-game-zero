import { parseArgs } from "node:util";
import { join, normalize } from "node:path";
import {
  exampleManifest,
  getExample,
  type ExampleManifestEntry,
} from "../../../examples/manifest";
import {
  cachedBrowserBuild,
  contentType,
  createSandboxHandler,
  html,
  REPO_ROOT,
  type SandboxHandlerOptions,
} from "./sandbox";

function examplesIndexPage(): string {
  const links = exampleManifest
    .map(
      (example) =>
        `<li><a href="/examples/${example.slug}" data-jgz-example-link="${example.slug}">${example.title}</a></li>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>js-game-zero Examples</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #0b1120; color: white; }
      main { width: min(720px, calc(100vw - 32px)); margin: 48px auto; }
      h1 { font-size: 32px; margin: 0 0 24px; }
      ul { display: grid; gap: 10px; padding: 0; list-style: none; }
      a { display: block; color: #e0f2fe; border: 1px solid #38bdf8; border-radius: 6px; padding: 12px 14px; text-decoration: none; background: #111827; }
      a:focus, a:hover { outline: 2px solid #facc15; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <main>
      <h1>js-game-zero examples</h1>
      <ul>${links}</ul>
    </main>
  </body>
</html>`;
}

/**
 * Harness-only status/listener setup shared by every `/examples/<slug>`
 * page, for both "global" (zero-boilerplate) and "import" mode examples.
 * This is test/debug infrastructure the *server* injects around an
 * example; none of it lives inside the example's own teaching code, and
 * none of the example's game logic needs to cooperate with it (frames,
 * canvas contents, and input are observed independently).
 */
function harnessPrelude(example: ExampleManifestEntry): string {
  return `const status = {
  slug: ${JSON.stringify(example.slug)},
  mode: ${JSON.stringify(example.mode)},
  ready: false,
  nonblank: false,
  frames: 0,
  interactions: { keyboard: false, mouse: false },
  storage: {},
  errors: [],
  diagnostics: []
};
window.__jgzExampleStatus = status;

const canvas = document.querySelector("[data-jgz-example-canvas]");
const context = canvas.getContext("2d", { willReadFrequently: true });

window.addEventListener("error", (event) => {
  status.errors.push(String(event.error?.message ?? event.message));
});
window.addEventListener("unhandledrejection", (event) => {
  status.errors.push(String(event.reason?.message ?? event.reason));
});
window.addEventListener("keydown", () => {
  status.interactions.keyboard = true;
});
canvas.addEventListener("mousedown", () => {
  status.interactions.mouse = true;
});

function canvasIsNonblank() {
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 0) return true;
  }
  return false;
}
`;
}

/** Polls frame count / canvas contents / (optionally) live storage every
 * animation frame. `readsHandle` is only true for global-mode examples,
 * where the harness itself called `run()` and holds the resulting handle. */
function harnessTickLoop(readsHandle: boolean): string {
  return `function tick() {
  status.frames += 1;
  status.nonblank = canvasIsNonblank();
  ${
    readsHandle
      ? `status.storage = Object.fromEntries(
    handle.storage.keys().map((key) => [key, handle.storage.get(key)])
  );
  `
      : ""
  }status.ready = status.nonblank && status.diagnostics.length === 0;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
`;
}

function globalModeHarnessScript(example: ExampleManifestEntry): string {
  return `<script type="module">
import { ImageSurface, run } from "/runtime/core.js";

${harnessPrelude(example)}
const declaredAssets = ${JSON.stringify(example.assets)};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("Failed to preload " + url)), { once: true });
    image.src = url;
  });
}

async function preloadDeclaredAssets() {
  const preloaded = { images: {} };
  for (const asset of declaredAssets) {
    if (!asset.startsWith("images/")) continue;
    const name = asset.slice("images/".length);
    const image = await loadImage("/example-assets/${example.slug}/" + asset);
    preloaded.images[name] = new ImageSurface(image);
  }
  return preloaded;
}

const source = await fetch("/examples/${example.slug}/main.js").then((response) => {
  if (!response.ok) throw new Error("Failed to load example source");
  return response.text();
});
const preloadedAssets = await preloadDeclaredAssets();

const handle = run(source, {
  canvas,
  projectId: ${JSON.stringify(example.slug)},
  assetBaseUrl: "/example-assets",
  preload: ${JSON.stringify(example.assets)},
  preloadedAssets,
  diagnostics(diagnostic) {
    status.diagnostics.push(diagnostic);
  }
});

// A read-only handle for e2e/debug tooling only: the example's own game
// code never sees or touches this. Lets tests simulate state (e.g.
// writing to storage to check persistence) without the taught example
// publishing any test-only globals itself.
window.__jgzExampleHandle = handle;

${harnessTickLoop(true)}</script>`;
}

function importModeHarnessScript(example: ExampleManifestEntry): string {
  return `<script type="module">
${harnessPrelude(example)}
${harnessTickLoop(false)}</script>
<script type="module" src="/examples/${example.slug}/main.js"></script>`;
}

function examplePage(example: ExampleManifestEntry): string {
  const loaderScript =
    example.mode === "import"
      ? importModeHarnessScript(example)
      : globalModeHarnessScript(example);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>js-game-zero Example: ${example.title}</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #101417; color: white; }
      main { min-height: 100vh; display: grid; place-items: center; align-content: center; gap: 16px; }
      /* Shown 1:1 (no CSS scaling) so mouse events land exactly on game
         coordinates; capped to the viewport for small windows. */
      canvas { width: auto; max-width: calc(100vw - 32px); height: auto; border: 1px solid #94a3b8; background: #0f172a; outline: 2px solid transparent; }
      canvas:focus { outline-color: #facc15; }
      a { color: #bae6fd; }
    </style>
  </head>
  <body>
    <main>
      <h1>${example.title}</h1>
      <canvas data-jgz-example-canvas width="320" height="180" tabindex="0"></canvas>
      <a href="/examples">Examples</a>
    </main>
    ${loaderScript}
  </body>
</html>`;
}

async function coreRuntimeBundle(): Promise<Response> {
  try {
    const build = await cachedBrowserBuild(
      "runtime-core",
      join(REPO_ROOT, "packages/core/src/index.ts"),
    );
    return new Response(build.text, {
      headers: { "content-type": build.contentType },
    });
  } catch {
    return new Response("Failed to build core runtime", { status: 500 });
  }
}

/** Routes that ship as part of the real product: the sandbox handler
 * (checked before this by the caller), the runnable examples, and the
 * runtime bundles they load. Always active, regardless of --test-fixtures. */
async function productRouteResponse(url: URL): Promise<Response | null> {
  if (url.pathname === "/runtime/core.js") return coreRuntimeBundle();
  if (url.pathname === "/examples") {
    return html(examplesIndexPage());
  }
  if (url.pathname.startsWith("/examples/")) {
    const response = await exampleRouteResponse(url.pathname);
    if (response) return response;
  }
  if (url.pathname.startsWith("/example-assets/")) {
    const response = await exampleOwnAssetResponse(url.pathname);
    if (response) return response;
  }
  return null;
}

type TestFixtureRoutesModule =
  typeof import("../../../tests/e2e/fixtures/sandbox-routes");
let testFixtureRoutesModule: Promise<TestFixtureRoutesModule> | null = null;

function loadTestFixtureRoutes(): Promise<TestFixtureRoutesModule> {
  testFixtureRoutesModule ??=
    import("../../../tests/e2e/fixtures/sandbox-routes");
  return testFixtureRoutesModule;
}

/** Test seam proving production requests do not evaluate the e2e route
 * module. The module itself remains owned under tests/e2e/fixtures. */
export function testFixtureRoutesLoaded(): boolean {
  return testFixtureRoutesModule !== null;
}

async function testFixtureHandler(
  request: Request,
  testFixtures: boolean,
): Promise<Response> {
  const url = new URL(request.url);
  const productResponse = await productRouteResponse(url);
  if (productResponse) return productResponse;
  if (testFixtures) {
    const { testFixtureRouteResponse } = await loadTestFixtureRoutes();
    const fixtureResponse = await testFixtureRouteResponse(url);
    if (fixtureResponse) return fixtureResponse;
  }
  return new Response("Not found", { status: 404 });
}

export type SandboxServerHandlerOptions = SandboxHandlerOptions & {
  /** Enables dynamically loaded `/fixtures/*` e2e routes. Off by default so
   * the product server never evaluates or serves test-only route code. */
  readonly testFixtures?: boolean;
};

export function createSandboxServerHandler(
  options: SandboxServerHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const { testFixtures = false, ...sandboxOptions } = options;
  const sandboxHandler = createSandboxHandler(sandboxOptions);
  return async function sandboxServerHandler(
    request: Request,
  ): Promise<Response> {
    const sandboxResponse = await sandboxHandler(request);
    if (sandboxResponse) return sandboxResponse;
    if (sandboxOptions.access === "preview") {
      return new Response("Not found", { status: 404 });
    }
    return testFixtureHandler(request, testFixtures);
  };
}

export function createSandboxPreviewServerHandler(
  options: Omit<SandboxHandlerOptions, "access" | "previewOrigin"> & {
    readonly parentOrigin: string;
  },
): (request: Request) => Promise<Response> {
  const sandboxHandler = createSandboxHandler({
    ...options,
    access: "preview",
  });
  return async function sandboxPreviewServerHandler(
    request: Request,
  ): Promise<Response> {
    const response = await sandboxHandler(request);
    if (response) return response;
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/runtime/core.js") {
      return coreRuntimeBundle();
    }
    return new Response("Not found", { status: 404 });
  };
}

async function exampleRouteResponse(
  pathname: string,
): Promise<Response | null> {
  const match = /^\/examples\/([^/]+)(?:\/main\.js)?$/.exec(pathname);
  if (!match) return null;
  const slug = match[1];
  if (!slug) return null;
  const example = getExample(slug);
  if (!example) return new Response("Not found", { status: 404 });
  if (slug !== example.slug) {
    return new Response(null, {
      status: 308,
      headers: {
        location: `/examples/${example.slug}${pathname.endsWith("/main.js") ? "/main.js" : ""}`,
      },
    });
  }
  if (pathname.endsWith("/main.js")) return exampleEntryResponse(example);
  return html(examplePage(example));
}

async function exampleEntryResponse(
  example: ExampleManifestEntry,
): Promise<Response> {
  const entryPath = new URL(`../../../${example.entryPoint}`, import.meta.url)
    .pathname;
  if (example.mode === "import") {
    try {
      const build = await cachedBrowserBuild(
        `example-${example.slug}`,
        entryPath,
      );
      return new Response(build.text, {
        headers: { "content-type": build.contentType },
      });
    } catch {
      return new Response("Failed to build example", { status: 500 });
    }
  }
  const file = Bun.file(entryPath);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
}

async function exampleAssetResponse(
  pathname: string,
  prefix: string,
  rootRelativeUrl: string,
): Promise<Response> {
  const relative = pathname.replace(prefix, "");
  if (!/^(images|sounds|music|fonts)\/[a-z0-9_/.]+$/.test(relative)) {
    return new Response("Not found", { status: 404 });
  }
  if (relative.includes("..") || relative.includes("//")) {
    return new Response("Not found", { status: 404 });
  }
  const root = new URL(rootRelativeUrl, import.meta.url).pathname;
  const filePath = normalize(join(root, relative));
  if (!filePath.startsWith(root))
    return new Response("Not found", { status: 404 });
  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, {
    headers: { "content-type": contentType(filePath) },
  });
}

const EXAMPLE_ASSET_ROUTE = /^\/example-assets\/([a-z][a-z0-9-]*)\//;

/**
 * Built-in assets use a separate namespace from `/assets/<project>/...`,
 * so user projects can share an example's name and customize their assets.
 */
async function exampleOwnAssetResponse(
  pathname: string,
): Promise<Response | null> {
  const match = EXAMPLE_ASSET_ROUTE.exec(pathname);
  const slug = match?.[1];
  if (!slug) return null;
  const example = getExample(slug);
  if (!example) return null;
  return exampleAssetResponse(
    pathname,
    `/example-assets/${slug}/`,
    `../../../examples/${example.slug}/assets`,
  );
}

const LOOPBACK_HOSTNAMES = ["127.0.0.1", "localhost", "[::1]"];

/**
 * The names a browser can use for a server whose printed address has the
 * hostname `browserHost` (bracketed if IPv6), that name first. A server on a
 * loopback address also answers at `localhost`, which is what many people
 * type, so every loopback name is listed and the editor works at whichever
 * one is used.
 */
export function browserHostnames(browserHost: string): readonly string[] {
  if (!LOOPBACK_HOSTNAMES.includes(browserHost)) return [browserHost];
  return [
    browserHost,
    ...LOOPBACK_HOSTNAMES.filter((name) => name !== browserHost),
  ];
}

export function startSandboxServer(args = Bun.argv.slice(2)): void {
  const { values } = parseArgs({
    args,
    options: {
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "4173" },
      "preview-port": { type: "string" },
      "projects-root": { type: "string" },
      "test-fixtures": { type: "boolean", default: false },
    },
    strict: false,
  });

  const host = String(values.host ?? "127.0.0.1");
  const port = Number(values.port ?? "4173");
  const previewPort = Number(values["preview-port"] ?? port + 1);
  if (
    !Number.isInteger(port) ||
    !Number.isInteger(previewPort) ||
    port < 1 ||
    previewPort < 1 ||
    port > 65_535 ||
    previewPort > 65_535 ||
    port === previewPort
  ) {
    throw new Error(
      "Editor and preview ports must be distinct integers between 1 and 65535.",
    );
  }
  const projectsRoot =
    values["projects-root"] === undefined
      ? undefined
      : String(values["projects-root"]);
  // --test-fixtures is the CLI form; JGZ_TEST_FIXTURES=1 is the env-var form
  // playwright.config.ts could use instead (both are supported so either a
  // process manager or a shell script can opt in without touching the
  // command line).
  const testFixtures =
    values["test-fixtures"] === true || process.env.JGZ_TEST_FIXTURES === "1";
  const publicHost =
    host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  const browserHost = publicHost.includes(":") ? `[${publicHost}]` : publicHost;
  const hostnames = browserHostnames(browserHost);
  const editorOrigin = `http://${browserHost}:${port}`;
  const previewOrigin = `http://${browserHost}:${previewPort}`;
  Bun.serve({
    hostname: host,
    port,
    fetch: createSandboxServerHandler({
      ...(projectsRoot === undefined ? {} : { projectsRoot }),
      access: "editor",
      previewOrigin,
      hostnames,
      testFixtures,
    }),
  });
  Bun.serve({
    hostname: host,
    port: previewPort,
    fetch: createSandboxPreviewServerHandler({
      ...(projectsRoot === undefined ? {} : { projectsRoot }),
      parentOrigin: editorOrigin,
      hostnames,
    }),
  });
  console.log(`js-game-zero sandbox listening on ${editorOrigin}`);
}

if (import.meta.main) startSandboxServer();
