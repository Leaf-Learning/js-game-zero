// Packs the three packages for npm once they're ready to release, and with
// --publish publishes the ones npm doesn't have yet, core first.
//
//   bun run release:pack                  check, then pack into .release/
//   bun run release:pack --tag v0.2.0     and check the tag names the version
//   bun run release:pack --publish        and publish
//
// It packs dist as it is, so run `bun run build` and `bun run package:check`
// first. `bun pm pack` turns browser-runtime's `workspace:*` dependency on
// core into core's version, which `npm publish` from the folder wouldn't.
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const repoRoot = resolve(import.meta.dir, "..");
const releaseDir = join(repoRoot, ".release");

// In publishing order: browser-runtime depends on core, so core goes first.
const packages = [
  { dir: "packages/core", built: "dist/index.js" },
  { dir: "packages/browser-runtime", built: "dist/browser/browser.js" },
  { dir: "packages/cli", built: "dist/cli.js" },
] as const;

const { values: options } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    tag: { type: "string" },
    publish: { type: "boolean", default: false },
    "allow-dirty": { type: "boolean", default: false },
  },
  strict: true,
});

const version = await checkVersions();
if (options.tag !== undefined && options.tag !== `v${version}`) {
  fail(`The tag ${options.tag} doesn't name version ${version}.`);
}
await checkChangelog(version);
if (!options["allow-dirty"]) await checkCleanTree();

await rm(releaseDir, { force: true, recursive: true });
await mkdir(releaseDir);
const packed: { name: string; tarball: string }[] = [];
for (const { dir, built } of packages) {
  const name = await packageName(dir);
  // The banner names the version the build was made from.
  const output = await readFile(join(repoRoot, dir, built), "utf8").catch(() =>
    fail(`${dir}/${built} is missing. Run \`bun run build\` first.`),
  );
  if (!output.includes(` * ${name} ${version}\n`)) {
    fail(`${dir}/${built} wasn't built at ${version}. Run \`bun run build\`.`);
  }
  const tarball = await pack(dir);
  await checkPackedManifest(tarball, name, version);
  packed.push({ name, tarball });
}

// A prerelease such as 0.3.0-beta.1 goes out as `next`, so `latest` stays
// on the last release.
const distTag = version.includes("-") ? "next" : "latest";
const unpublished: typeof packed = [];
for (const entry of packed) {
  if (await isPublished(entry.name, version)) {
    console.log(`${entry.name}@${version} is already on npm.`);
  } else {
    unpublished.push(entry);
  }
}

if (options.publish) {
  for (const { name, tarball } of unpublished) {
    console.log(`Publishing ${name}@${version} as ${distTag}.`);
    await run(
      ["npm", "publish", tarball, "--access", "public", "--tag", distTag],
      "inherit",
    );
  }
  console.log(`Released ${version}.`);
} else if (unpublished.length) {
  console.log(`\nPacked ${version}. To publish by hand, in this order:\n`);
  for (const { tarball } of unpublished) {
    console.log(
      `npm publish ${tarball.slice(repoRoot.length + 1)} --access public --tag ${distTag}`,
    );
  }
} else {
  console.log(`\nPacked ${version}; npm has every package already.`);
}

/** Every manifest, the CLI's `--version` and bun.lock give one version.
 * `bun pm pack` writes browser-runtime's dependency on core from bun.lock,
 * and `bun install` doesn't update a workspace's version there, so a bump
 * edits it by hand. */
async function checkVersions(): Promise<string> {
  const root = await readManifest(".");
  const lockfile = await readFile(join(repoRoot, "bun.lock"), "utf8");
  const versions = new Map<string, string>([["package.json", root.version]]);
  for (const { dir } of packages) {
    versions.set(`${dir}/package.json`, (await readManifest(dir)).version);
    const locked = new RegExp(
      `"${dir}": \\{\\s*"name": "[^"]+",\\s*"version": "([^"]+)"`,
    ).exec(lockfile)?.[1];
    versions.set(`bun.lock's ${dir}`, locked ?? "(missing)");
  }
  const cli = await readFile(join(repoRoot, "packages/cli/src/cli.ts"), "utf8");
  const cliVersion = /export const VERSION = "([^"]+)";/.exec(cli)?.[1];
  versions.set("packages/cli/src/cli.ts VERSION", cliVersion ?? "(missing)");

  const distinct = new Set(versions.values());
  if (distinct.size !== 1) {
    fail(
      `The versions differ:\n${[...versions]
        .map(([where, value]) => `- ${where}: ${value}`)
        .join("\n")}`,
    );
  }
  return root.version;
}

/** The newest changelog entry is this version's, with its date. */
async function checkChangelog(version: string): Promise<void> {
  const changelog = await readFile(join(repoRoot, "CHANGELOG.md"), "utf8");
  const heading = /^## (.+)$/m.exec(changelog)?.[1];
  const expected = new RegExp(
    `^${version.replaceAll(".", "\\.")} — \\d{4}-\\d{2}-\\d{2}$`,
  );
  if (!heading || !expected.test(heading)) {
    fail(
      `CHANGELOG.md's first entry is "${heading ?? "(none)"}"; it should be "${version} — YYYY-MM-DD".`,
    );
  }
}

/** What's packed is what's committed. */
async function checkCleanTree(): Promise<void> {
  const status = await run(["git", "status", "--porcelain"], "pipe");
  if (status.trim()) {
    fail(
      `The working tree has changes, so the packages wouldn't match a commit:\n${status}Pass --allow-dirty to pack anyway.`,
    );
  }
}

async function pack(dir: string): Promise<string> {
  const before = new Set(await readdir(releaseDir));
  await run(
    [process.execPath, "pm", "pack", "--destination", releaseDir, "--quiet"],
    "pipe",
    join(repoRoot, dir),
  );
  const added = (await readdir(releaseDir)).filter(
    (file) => file.endsWith(".tgz") && !before.has(file),
  );
  if (added.length !== 1 || !added[0])
    fail(`Expected one tarball from ${dir}.`);
  return join(releaseDir, added[0]);
}

/** The packed manifest has the version, and browser-runtime asks for the
 * same core. */
async function checkPackedManifest(
  tarball: string,
  name: string,
  version: string,
): Promise<void> {
  const manifest = JSON.parse(
    await run(["tar", "-xzOf", tarball, "package/package.json"], "pipe"),
  ) as { version: string; dependencies?: Record<string, string> };
  if (manifest.version !== version) {
    fail(`${name} packed as ${manifest.version}, not ${version}.`);
  }
  for (const [dependency, range] of Object.entries(
    manifest.dependencies ?? {},
  )) {
    if (dependency.startsWith("@js-game-zero/") && range !== version) {
      fail(`${name} packed with ${dependency}@${range}, not ${version}.`);
    }
  }
}

/** Whether npm has this version: a package npm doesn't know is a 404, and a
 * version it doesn't have is an empty answer. */
async function isPublished(name: string, version: string): Promise<boolean> {
  const view = Bun.spawn(["npm", "view", `${name}@${version}`, "version"], {
    cwd: repoRoot,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(view.stdout).text(),
    new Response(view.stderr).text(),
    view.exited,
  ]);
  if (exitCode === 0) return stdout.trim() !== "";
  if (stderr.includes("E404")) return false;
  fail(`npm view ${name}@${version} failed:\n${stderr}`);
}

async function packageName(dir: string): Promise<string> {
  return (await readManifest(dir)).name;
}

async function readManifest(
  dir: string,
): Promise<{ name: string; version: string }> {
  return JSON.parse(
    await readFile(join(repoRoot, dir, "package.json"), "utf8"),
  ) as { name: string; version: string };
}

async function run(
  command: string[],
  output: "pipe" | "inherit",
  cwd = repoRoot,
): Promise<string> {
  const child = Bun.spawn(command, {
    cwd,
    stdin: output === "inherit" ? "inherit" : "ignore",
    stdout: output,
    stderr: "inherit",
  });
  const stdout =
    output === "pipe" ? await new Response(child.stdout).text() : "";
  const exitCode = await child.exited;
  if (exitCode !== 0) fail(`${command.join(" ")} exited with ${exitCode}.`);
  return stdout;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
