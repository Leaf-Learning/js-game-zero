import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const artifacts = {
  core: resolve(repoRoot, "packages/core/dist/index.js"),
  host: resolve(repoRoot, "packages/core/dist/host.js"),
  runtime: resolve(repoRoot, "packages/browser-runtime/dist/index.js"),
  iife: resolve(repoRoot, "packages/browser-runtime/dist/browser/browser.js"),
} as const;

await checkArtifactBoundaries();
await checkPackedConsumer();
await checkBrowserArtifacts();

console.log("Package artifact checks passed.");

async function checkArtifactBoundaries(): Promise<void> {
  const budgets = new Map<string, number>([
    [artifacts.core, 160_000],
    [artifacts.host, 100_000],
    [artifacts.runtime, 512],
    [artifacts.iife, 180_000],
  ]);

  for (const [path, maximumBytes] of budgets) {
    const size = (await stat(path)).size;
    if (size > maximumBytes) {
      throw new Error(
        `${path} is ${size.toLocaleString()} bytes; budget is ${maximumBytes.toLocaleString()} bytes.`,
      );
    }
  }

  for (const path of Object.values(artifacts)) {
    const source = await readFile(path, "utf8");
    const builtIn =
      /\bnode:(?:assert|buffer|child_process|cluster|crypto|dgram|diagnostics_channel|dns|events|fs|http|https|module|net|os|path|perf_hooks|process|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|wasi|worker_threads|zlib)\b/.exec(
        source,
      );
    if (builtIn) {
      throw new Error(`${path} contains browser-incompatible ${builtIn[0]}.`);
    }
  }

  const runtimeSource = await readFile(artifacts.runtime, "utf8");
  if (!runtimeSource.includes('from "@js-game-zero/core"')) {
    throw new Error(
      "browser-runtime ESM must remain an external @js-game-zero/core re-export.",
    );
  }
}

async function checkPackedConsumer(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "js-game-zero-pack-"));
  try {
    const packDir = join(root, "packs");
    await mkdir(packDir);
    const coreTarball = await packPackage(
      resolve(repoRoot, "packages/core"),
      packDir,
    );
    const runtimeTarball = await packPackage(
      resolve(repoRoot, "packages/browser-runtime"),
      packDir,
    );

    const consumerDir = join(root, "consumer");
    await Bun.write(
      join(consumerDir, "package.json"),
      JSON.stringify(
        {
          private: true,
          type: "module",
          dependencies: {
            "@js-game-zero/core": `file:${coreTarball}`,
            "@js-game-zero/browser-runtime": `file:${runtimeTarball}`,
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
      `import { Actor, defineGame, run, type RuntimeDiagnostic } from "@js-game-zero/core";
import { createAssetLoaders } from "@js-game-zero/core/host";
import { createSandboxFileStorageAdapter } from "@js-game-zero/core/node";
import { Actor as RuntimeActor } from "@js-game-zero/browser-runtime/browser";

const diagnostics: RuntimeDiagnostic[] = [];
void diagnostics;
void createAssetLoaders;
void createSandboxFileStorageAdapter;
const sameActor: typeof Actor = RuntimeActor;
void sameActor;

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
// @ts-expect-error autostart is boolean
run(game, { autostart: "yes" });
`,
    );
    await Bun.write(
      join(consumerDir, "consumer.mjs"),
      `import { Actor } from "@js-game-zero/core";
import { createAssetLoaders } from "@js-game-zero/core/host";
import { createSandboxFileStorageAdapter } from "@js-game-zero/core/node";
import { Actor as RuntimeActor } from "@js-game-zero/browser-runtime";

if (Actor !== RuntimeActor) throw new Error("browser-runtime duplicated core");
if (typeof createAssetLoaders !== "function") throw new Error("host export missing");
if (typeof createSandboxFileStorageAdapter !== "function") throw new Error("node export missing");
`,
    );

    // npm resolves the two local tarballs as a publish-style consumer would,
    // including browser-runtime's packed dependency on core.
    await runCommand(["npm", "install", "--ignore-scripts"], consumerDir);
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

async function checkBrowserArtifacts(): Promise<void> {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/core.js")
        return new Response(Bun.file(artifacts.core));
      if (pathname === "/runtime.js") {
        return new Response(Bun.file(artifacts.runtime));
      }
      if (pathname === "/iife.js")
        return new Response(Bun.file(artifacts.iife));
      return new Response(
        `<!doctype html><script type="importmap">{"imports":{"@js-game-zero/core":"/core.js"}}</script>`,
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.port}/`);
    const esmResult = await page.evaluate(async () => {
      const coreUrl = "/core.js";
      const runtimeUrl = "/runtime.js";
      const core = await import(coreUrl);
      const runtime = await import(runtimeUrl);
      return {
        sameActor: core.Actor === runtime.Actor,
        hasRun: typeof runtime.run === "function",
      };
    });
    if (!esmResult.sameActor || !esmResult.hasRun) {
      throw new Error("Browser ESM package facade failed its smoke test.");
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
