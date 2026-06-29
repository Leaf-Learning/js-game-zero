import { parseArgs } from "node:util";
import { join, normalize } from "node:path";
import {
  exampleManifest,
  getExample,
  type ExampleManifestEntry,
} from "../../../examples/manifest";

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

function examplePage(example: ExampleManifestEntry): string {
  const loaderScript =
    example.mode === "import"
      ? `<script type="module" src="/examples/${example.slug}/main.js"></script>`
      : `<script type="module">
import { run } from "/runtime/core.js";

const status = {
  slug: ${JSON.stringify(example.slug)},
  mode: "global",
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

const source = await fetch("/examples/${example.slug}/main.js").then((response) => {
  if (!response.ok) throw new Error("Failed to load example source");
  return response.text();
});

const handle = run(source, {
  canvas,
  projectId: "phase_five",
  assetBaseUrl: "/assets",
  diagnostics(diagnostic) {
    status.diagnostics.push(diagnostic);
  }
});

function canvasIsNonblank() {
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 0) return true;
  }
  return false;
}

function tick() {
  status.frames += 1;
  status.nonblank = canvasIsNonblank();
  status.storage = Object.fromEntries(
    handle.storage.keys().map((key) => [key, handle.storage.get(key)])
  );
  status.ready = status.nonblank && status.diagnostics.length === 0;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
</script>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>js-game-zero Example: ${example.title}</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #101417; color: white; }
      main { min-height: 100vh; display: grid; place-items: center; align-content: center; gap: 16px; }
      canvas { width: min(640px, calc(100vw - 32px)); height: auto; border: 1px solid #94a3b8; background: #0f172a; outline: 2px solid transparent; }
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
  const result = await Bun.build({
    entrypoints: ["packages/browser-runtime/src/browser.ts"],
    target: "browser",
    format: "esm",
  });
  if (!result.success || !result.outputs[0]) {
    return new Response("Failed to build runtime", { status: 500 });
  }
  return new Response(await result.outputs[0].text(), {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
}

async function coreRuntimeBundle(): Promise<Response> {
  const result = await Bun.build({
    entrypoints: ["packages/core/src/index.ts"],
    target: "browser",
    format: "esm",
  });
  if (!result.success || !result.outputs[0]) {
    return new Response("Failed to build core runtime", { status: 500 });
  }
  return new Response(await result.outputs[0].text(), {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
}

export async function phaseOneHandler(request: Request): Promise<Response> {
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
    const result = await Bun.build({
      entrypoints: [entryPath],
      target: "browser",
      format: "esm",
    });
    if (!result.success || !result.outputs[0]) {
      return new Response("Failed to build example", { status: 500 });
    }
    return new Response(await result.outputs[0].text(), {
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
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

function contentType(pathname: string): string {
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".wav")) return "audio/wav";
  if (pathname.endsWith(".ogg")) return "audio/ogg";
  if (pathname.endsWith(".woff")) return "font/woff";
  return "application/octet-stream";
}

export function startPhaseOneServer(args = Bun.argv.slice(2)): void {
  const { values } = parseArgs({
    args,
    options: {
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "4173" },
    },
    strict: false,
  });

  const host = String(values.host ?? "127.0.0.1");
  const port = Number(values.port ?? "4173");
  Bun.serve({ hostname: host, port, fetch: phaseOneHandler });
  console.log(
    `js-game-zero phase 1 sandbox listening on http://${host}:${port}`,
  );
}

if (import.meta.main) startPhaseOneServer();
