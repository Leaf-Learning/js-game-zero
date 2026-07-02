import { resolve } from "node:path";

/**
 * Shared, isolated on-disk root for sandbox projects created while the
 * Playwright suite's single shared `webServer` (see playwright.config.ts) is
 * running. Both playwright.config.ts (which passes this to the sandbox
 * server's `--projects-root` flag) and any spec that inspects created
 * projects directly on disk (see tests/e2e/sandbox.pw.ts) import this same
 * constant, so e2e project churn never touches a developer's real
 * `.jgz-projects` (the default used by `bun run dev:sandbox`).
 */
export const e2eProjectsRoot = resolve(
  process.cwd(),
  ".tmp",
  "e2e-projects-root",
);
