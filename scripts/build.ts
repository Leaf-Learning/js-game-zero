const builds = [
  {
    entrypoints: ["packages/core/src/index.ts"],
    outdir: "packages/core/dist",
    target: "browser" as const,
    format: "esm" as const,
  },
  {
    entrypoints: ["packages/browser-runtime/src/index.ts"],
    outdir: "packages/browser-runtime/dist",
    target: "browser" as const,
    format: "esm" as const,
  },
  {
    entrypoints: ["packages/browser-runtime/src/browser.ts"],
    outdir: "packages/browser-runtime/dist/browser",
    target: "browser" as const,
    format: "iife" as const,
  },
];

for (const build of builds) {
  const result = await Bun.build(build);
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

console.log("Built js-game-zero packages.");

export {};
