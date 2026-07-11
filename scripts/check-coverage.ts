import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type CoverageTotals = {
  functionsFound: number;
  functionsHit: number;
  linesFound: number;
  linesHit: number;
};

type CoverageGroup = {
  readonly name: string;
  readonly include: (sourcePath: string) => boolean;
  readonly minimumFunctions: number;
  readonly minimumLines: number;
};

const groups: readonly CoverageGroup[] = [
  {
    name: "core",
    include: (sourcePath) => sourcePath.startsWith("packages/core/src/"),
    minimumFunctions: 0.85,
    minimumLines: 0.9,
  },
  {
    name: "sandbox domain",
    include: (sourcePath) =>
      /apps\/sandbox\/src\/(?:sandbox|path-policy|project-repository)\.ts$/.test(
        sourcePath,
      ) ||
      sourcePath === "apps/sandbox/shared/contracts.ts" ||
      /apps\/sandbox\/client\/(?:api|controller|document-session|latest-operation)\.ts$/.test(
        sourcePath,
      ),
    minimumFunctions: 0.85,
    minimumLines: 0.9,
  },
];

const coverageDir = await mkdtemp(join(tmpdir(), "js-game-zero-coverage-"));
try {
  await runCoverage(coverageDir);
  const lcov = await readFile(join(coverageDir, "lcov.info"), "utf8");
  checkGroups(parseLcov(lcov));
} finally {
  await rm(coverageDir, { force: true, recursive: true });
}

function parseLcov(source: string): Map<string, CoverageTotals> {
  const records = new Map<string, CoverageTotals>();
  let currentPath: string | undefined;
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentPath = line.slice(3);
      records.set(currentPath, {
        functionsFound: 0,
        functionsHit: 0,
        linesFound: 0,
        linesHit: 0,
      });
      continue;
    }
    if (!currentPath) continue;
    const totals = records.get(currentPath);
    if (!totals) continue;
    if (line.startsWith("FNF:")) totals.functionsFound = numberAfterColon(line);
    if (line.startsWith("FNH:")) totals.functionsHit = numberAfterColon(line);
    if (line.startsWith("LF:")) totals.linesFound = numberAfterColon(line);
    if (line.startsWith("LH:")) totals.linesHit = numberAfterColon(line);
  }
  return records;
}

function checkGroups(records: Map<string, CoverageTotals>): void {
  for (const group of groups) {
    const totals: CoverageTotals = {
      functionsFound: 0,
      functionsHit: 0,
      linesFound: 0,
      linesHit: 0,
    };
    let fileCount = 0;
    for (const [sourcePath, file] of records) {
      if (!group.include(sourcePath)) continue;
      fileCount += 1;
      totals.functionsFound += file.functionsFound;
      totals.functionsHit += file.functionsHit;
      totals.linesFound += file.linesFound;
      totals.linesHit += file.linesHit;
    }
    if (fileCount === 0) {
      throw new Error(
        `Coverage report did not include the ${group.name} subsystem.`,
      );
    }

    const lineRate = ratio(totals.linesHit, totals.linesFound);
    const functionRate = ratio(totals.functionsHit, totals.functionsFound);
    console.log(
      `${group.name}: ${percent(lineRate)} lines (${totals.linesHit}/${totals.linesFound}), ` +
        `${percent(functionRate)} functions (${totals.functionsHit}/${totals.functionsFound})`,
    );
    if (lineRate < group.minimumLines) {
      throw new Error(
        `${group.name} line coverage ${percent(lineRate)} is below ${percent(group.minimumLines)}.`,
      );
    }
    if (functionRate < group.minimumFunctions) {
      throw new Error(
        `${group.name} function coverage ${percent(functionRate)} is below ${percent(group.minimumFunctions)}.`,
      );
    }
  }
}

async function runCoverage(outputDirectory: string): Promise<void> {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      "packages/core",
      "apps/sandbox",
      "--coverage",
      "--coverage-reporter=lcov",
      `--coverage-dir=${outputDirectory}`,
    ],
    {
      cwd: join(import.meta.dir, ".."),
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await child.exited;
  if (exitCode !== 0)
    throw new Error(`Coverage test run exited with ${exitCode}.`);
}

function numberAfterColon(line: string): number {
  const value = Number(line.slice(line.indexOf(":") + 1));
  if (!Number.isFinite(value)) throw new Error(`Invalid LCOV record: ${line}`);
  return value;
}

function ratio(hit: number, found: number): number {
  return found === 0 ? 1 : hit / found;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
