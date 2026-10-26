import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { licenseBanner } from "./license-banner";

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
  const banner = await licenseBanner(repoRoot, "packages/core");
  // Built together and split, so `@js-game-zero/core` and `/host` share one
  // copy of the runtime: a game started with one is the game the other's
  // inspector, storage and audio unlock see.
  await runBuild({
    entrypoints: ["packages/core/src/index.ts", "packages/core/src/host.ts"],
    outdir: "packages/core/dist",
    target: "browser",
    format: "esm",
    splitting: true,
    banner,
  });
  await runBuild({
    entrypoints: ["packages/core/src/node.ts"],
    outdir: "packages/core/dist",
    target: "node",
    format: "esm",
    banner,
  });
  await emitDeclarations("packages/core/tsconfig.build.json");
  await normalizeDeclarationSpecifiers("packages/core/dist");
  await buildReference(banner);
}

/** Ships the API reference with core, for a host that hands it to a
 * learner, a tool or a model: each page as Markdown in dist/reference/, and
 * dist/reference/index.js exporting every page by its file name. */
async function buildReference(banner: string): Promise<void> {
  const from = "docs/reference";
  const to = "packages/core/dist/reference";
  await mkdir(to, { recursive: true });
  const pages: Record<string, string> = {};
  for (const name of (await readdir(from)).sort()) {
    if (!name.endsWith(".md")) continue;
    pages[name] = await readFile(join(from, name), "utf8");
    await writeFile(join(to, name), pages[name]);
  }
  await writeFile(
    join(to, "index.js"),
    `${banner}\nexport const reference = Object.freeze(${JSON.stringify(pages, null, 2)});\n`,
  );
  await writeFile(
    join(to, "index.d.ts"),
    `/** js-game-zero's API reference: every page's Markdown by its file name, such as "actor.md". */\nexport declare const reference: Readonly<Record<string, string>>;\n`,
  );
}

async function buildBrowserRuntime(): Promise<void> {
  await rm("packages/browser-runtime/dist", { force: true, recursive: true });

  // The ESM facade remains a tiny external re-export. Package managers can
  // deduplicate core normally instead of receiving a second bundled copy.
  // It holds none of the library's code, so it has no license banner.
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
    banner: await licenseBanner(repoRoot, "packages/browser-runtime"),
  });
  await emitDeclarations("packages/browser-runtime/tsconfig.build.json");
  await normalizeDeclarationSpecifiers("packages/browser-runtime/dist");
}

async function buildCli(): Promise<void> {
  await rm("packages/cli/dist", { force: true, recursive: true });
  const banner = await licenseBanner(repoRoot, "packages/cli");
  await runBuild({
    entrypoints: ["packages/cli/src/cli.ts"],
    outdir: "packages/cli/dist",
    target: "bun",
    format: "esm",
    external: ["playwright"],
    banner,
  });
  await runBuild({
    entrypoints: ["packages/cli/browser/driver.ts"],
    outdir: "packages/cli/dist/browser",
    target: "browser",
    format: "esm",
    banner,
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
