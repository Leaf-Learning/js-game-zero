import { parseArgs } from "node:util";
import { join, normalize } from "node:path";

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

export async function phaseOneHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/health") {
    return Response.json({ ok: true, phase: 1 });
  }
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
  if (url.pathname.startsWith("/assets/phase_three/")) {
    return phaseThreeAssetResponse(url.pathname);
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
  return new Response("Not found", { status: 404 });
}

function html(source: string): Response {
  return new Response(source, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function phaseThreeAssetResponse(pathname: string): Promise<Response> {
  const relative = pathname.replace("/assets/phase_three/", "");
  if (!/^(images|sounds|music|fonts)\/[a-z0-9_/.]+$/.test(relative)) {
    return new Response("Not found", { status: 404 });
  }
  if (relative.includes("..") || relative.includes("//")) {
    return new Response("Not found", { status: 404 });
  }
  const root = new URL("../../../examples/phase-three/assets", import.meta.url)
    .pathname;
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
