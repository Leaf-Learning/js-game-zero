import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

type PackageJson = {
  readonly name?: string;
  readonly license?: string;
  readonly scripts?: Record<string, string>;
};

const requiredDocs = [
  "README.md",
  "LICENSE",
  "docs/engineering-design.md",
  "docs/implementation-plan.md",
  "docs/feature-parity.md",
  "docs/api.md",
  "docs/sandbox.md",
  "docs/tutorials.md",
  "docs/phases/phase-01-repo-tooling-docs.md",
  "docs/phases/phase-02-core-semantics.md",
  "docs/phases/phase-03-rendering-assets-actor.md",
  "docs/phases/phase-04-audio-music-tone-storage.md",
  "docs/phases/phase-05-runtime-examples-parity.md",
  "docs/phases/phase-06-web-sandbox.md",
  "docs/phases/phase-07-docs-ci-github.md",
];

const requiredPhaseSections = [
  "## Implementation Steps",
  "## Unit Verification",
  "## E2E Verification",
  "## Exit Criteria",
  "## Verification Criteria",
];

const requiredCiSteps = [
  "oven-sh/setup-bun@v2",
  "bun install --frozen-lockfile",
  "bun run lint",
  "bun test",
  "bun run docs:check",
  "bun run build",
  "bunx playwright install --with-deps chromium",
  "bun run test:e2e",
];

const requiredTutorialRoutes = [
  "/examples/drawing-basics",
  "/examples/actor-movement",
  "/examples/sound-tone",
  "/examples/storage-save",
  "/examples/sandbox-starter",
];

const packageManifests = [
  "package.json",
  "packages/core/package.json",
  "packages/browser-runtime/package.json",
  "apps/sandbox/package.json",
];

const cleanRoomScanRoots = ["apps", "examples", "packages"];

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

async function main(): Promise<void> {
  await checkRequiredDocs();
  await checkPhaseDocs();
  await checkImplementationPlanLinks();
  await checkReadmeCommands();
  await checkTutorials();
  await checkCiWorkflow();
  await checkBuildMetadata();
  await checkLicenseBoundary();

  console.log(`Checked ${requiredDocs.length} documentation files.`);
}

async function checkRequiredDocs(): Promise<void> {
  const missing: string[] = [];
  for (const path of requiredDocs) {
    if (!(await Bun.file(path).exists())) missing.push(path);
  }
  if (missing.length) {
    fail(`Missing docs:\n${missing.map((path) => `- ${path}`).join("\n")}`);
  }

  for (const path of requiredDocs.filter(
    (path) => path.startsWith("docs/") && path.endsWith(".md"),
  )) {
    const text = await Bun.file(path).text();
    if (!text.includes("Verification Criteria")) {
      fail(`${path} must include a Verification Criteria section.`);
    }
    if (/\b(TBD|TODO|placeholder)\b/i.test(text)) {
      fail(`${path} contains unfinished marker language.`);
    }
  }
}

async function checkPhaseDocs(): Promise<void> {
  const phaseDocs = requiredDocs.filter((path) => path.includes("/phases/"));
  for (const path of phaseDocs) {
    const text = await Bun.file(path).text();
    const status = /^> Status: (.+)$/m.exec(text)?.[1]?.trim();
    if (!status) {
      fail(`${path} must include a status banner.`);
    }
    if (status !== "Complete") {
      fail(`${path} must have Complete status, not ${status}.`);
    }
    for (const section of requiredPhaseSections) {
      if (!text.includes(section)) fail(`${path} must include ${section}.`);
    }
    for (const requiredPhrase of ["unit", "e2e", "Playwright"]) {
      if (!text.toLowerCase().includes(requiredPhrase.toLowerCase())) {
        fail(`${path} must include ${requiredPhrase} verification detail.`);
      }
    }
  }
}

async function checkImplementationPlanLinks(): Promise<void> {
  const implementationPlan = await Bun.file(
    "docs/implementation-plan.md",
  ).text();
  const links = markdownLinks(implementationPlan);
  for (const path of requiredDocs.filter((path) => path.includes("/phases/"))) {
    const relativeLink = path.replace("docs/", "");
    if (!links.includes(relativeLink)) {
      fail(
        `docs/implementation-plan.md must include a Markdown link to ${relativeLink}.`,
      );
    }
  }
}

async function checkReadmeCommands(): Promise<void> {
  const readme = await Bun.file("README.md").text();
  const rootPackage = await readPackageJson("package.json");
  const scripts = rootPackage.scripts ?? {};
  const commands = extractFencedBlocks(readme)
    .filter((block) => block.info.trim() === "sh")
    .flatMap((block) => shellCommands(block.code));

  if (commands.length === 0) fail("README.md must document shell commands.");

  for (const command of commands) {
    const [binary, subcommand, script] = command.split(/\s+/);
    if (binary !== "bun" && binary !== "bunx") {
      fail(`README command must start with bun or bunx: ${command}`);
    }
    if (binary === "bunx") {
      if (!command.startsWith("bunx playwright install chromium")) {
        fail(`README bunx command is not recognized: ${command}`);
      }
      continue;
    }
    if (subcommand === "install") continue;
    if (subcommand === "test") {
      requireScript(scripts, "test", command);
      continue;
    }
    if (subcommand === "run" && script) {
      requireScript(scripts, script, command);
      continue;
    }
    fail(`README command is not smoke-checkable: ${command}`);
  }

  for (const requiredScript of [
    "lint",
    "test",
    "docs:check",
    "test:e2e",
    "build",
    "dev:sandbox",
    "check",
  ]) {
    requireScript(scripts, requiredScript, `required script ${requiredScript}`);
  }
}

async function checkTutorials(): Promise<void> {
  const tutorials = await Bun.file("docs/tutorials.md").text();
  const routes = [...tutorials.matchAll(/Example route: `([^`]+)`/g)].map(
    (match) => match[1] ?? "",
  );
  for (const route of requiredTutorialRoutes) {
    if (!routes.includes(route)) fail(`docs/tutorials.md must link ${route}.`);
  }

  const blocks = extractFencedBlocks(tutorials).filter((block) =>
    /^js(?:\s|$)|^javascript(?:\s|$)/.test(block.info.trim()),
  );
  if (blocks.length < 5) {
    fail(
      "docs/tutorials.md must include JavaScript snippets for each tutorial.",
    );
  }
  for (const [index, block] of blocks.entries()) {
    compileJavaScriptSnippet(
      block.code,
      `docs/tutorials.md snippet ${index + 1}`,
    );
  }
}

async function checkCiWorkflow(): Promise<void> {
  const workflow = await Bun.file(".github/workflows/ci.yml").text();
  let previousIndex = -1;
  for (const step of requiredCiSteps) {
    const index = workflow.indexOf(step);
    if (index === -1) fail(`CI workflow must include: ${step}`);
    if (index < previousIndex) {
      fail(`CI workflow step is out of order: ${step}`);
    }
    previousIndex = index;
  }

  const rootPackage = await readPackageJson("package.json");
  const lintScript = rootPackage.scripts?.lint ?? "";
  if (!lintScript.includes("typecheck")) {
    fail(
      "The lint script must include typecheck so CI covers static analysis.",
    );
  }
}

async function checkBuildMetadata(): Promise<void> {
  const rootPackage = await readPackageJson("package.json");
  requireScript(rootPackage.scripts ?? {}, "build", "root build script");

  const buildScript = await Bun.file("scripts/build.ts").text();
  for (const outdir of [
    "packages/core/dist",
    "packages/browser-runtime/dist",
    "packages/browser-runtime/dist/browser",
  ]) {
    if (!buildScript.includes(outdir)) {
      fail(`scripts/build.ts must emit ${outdir}.`);
    }
  }

  for (const packagePath of [
    "packages/core/package.json",
    "packages/browser-runtime/package.json",
  ]) {
    const manifest = await readPackageJson(packagePath);
    requireScript(manifest.scripts ?? {}, "build", `${packagePath} build`);
  }
}

async function checkLicenseBoundary(): Promise<void> {
  const licenseText = await Bun.file("LICENSE").text();
  if (
    !licenseText.includes("GNU LESSER GENERAL PUBLIC LICENSE") ||
    !licenseText.includes("Version 3, 29 June 2007")
  ) {
    fail("LICENSE must be GNU LGPL version 3.");
  }

  for (const packagePath of packageManifests) {
    const manifest = await readPackageJson(packagePath);
    if (manifest.license !== "LGPL-3.0-only") {
      fail(`${packagePath} must declare LGPL-3.0-only license.`);
    }
  }

  const forbidden = /\b(GNU Lesser|Pygame Zero|pygame[_-]?zero)\b/i;
  for (const path of await listProjectFiles(cleanRoomScanRoots)) {
    if (path.includes("/dist/") || path.includes("/node_modules/")) continue;
    if (/pygame[_-]?zero|lgpl/i.test(path)) {
      fail(`Clean-room package file name is not allowed: ${path}`);
    }
    if (!textExtensions.has(extname(path))) continue;
    const text = await readFile(path, "utf8");
    const match = forbidden.exec(text);
    if (match) {
      fail(
        `Clean-room source must not contain upstream license marker "${match[0]}" in ${path}.`,
      );
    }
  }
}

function extractFencedBlocks(
  markdown: string,
): { readonly info: string; readonly code: string }[] {
  return [...markdown.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)].map((match) => ({
    info: match[1] ?? "",
    code: match[2] ?? "",
  }));
}

function shellCommands(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function markdownLinks(markdown: string): string[] {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)#?]+)(?:[#?][^)]*)?\)/g)].map(
    (match) => match[1] ?? "",
  );
}

function compileJavaScriptSnippet(source: string, label: string): void {
  try {
    new Function(source);
  } catch (error) {
    fail(`${label} must compile: ${errorMessage(error)}`);
  }
}

function requireScript(
  scripts: Record<string, string>,
  script: string,
  context: string,
): void {
  if (!scripts[script])
    fail(`${context} requires package.json script ${script}.`);
}

async function readPackageJson(path: string): Promise<PackageJson> {
  return (await Bun.file(path).json()) as PackageJson;
}

async function listProjectFiles(roots: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const root of roots) await visit(root, files);
  return files.sort();
}

async function visit(path: string, files: string[]): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "coverage"
    ) {
      continue;
    }
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      await visit(entryPath, files);
    } else if (entry.isFile()) {
      files.push(relative(process.cwd(), entryPath));
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

await main();

export {};
