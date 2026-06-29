import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", default: "4173" }
  },
  strict: false
});

const host = String(values.host ?? "127.0.0.1");
const port = Number(values.port ?? "4173");

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

async function runtimeBundle(): Promise<Response> {
  const result = await Bun.build({
    entrypoints: ["packages/browser-runtime/src/browser.ts"],
    target: "browser",
    format: "esm"
  });
  if (!result.success || !result.outputs[0]) {
    return new Response("Failed to build runtime", { status: 500 });
  }
  return new Response(await result.outputs[0].text(), {
    headers: { "content-type": "text/javascript; charset=utf-8" }
  });
}

Bun.serve({
  hostname: host,
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, phase: 1 });
    }
    if (url.pathname === "/runtime/browser.js") return runtimeBundle();
    if (url.pathname === "/" || url.pathname === "/phase-one") {
      return new Response(phaseOnePage, {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }
    return new Response("Not found", { status: 404 });
  }
});

console.log(`js-game-zero phase 1 sandbox listening on http://${host}:${port}`);
