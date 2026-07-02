type PackageJson = {
  readonly name?: string;
  readonly license?: string;
  readonly scripts?: Record<string, string>;
};

const topLevelDocs = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
];

const userFacingDocs = [
  "docs/getting-started.md",
  "docs/tutorial.md",
  "docs/cookbook.md",
  "docs/sandbox.md",
  "docs/examples.md",
  "docs/migrating-from-pgzero.md",
  "docs/reference/hooks.md",
  "docs/reference/screen.md",
  "docs/reference/actor.md",
  "docs/reference/rect.md",
  "docs/reference/clock.md",
  "docs/reference/audio.md",
  "docs/reference/storage.md",
  "docs/reference/loaders.md",
  "docs/reference/runtime.md",
];

const internalDocs = [
  "docs/internal/engineering-design.md",
  "docs/internal/implementation-plan.md",
  "docs/internal/feature-parity.md",
];

const phaseDocs = [
  "docs/internal/phases/phase-01-repo-tooling-docs.md",
  "docs/internal/phases/phase-02-core-semantics.md",
  "docs/internal/phases/phase-03-rendering-assets-actor.md",
  "docs/internal/phases/phase-04-audio-music-tone-storage.md",
  "docs/internal/phases/phase-05-runtime-examples-parity.md",
  "docs/internal/phases/phase-06-web-sandbox.md",
  "docs/internal/phases/phase-07-docs-ci-github.md",
];

const requiredDocs = [
  ...topLevelDocs,
  ...userFacingDocs,
  ...internalDocs,
  ...phaseDocs,
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
  "bunx playwright install --with-deps chromium",
  "bun run lint",
  "bun test",
  "bun run docs:check",
  "bun run build",
  "bun run test:e2e",
];

const requiredReadmeScripts = [
  "lint",
  "test",
  "docs:check",
  "test:e2e",
  "build",
  "dev:sandbox",
  "check",
  "format",
];

const packageManifests = [
  "package.json",
  "packages/core/package.json",
  "packages/browser-runtime/package.json",
  "apps/sandbox/package.json",
];

async function main(): Promise<void> {
  await checkRequiredDocs();
  await checkPhaseDocs();
  await checkImplementationPlanLinks();
  await checkReadmeCommands();
  await checkTutorialAndCookbook();
  await checkExamplesDoc();
  await checkNoForbiddenLanguage();
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

  for (const path of [...userFacingDocs, ...internalDocs, ...phaseDocs]) {
    const text = await Bun.file(path).text();
    if (/\b(TBD|TODO|placeholder)\b/i.test(text)) {
      fail(`${path} contains unfinished marker language.`);
    }
  }

  // "Verification Criteria" is internal-spec language: phase docs must keep
  // it (checked separately below), but it must not leak into the pages a
  // learner actually reads.
  for (const path of userFacingDocs) {
    const text = await Bun.file(path).text();
    if (text.includes("Verification Criteria")) {
      fail(
        `${path} is user-facing and must not include a "Verification Criteria" section.`,
      );
    }
  }
}

async function checkPhaseDocs(): Promise<void> {
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
    "docs/internal/implementation-plan.md",
  ).text();
  const links = markdownLinks(implementationPlan);
  for (const path of phaseDocs) {
    const relativeLink = path.replace("docs/internal/", "");
    if (!links.includes(relativeLink)) {
      fail(
        `docs/internal/implementation-plan.md must include a Markdown link to ${relativeLink}.`,
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
    if (binary === "git" || binary === "cd") continue;
    if (binary !== "bun" && binary !== "bunx") {
      fail(`README command must start with bun, bunx, git, or cd: ${command}`);
    }
    if (binary === "bunx") {
      if (!command.startsWith("bunx playwright install")) {
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

  for (const requiredScript of requiredReadmeScripts) {
    requireScript(scripts, requiredScript, `required script ${requiredScript}`);
  }
}

async function checkTutorialAndCookbook(): Promise<void> {
  const tutorial = await Bun.file("docs/tutorial.md").text();
  const cookbook = await Bun.file("docs/cookbook.md").text();

  const tutorialBlocks = jsFencedBlocks(tutorial);
  if (tutorialBlocks.length < 8) {
    fail(
      "docs/tutorial.md must include a JavaScript snippet for each build step (at least 8).",
    );
  }
  for (const [index, block] of tutorialBlocks.entries()) {
    compileJavaScriptSnippet(block, `docs/tutorial.md snippet ${index + 1}`);
  }

  const cookbookBlocks = jsFencedBlocks(cookbook);
  if (cookbookBlocks.length < 6) {
    fail("docs/cookbook.md must include at least 6 recipe snippets.");
  }
  for (const [index, block] of cookbookBlocks.entries()) {
    compileJavaScriptSnippet(block, `docs/cookbook.md snippet ${index + 1}`);
  }
}

function jsFencedBlocks(markdown: string): string[] {
  return extractFencedBlocks(markdown)
    .filter((block) =>
      /^js(?:\s|$)|^javascript(?:\s|$)/.test(block.info.trim()),
    )
    .map((block) => block.code);
}

async function checkExamplesDoc(): Promise<void> {
  const manifest = await Bun.file("examples/manifest.ts").text();
  const slugs = [...manifest.matchAll(/slug:\s*"([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );
  if (slugs.length === 0) fail("Could not find any example slugs to check.");

  const examplesDoc = await Bun.file("docs/examples.md").text();
  const missing = slugs.filter(
    (slug) => !examplesDoc.includes(`\`/examples/${slug}\``),
  );
  if (missing.length) {
    fail(
      `docs/examples.md must document an Example route for: ${missing.join(", ")}`,
    );
  }
}

async function checkNoForbiddenLanguage(): Promise<void> {
  const scannedPaths = [
    "README.md",
    ...userFacingDocs,
    ...internalDocs,
    ...phaseDocs,
  ];
  for (const path of scannedPaths) {
    const text = await Bun.file(path).text();
    if (/clean.room/i.test(text)) {
      fail(
        `${path} must not describe this project as a "clean-room" implementation.`,
      );
    }
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
  // `new Function` can't parse a top-level ES module `import` statement (it
  // compiles a plain function body, not a module). A handful of snippets
  // legitimately show `import { ... } from "@js-game-zero/core"` for
  // import-mode code; strip those lines before compiling so the rest of the
  // snippet is still checked for real syntax errors.
  const withoutImports = source.replace(/^\s*import\b[^\n]*;?\s*$/gm, "");
  try {
    new Function(withoutImports);
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

await main();

export {};
