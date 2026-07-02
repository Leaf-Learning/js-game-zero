import { parseArgs } from "node:util";
import { join, normalize } from "node:path";
import {
  exampleManifest,
  getExample,
  type ExampleManifestEntry,
} from "../../../examples/manifest";
import {
  cachedBrowserBuild,
  createSandboxHandler,
  REPO_ROOT,
  type SandboxHandlerOptions,
} from "./sandbox";

const phaseOnePage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>js-game-zero Phase 1 Smoke</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #0d1117; color: white; }
      main { min-height: 100vh; display: grid; place-items: center; gap: 16px; align-content: center; }
      canvas { border: 1px solid #8b949e; image-rendering: pixelated; }
    </style>
  </head>
  <body>
    <main>
      <h1>js-game-zero sandbox scaffold</h1>
      <canvas data-jgz-phase-one-canvas width="320" height="180"></canvas>
    </main>
    <script type="module" src="/runtime/browser.js"></script>
  </body>
</html>`;

const phaseTwoPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>js-game-zero Phase 2 Semantics</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #101417; color: white; }
      main { min-height: 100vh; display: grid; place-items: center; align-content: center; gap: 16px; }
      canvas { border: 1px solid #8b949e; background: #17212b; outline: 2px solid transparent; }
      canvas:focus { outline-color: #67d4ff; }
    </style>
  </head>
  <body>
    <main>
      <h1>js-game-zero core semantics fixture</h1>
      <canvas data-jgz-phase-two-canvas width="320" height="180"></canvas>
    </main>
    <script type="module" src="/runtime/browser.js"></script>
  </body>
</html>`;

function phaseThreePage(
  title: string,
  heading: string,
  canvasAttribute: string,
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #111827; color: white; }
      main { min-height: 100vh; display: grid; place-items: center; align-content: center; gap: 16px; }
      canvas { border: 1px solid #94a3b8; background: #0f172a; image-rendering: auto; }
    </style>
  </head>
  <body>
    <main>
      <h1>${heading}</h1>
      <canvas ${canvasAttribute} width="240" height="150"></canvas>
    </main>
    <script type="module" src="/runtime/browser.js"></script>
  </body>
</html>`;
}

function phaseFourPage(
  title: string,
  heading: string,
  buttonAttribute: string,
  buttonLabel: string,
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #101417; color: white; }
      main { min-height: 100vh; display: grid; place-items: center; align-content: center; gap: 16px; }
      button { appearance: none; border: 1px solid #7dd3fc; border-radius: 6px; background: #0f172a; color: white; padding: 10px 14px; font: inherit; }
      button:focus { outline: 2px solid #facc15; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${heading}</h1>
      <button ${buttonAttribute}>${buttonLabel}</button>
    </main>
    <script type="module" src="/runtime/browser.js"></script>
  </body>
</html>`;
}

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
    const image = await loadImage("/assets/${example.slug}/" + asset);
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
  assetBaseUrl: "/assets",
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

async function runtimeBundle(): Promise<Response> {
  try {
    const build = await cachedBrowserBuild(
      "runtime-browser",
      join(REPO_ROOT, "packages/browser-runtime/src/browser.ts"),
    );
    return new Response(build.text, {
      headers: { "content-type": build.contentType },
    });
  } catch {
    return new Response("Failed to build runtime", { status: 500 });
  }
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

async function legacyPhaseHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") {
    return Response.json({ ok: true, phase: 1 });
  }
  if (url.pathname === "/runtime/core.js") return coreRuntimeBundle();
  if (url.pathname === "/runtime/browser.js") return runtimeBundle();
  if (url.pathname === "/" || url.pathname === "/phase-one") {
    return new Response(phaseOnePage, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  if (url.pathname === "/phase-two") {
    return new Response(phaseTwoPage, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  if (url.pathname === "/examples") {
    return html(examplesIndexPage());
  }
  if (url.pathname.startsWith("/examples/")) {
    const response = await exampleRouteResponse(url.pathname);
    if (response) return response;
  }
  if (url.pathname.startsWith("/assets/phase_three/")) {
    return exampleAssetResponse(
      url.pathname,
      "/assets/phase_three/",
      "../../../examples/phase-three/assets",
    );
  }
  if (url.pathname.startsWith("/assets/phase_five/")) {
    return exampleAssetResponse(
      url.pathname,
      "/assets/phase_five/",
      "../../../examples/phase-five/assets",
    );
  }
  if (url.pathname.startsWith("/assets/")) {
    const response = await exampleOwnAssetResponse(url.pathname);
    if (response) return response;
  }
  if (url.pathname === "/phase-three/drawing") {
    return html(
      phaseThreePage(
        "js-game-zero Phase 3 Drawing",
        "js-game-zero rendering fixture",
        "data-jgz-phase-three-drawing",
      ),
    );
  }
  if (url.pathname === "/phase-three/text") {
    return html(
      phaseThreePage(
        "js-game-zero Phase 3 Text",
        "js-game-zero text fixture",
        "data-jgz-phase-three-text",
      ),
    );
  }
  if (url.pathname === "/phase-three/loader") {
    return html(
      phaseThreePage(
        "js-game-zero Phase 3 Loader",
        "js-game-zero loader fixture",
        "data-jgz-phase-three-loader",
      ),
    );
  }
  if (url.pathname === "/phase-three/actor") {
    return html(
      phaseThreePage(
        "js-game-zero Phase 3 Actor",
        "js-game-zero actor fixture",
        "data-jgz-phase-three-actor",
      ),
    );
  }
  if (url.pathname === "/phase-four/tone") {
    return html(
      phaseFourPage(
        "js-game-zero Phase 4 Tone",
        "js-game-zero tone fixture",
        "data-jgz-phase-four-tone",
        "Play Tone",
      ),
    );
  }
  if (url.pathname === "/phase-four/sound") {
    return html(
      phaseFourPage(
        "js-game-zero Phase 4 Sound",
        "js-game-zero sound fixture",
        "data-jgz-phase-four-sound",
        "Play Sound",
      ),
    );
  }
  if (url.pathname === "/phase-four/music") {
    return html(
      phaseFourPage(
        "js-game-zero Phase 4 Music",
        "js-game-zero music fixture",
        "data-jgz-phase-four-music",
        "Play Music",
      ),
    );
  }
  if (url.pathname === "/phase-four/storage") {
    return html(
      phaseFourPage(
        "js-game-zero Phase 4 Storage",
        "js-game-zero storage fixture",
        "data-jgz-phase-four-storage",
        "Save Score",
      ),
    );
  }
  return new Response("Not found", { status: 404 });
}

export function createSandboxServerHandler(
  options: SandboxHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const sandboxHandler = createSandboxHandler(options);
  return async function sandboxServerHandler(
    request: Request,
  ): Promise<Response> {
    const sandboxResponse = await sandboxHandler(request);
    if (sandboxResponse) return sandboxResponse;
    return legacyPhaseHandler(request);
  };
}

export const phaseOneHandler = createSandboxServerHandler();

function html(source: string): Response {
  return new Response(source, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
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

const EXAMPLE_ASSET_ROUTE = /^\/assets\/([a-z][a-z0-9-]*)\//;

/**
 * Serves each example's own `assets/` directory at `/assets/<slug>/...`,
 * generalizing what used to be a single hardcoded `/assets/phase_five/`
 * route shared (incorrectly) by every example. Only kicks in for a
 * pathname whose first segment names a real example in the manifest, so
 * it never shadows the sandbox's own `/assets/<projectId>/...` route for
 * user projects (see `reservedAssetProjectIds` in sandbox.ts, which keeps
 * example slugs out of that route so requests fall through to here).
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
    `/assets/${slug}/`,
    `../../../examples/${slug}/assets`,
  );
}

function contentType(pathname: string): string {
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg"))
    return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".wav")) return "audio/wav";
  if (pathname.endsWith(".ogg")) return "audio/ogg";
  if (pathname.endsWith(".mp3")) return "audio/mpeg";
  if (pathname.endsWith(".m4a")) return "audio/mp4";
  if (pathname.endsWith(".woff")) return "font/woff";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

export function startPhaseOneServer(args = Bun.argv.slice(2)): void {
  const { values } = parseArgs({
    args,
    options: {
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "4173" },
      "projects-root": { type: "string" },
    },
    strict: false,
  });

  const host = String(values.host ?? "127.0.0.1");
  const port = Number(values.port ?? "4173");
  const projectsRoot =
    values["projects-root"] === undefined
      ? undefined
      : String(values["projects-root"]);
  Bun.serve({
    hostname: host,
    port,
    fetch: createSandboxServerHandler(
      projectsRoot === undefined ? {} : { projectsRoot },
    ),
  });
  console.log(`js-game-zero sandbox listening on http://${host}:${port}`);
}

if (import.meta.main) startPhaseOneServer();
