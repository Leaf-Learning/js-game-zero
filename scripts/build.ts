import {
  chmod,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
process.chdir(repoRoot);

type BuildTarget = "core" | "browser-runtime" | "cli";

const requested = process.argv[2];
if (
  requested !== undefined &&
  requested !== "core" &&
  requested !== "browser-runtime" &&
  requested !== "cli"
) {
  throw new TypeError(`Unknown package build target: ${requested}`);
}

const targets: readonly BuildTarget[] = requested
  ? [requested]
  : ["core", "browser-runtime", "cli"];

if (targets.includes("core")) await buildCore();
if (targets.includes("browser-runtime")) await buildBrowserRuntime();
if (targets.includes("cli")) await buildCli();

console.log(
  `Built ${targets.join(" and ")} package${targets.length > 1 ? "s" : ""}.`,
);

async function buildCore(): Promise<void> {
  await rm("packages/core/dist", { force: true, recursive: true });
  await runBuild({
    entrypoints: ["packages/core/src/index.ts"],
    outdir: "packages/core/dist",
    target: "browser",
    format: "esm",
  });
  await runBuild({
    entrypoints: ["packages/core/src/host.ts"],
    outdir: "packages/core/dist",
    target: "browser",
    format: "esm",
  });
  await runBuild({
    entrypoints: ["packages/core/src/node.ts"],
    outdir: "packages/core/dist",
    target: "node",
    format: "esm",
  });
  await emitDeclarations("packages/core/tsconfig.build.json");
  await normalizeDeclarationSpecifiers("packages/core/dist");
}

async function buildBrowserRuntime(): Promise<void> {
  await rm("packages/browser-runtime/dist", { force: true, recursive: true });

  // The ESM facade remains a tiny external re-export. Package managers can
  // deduplicate core normally instead of receiving a second bundled copy.
  await runBuild({
    entrypoints: ["packages/browser-runtime/src/index.ts"],
    outdir: "packages/browser-runtime/dist",
    target: "browser",
    format: "esm",
    external: ["@js-game-zero/core"],
  });

  // Script-tag users need one self-contained artifact, so the IIFE is the
  // only browser-runtime build that intentionally includes core.
  await runBuild({
    entrypoints: ["packages/browser-runtime/src/browser.ts"],
    outdir: "packages/browser-runtime/dist/browser",
    target: "browser",
    format: "iife",
  });
  await emitDeclarations("packages/browser-runtime/tsconfig.build.json");
  await normalizeDeclarationSpecifiers("packages/browser-runtime/dist");
}

async function buildCli(): Promise<void> {
  await rm("packages/cli/dist", { force: true, recursive: true });
  await runBuild({
    entrypoints: ["packages/cli/src/cli.ts"],
    outdir: "packages/cli/dist",
    target: "bun",
    format: "esm",
    external: ["playwright"],
  });
  await runBuild({
    entrypoints: ["packages/cli/browser/driver.ts"],
    outdir: "packages/cli/dist/browser",
    target: "browser",
    format: "esm",
  });
  await chmod("packages/cli/dist/cli.js", 0o755);
}

async function runBuild(options: Bun.BuildConfig): Promise<void> {
  const result = await Bun.build(options);
  if (result.success) return;
  for (const log of result.logs) console.error(log);
  throw new Error(`Build failed for ${options.entrypoints.join(", ")}.`);
}

async function emitDeclarations(configPath: string): Promise<void> {
  const tscPath = "node_modules/.bin/tsc";
  await stat(tscPath);
  const process = Bun.spawn([tscPath, "-p", configPath], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`Declaration build failed for ${configPath}.`);
  }
}

/** TypeScript's bundler-mode declaration emitter preserves extensionless
 * relative imports. Published ESM declarations need `.js` specifiers so
 * Node16/NodeNext consumers can resolve their corresponding `.d.ts` files. */
async function normalizeDeclarationSpecifiers(
  directory: string,
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await normalizeDeclarationSpecifiers(path);
      continue;
    }
    if (!entry.name.endsWith(".d.ts")) continue;
    const source = await readFile(path, "utf8");
    const normalized = source.replace(
      /((?:\bfrom\s+|\bimport\s*(?:\(\s*)?)["'])(\.\.?\/[^"']+)(["'])/g,
      (match, prefix: string, specifier: string, quote: string) =>
        extname(specifier) ? match : `${prefix}${specifier}.js${quote}`,
    );
    if (normalized !== source) await writeFile(path, normalized);
  }
}
