# Phase 01: Repo, Tooling, And Docs

## Implementation Steps

- Initialize the workspace as a git repo.
- Install or verify Bun.
- Add MIT license, `.gitignore`, root `package.json`, TypeScript config,
  Playwright config, build/docs scripts, and GitHub Actions CI.
- Create package workspaces for core, browser runtime, and sandbox.
- Create the top-level engineering design, implementation plan, parity matrix,
  API reference, sandbox guide, tutorials, and all phase spec files.

## Verification Criteria

- Unit: `bun test` can discover tests without package resolution failures.
- Unit: `bun run docs:check` confirms all required docs and phase specs exist.
- E2E: Playwright configuration can start the Bun sandbox server.
- Manual: `bun --version` returns a supported version.
