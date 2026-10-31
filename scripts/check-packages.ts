import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { licenseBanner } from "./license-banner";

const repoRoot = resolve(import.meta.dir, "..");
const artifacts = {
  core: resolve(repoRoot, "packages/js-game-zero/dist/index.js"),
  host: resolve(repoRoot, "packages/js-game-zero/dist/host.js"),
  node: resolve(repoRoot, "packages/js-game-zero/dist/node.js"),
  reference: resolve(repoRoot, "packages/js-game-zero/dist/reference/index.js"),
  iife: resolve(repoRoot, "packages/js-game-zero/dist/jgz.js"),
  cli: resolve(repoRoot, "packages/cli/dist/cli.js"),
  cliDriver: resolve(repoRoot, "packages/cli/dist/browser/driver.js"),
} as const;

await checkArtifactBoundaries();
await checkLicenseBanners();
await checkPackedConsumer();
await checkBrowserArtifacts();

console.log("Package artifact checks passed.");

async function checkArtifactBoundaries(): Promise<void> {
  // Each budget sits about a tenth above what the artifact weighs, so a
  // feature fits but an accidental bundle (a second core, a Node built-in
  // shim) doesn't. Raise one deliberately, keeping the headroom.
  const budgets = new Map<string, number>([
    [artifacts.core, 270_000],
    // The host entry carries the value serialiser, which knows Actor and Rect.
    [artifacts.host, 168_000],
    // The IIFE also carries the host APIs a page uses to read and seed a game.
    [artifacts.iife, 300_000],
    [artifacts.cli, 80_000],
    [artifacts.cliDriver, 280_000],
  ]);

  for (const [path, maximumBytes] of budgets) {
    const size = (await stat(path)).size;
    if (size > maximumBytes) {
      throw new Error(
        `${path} is ${size.toLocaleString()} bytes; budget is ${maximumBytes.toLocaleString()} bytes.`,
      );
    }
  }

  for (const path of [artifacts.core, artifacts.host, artifacts.iife]) {
    const source = await readFile(path, "utf8");
    const builtIn =
      /\bnode:(?:assert|buffer|child_process|cluster|crypto|dgram|diagnostics_channel|dns|events|fs|http|https|module|net|os|path|perf_hooks|process|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib)\b/.exec(
        source,
      );
    if (builtIn) {
      throw new Error(`${path} contains browser-incompatible ${builtIn[0]}.`);
    }
  }
}

/** Every artifact with the library's code opens with its license, after any
 * hashbang and Bun's marker. */
async function checkLicenseBanners(): Promise<void> {
  const core = await licenseBanner(repoRoot, "packages/js-game-zero");
  const cli = await licenseBanner(repoRoot, "packages/cli");
  for (const [path, banner] of [
    [artifacts.core, core],
    [artifacts.host, core],
    [artifacts.node, core],
    [artifacts.reference, core],
    [artifacts.iife, core],
    [artifacts.cli, cli],
    [artifacts.cliDriver, cli],
  ] as const) {
    const source = await readFile(path, "utf8");
    const at = source.indexOf(banner);
    if (
      at === -1 ||
      !/^(#![^\n]*\n)?(\/\/ @bun[^\n]*\n)?$/.test(source.slice(0, at))
    ) {
      throw new Error(`${path} must open with its license banner.`);
    }
  }
}

async function checkPackedConsumer(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "js-game-zero-pack-"));
  try {
    const packDir = join(root, "packs");
    await mkdir(packDir);
    const coreTarball = await packPackage(
      resolve(repoRoot, "packages/js-game-zero"),
      packDir,
    );
    const cliTarball = await packPackage(
      resolve(repoRoot, "packages/cli"),
      packDir,
    );

    await assertLicenseInTarball(coreTarball, "packages/js-game-zero");
    await assertLicenseInTarball(cliTarball, "packages/cli");
    const referencePages = (await readdir(resolve(repoRoot, "docs/reference")))
      .filter((name) => name.endsWith(".md"))
      .sort();
    for (const file of ["index.js", "index.d.ts", ...referencePages]) {
      await assertFileInTarball(coreTarball, `package/dist/reference/${file}`);
    }
    await assertFileInTarball(coreTarball, "package/dist/jgz.js");
    await assertFileInTarball(coreTarball, "package/dist/browser.d.ts");
    await assertFileInTarball(cliTarball, "package/dist/cli.js");
    await assertFileInTarball(cliTarball, "package/dist/browser/driver.js");

    const consumerDir = join(root, "consumer");
    await Bun.write(
      join(consumerDir, "package.json"),
      JSON.stringify(
        {
          private: true,
          type: "module",
          dependencies: {
            "js-game-zero": `file:${coreTarball}`,
            "@js-game-zero/cli": `file:${cliTarball}`,
          },
        },
        null,
        2,
      ),
    );
    await Bun.write(
      join(consumerDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "Bundler",
            lib: ["ES2022", "DOM"],
            strict: true,
            noEmit: true,
          },
          include: ["consumer.ts"],
        },
        null,
        2,
      ),
    );
    await Bun.write(
      join(consumerDir, "tsconfig.nodenext.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            lib: ["ES2022", "DOM"],
            strict: true,
            noEmit: true,
          },
          include: ["consumer.ts"],
        },
        null,
        2,
      ),
    );
    await Bun.write(
      join(consumerDir, "consumer.ts"),
      `/// <reference types="js-game-zero/iife" />
import { Actor, defineGame, run, type RuntimeDiagnostic } from "js-game-zero";
import { createAssetLoaders } from "js-game-zero/host";
import { createSandboxFileStorageAdapter } from "js-game-zero/node";
import { reference } from "js-game-zero/reference";

const actorPage: string | undefined = reference["actor.md"];
void actorPage;

const diagnostics: RuntimeDiagnostic[] = [];
void diagnostics;
void createAssetLoaders;
void createSandboxFileStorageAdapter;

const game = defineGame(({ Actor: ScopedActor, keys }) => ({
  update(dt) {
    const elapsed: number = dt;
    void elapsed;
    void ScopedActor;
  },
  onKeyDown(event) {
    const key: number = event.key;
    const repeat: boolean = event.repeat;
    void key;
    void repeat;
    void keys.LEFT;
  },
  onMouseDown(event) {
    const position: [number, number] = event.pos;
    void position;
  },
}));
run(game, { autostart: false });

// @ts-expect-error update receives elapsed seconds as a number
defineGame(() => ({ update(_dt: string) {} }));

// A plain module game's update gets its dt as a number, and an input hook's
// parameters, matched by name, take whatever types the game gives them.
let shipX = 0;
run(
  {
    update(dt) {
      shipX += 120 * dt;
    },
    onMouseDown(pos: [number, number]) {
      shipX = pos[0];
    },
    draw() {},
  },
  { autostart: false },
);
// @ts-expect-error draw takes no parameters
run({ draw(_unused: number) {} }, { autostart: false });

// A page using the script-tag build gets window.JGZ's types this way.
const scriptTagRun: ((source: string) => unknown) | undefined = window.JGZ?.run;
void scriptTagRun;
// @ts-expect-error autostart is boolean
run(game, { autostart: "yes" });
`,
    );
    await Bun.write(
      join(consumerDir, "consumer.mjs"),
      `import { Actor, audioUnlock, createStorage } from "js-game-zero";
import * as host from "js-game-zero/host";
import { createSandboxFileStorageAdapter } from "js-game-zero/node";

if (typeof Actor !== "function") throw new Error("root export missing");
if (typeof host.createAssetLoaders !== "function") throw new Error("host export missing");
if (host.audioUnlock !== audioUnlock || host.createStorage !== createStorage) {
  throw new Error("js-game-zero/host has its own copy of the runtime");
}
if (typeof createSandboxFileStorageAdapter !== "function") throw new Error("node export missing");
`,
    );
    // The reference is every page of docs/reference, as an export and as
    // Markdown files at their own subpaths.
    await Bun.write(
      join(consumerDir, "reference.mjs"),
      `import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { reference } from "js-game-zero/reference";

const pages = ${JSON.stringify(referencePages)};
if (JSON.stringify(Object.keys(reference)) !== JSON.stringify(pages)) {
  throw new Error("reference export doesn't hold every page");
}
for (const page of pages) {
  const file = fileURLToPath(import.meta.resolve(\`js-game-zero/reference/\${page}\`));
  if (readFileSync(file, "utf8") !== reference[page]) {
    throw new Error(\`reference \${page} differs from its Markdown file\`);
  }
}
import.meta.resolve("js-game-zero/package.json");
`,
    );

    // npm resolves the local tarballs as a publish-style consumer would,
    // the CLI's bin included.
    await runCommand(["npm", "install", "--ignore-scripts"], consumerDir);
    await runCommand(
      [resolve(consumerDir, "node_modules/.bin/jgz"), "--help"],
      consumerDir,
    );
    await runCommand(
      [resolve(repoRoot, "node_modules/.bin/tsc"), "-p", "tsconfig.json"],
      consumerDir,
    );
    await runCommand(
      [
        resolve(repoRoot, "node_modules/.bin/tsc"),
        "-p",
        "tsconfig.nodenext.json",
      ],
      consumerDir,
    );
    await runCommand([process.execPath, "consumer.mjs"], consumerDir);
    await runCommand([process.execPath, "reference.mjs"], consumerDir);
    // Node resolves the export map itself, apart from Bun.
    await runCommand(["node", "reference.mjs"], consumerDir);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function packPackage(
  packageDir: string,
  destination: string,
): Promise<string> {
  const before = new Set(await readdir(destination));
  await runCommand(
    [process.execPath, "pm", "pack", "--destination", destination],
    packageDir,
  );
  const added = (await readdir(destination)).filter(
    (name) => name.endsWith(".tgz") && !before.has(name),
  );
  if (added.length !== 1 || !added[0]) {
    throw new Error(`Expected one tarball from ${packageDir}.`);
  }
  return join(destination, added[0]);
}

async function assertLicenseInTarball(
  tarball: string,
  packageLabel: string,
): Promise<void> {
  const process = Bun.spawn(["tar", "-tzf", tarball], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  const listing = await new Response(process.stdout).text();
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`tar listing ${tarball} exited with ${exitCode}.`);
  }
  const files = new Set(
    listing
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  if (!files.has("package/LICENSE")) {
    throw new Error(`${packageLabel} tarball must include package/LICENSE.`);
  }
}

async function assertFileInTarball(
  tarball: string,
  expected: string,
): Promise<void> {
  const process = Bun.spawn(["tar", "-tzf", tarball], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  const listing = await new Response(process.stdout).text();
  const exitCode = await process.exited;
  if (exitCode !== 0 || !listing.split(/\n/).includes(expected)) {
    throw new Error(`${tarball} must include ${expected}.`);
  }
}

async function checkBrowserArtifacts(): Promise<void> {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      // Core's entry points share chunks of the runtime, served beside them.
      const coreFile = /^\/core\/([\w-]+\.js)$/.exec(pathname)?.[1];
      if (coreFile) {
        return new Response(Bun.file(join(dirname(artifacts.core), coreFile)), {
          headers: { "content-type": "text/javascript" },
        });
      }
      if (pathname === "/iife.js")
        return new Response(Bun.file(artifacts.iife));
      return new Response(
        `<!doctype html><script type="importmap">{"imports":{"js-game-zero":"/core/index.js"}}</script>`,
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.port}/`);
    const esmResult = await page.evaluate(async () => {
      const coreUrl = "/core/index.js";
      const hostUrl = "/core/host.js";
      const core = await import(coreUrl);
      const host = await import(hostUrl);
      return {
        hasRun: typeof core.run === "function",
        sharedRuntime: host.audioUnlock === core.audioUnlock,
      };
    });
    if (!esmResult.hasRun || !esmResult.sharedRuntime) {
      throw new Error("Browser ESM entry points failed their smoke test.");
    }

    const iifePage = await browser.newPage();
    await iifePage.goto(`http://127.0.0.1:${server.port}/`);
    await iifePage.addScriptTag({ url: "/iife.js" });
    const iifeResult = await iifePage.evaluate(() => {
      const global = window as unknown as {
        JGZ?: { Actor?: unknown; run?: unknown };
      };
      return {
        hasActor: typeof global.JGZ?.Actor === "function",
        hasRun: typeof global.JGZ?.run === "function",
      };
    });
    if (!iifeResult.hasActor || !iifeResult.hasRun) {
      throw new Error("Browser IIFE package failed its smoke test.");
    }
  } finally {
    await browser.close();
    server.stop(true);
  }
}

async function runCommand(command: string[], cwd: string): Promise<void> {
  const process = Bun.spawn(command, {
    cwd,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with ${exitCode}.`);
  }
}
