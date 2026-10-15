import { join, normalize, sep } from "node:path";
import {
  cachedBrowserBuild,
  contentType,
  html,
  REPO_ROOT,
} from "../../../apps/sandbox/src/sandbox";

const coreSemanticsFixturePage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>js-game-zero Core Semantics Fixture</title>
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
      <canvas data-jgz-core-semantics-canvas width="320" height="180"></canvas>
    </main>
    <script type="module" src="/test-fixtures/runtime.js"></script>
  </body>
</html>`;

function renderingFixturePage(
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
    <script type="module" src="/test-fixtures/runtime.js"></script>
  </body>
</html>`;
}

function audioFixturePage(
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
    <script type="module" src="/test-fixtures/runtime.js"></script>
  </body>
</html>`;
}

/** A host page with nothing but js-game-zero's script-tag build loaded. */
const browserHostFixturePage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>js-game-zero Browser Host Fixture</title>
  </head>
  <body>
    <main data-jgz-host></main>
    <script type="module" src="/test-fixtures/jgz-browser.js"></script>
  </body>
</html>`;

async function browserBuildBundle(): Promise<Response> {
  try {
    const build = await cachedBrowserBuild(
      "test-fixtures-jgz-browser",
      join(REPO_ROOT, "packages/browser-runtime/src/browser.ts"),
    );
    return new Response(build.text, {
      headers: { "content-type": build.contentType },
    });
  } catch {
    return new Response("Failed to build the browser runtime", {
      status: 500,
    });
  }
}

async function testFixtureRuntimeBundle(): Promise<Response> {
  try {
    const build = await cachedBrowserBuild(
      "test-fixtures-runtime",
      join(REPO_ROOT, "tests/e2e/fixtures/browser-harness.ts"),
    );
    return new Response(build.text, {
      headers: { "content-type": build.contentType },
    });
  } catch {
    return new Response("Failed to build test-fixture runtime", {
      status: 500,
    });
  }
}

async function fixtureAssetResponse(
  pathname: string,
  prefix: string,
  fixture: "rendering-fixture" | "asset-sync-fixture",
): Promise<Response> {
  const relative = pathname.slice(prefix.length);
  if (
    !/^(images|sounds|music|fonts)\/[a-z0-9_/.]+$/.test(relative) ||
    relative.includes("..") ||
    relative.includes("//")
  ) {
    return new Response("Not found", { status: 404 });
  }
  const root = normalize(
    new URL(`./assets/${fixture}/assets`, import.meta.url).pathname,
  );
  const filePath = normalize(join(root, relative));
  if (!filePath.startsWith(`${root}${sep}`)) {
    return new Response("Not found", { status: 404 });
  }
  const file = Bun.file(filePath);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, {
    headers: { "content-type": contentType(filePath) },
  });
}

/** Routes owned exclusively by the browser e2e harness. Production loads
 * this module dynamically only when `testFixtures` is explicitly enabled. */
export async function testFixtureRouteResponse(
  url: URL,
): Promise<Response | null> {
  if (url.pathname === "/test-fixtures/runtime.js") {
    return testFixtureRuntimeBundle();
  }
  if (url.pathname === "/test-fixtures/jgz-browser.js") {
    return browserBuildBundle();
  }
  if (url.pathname === "/fixtures/browser-host") {
    return new Response(browserHostFixturePage, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  if (url.pathname === "/fixtures/core-semantics") {
    return new Response(coreSemanticsFixturePage, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  if (url.pathname.startsWith("/fixture-assets/rendering-fixture/")) {
    return fixtureAssetResponse(
      url.pathname,
      "/fixture-assets/rendering-fixture/",
      "rendering-fixture",
    );
  }
  if (url.pathname.startsWith("/fixture-assets/asset-sync-fixture/")) {
    return fixtureAssetResponse(
      url.pathname,
      "/fixture-assets/asset-sync-fixture/",
      "asset-sync-fixture",
    );
  }
  if (url.pathname === "/fixtures/rendering/drawing") {
    return html(
      renderingFixturePage(
        "js-game-zero Rendering Fixture: Drawing",
        "js-game-zero rendering fixture",
        "data-jgz-rendering-drawing",
      ),
    );
  }
  if (url.pathname === "/fixtures/rendering/text") {
    return html(
      renderingFixturePage(
        "js-game-zero Rendering Fixture: Text",
        "js-game-zero text fixture",
        "data-jgz-rendering-text",
      ),
    );
  }
  if (url.pathname === "/fixtures/rendering/loader") {
    return html(
      renderingFixturePage(
        "js-game-zero Rendering Fixture: Loader",
        "js-game-zero loader fixture",
        "data-jgz-rendering-loader",
      ),
    );
  }
  if (url.pathname === "/fixtures/rendering/actor") {
    return html(
      renderingFixturePage(
        "js-game-zero Rendering Fixture: Actor",
        "js-game-zero actor fixture",
        "data-jgz-rendering-actor",
      ),
    );
  }
  if (url.pathname === "/fixtures/audio/tone") {
    return html(
      audioFixturePage(
        "js-game-zero Audio Fixture: Tone",
        "js-game-zero tone fixture",
        "data-jgz-audio-tone",
        "Play Tone",
      ),
    );
  }
  if (url.pathname === "/fixtures/audio/sound") {
    return html(
      audioFixturePage(
        "js-game-zero Audio Fixture: Sound",
        "js-game-zero sound fixture",
        "data-jgz-audio-sound",
        "Play Sound",
      ),
    );
  }
  if (url.pathname === "/fixtures/audio/music") {
    return html(
      audioFixturePage(
        "js-game-zero Audio Fixture: Music",
        "js-game-zero music fixture",
        "data-jgz-audio-music",
        "Play Music",
      ),
    );
  }
  if (url.pathname === "/fixtures/audio/storage") {
    return html(
      audioFixturePage(
        "js-game-zero Audio Fixture: Storage",
        "js-game-zero storage fixture",
        "data-jgz-audio-storage",
        "Save Score",
      ),
    );
  }
  return null;
}
