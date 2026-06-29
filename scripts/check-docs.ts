const requiredDocs = [
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

const phaseDocs = requiredDocs.filter((path) => path.includes("/phases/"));
const requiredPhaseSections = [
  "## Implementation Steps",
  "## Unit Verification",
  "## E2E Verification",
  "## Exit Criteria",
];

const missing: string[] = [];
for (const path of requiredDocs) {
  const file = Bun.file(path);
  if (!(await file.exists())) missing.push(path);
}

if (missing.length) {
  console.error(`Missing docs:\n${missing.map((p) => `- ${p}`).join("\n")}`);
  process.exit(1);
}

for (const path of requiredDocs) {
  const text = await Bun.file(path).text();
  if (!text.includes("Verification Criteria")) {
    console.error(`${path} must include a Verification Criteria section.`);
    process.exit(1);
  }
  if (/\b(TBD|TODO|placeholder)\b/i.test(text)) {
    console.error(`${path} contains unfinished placeholder language.`);
    process.exit(1);
  }
}

for (const path of phaseDocs) {
  const text = await Bun.file(path).text();
  for (const section of requiredPhaseSections) {
    if (!text.includes(section)) {
      console.error(`${path} must include ${section}.`);
      process.exit(1);
    }
  }
  for (const requiredPhrase of ["unit", "e2e", "Playwright"]) {
    if (!text.toLowerCase().includes(requiredPhrase.toLowerCase())) {
      console.error(
        `${path} must include meaningful ${requiredPhrase} verification detail.`,
      );
      process.exit(1);
    }
  }
}

console.log(`Checked ${requiredDocs.length} documentation files.`);

export {};
