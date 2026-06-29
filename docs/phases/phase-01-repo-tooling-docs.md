# Phase 01: Repo, Tooling, And Docs

## Summary

Bootstrap the repository and write the planning artifacts only. This phase must
not implement framework mechanics beyond smoke scaffolding required to verify
workspace/package/server wiring.

## Implementation Steps

- Initialize the workspace as a git repo.
- Install or verify Bun.
- Add MIT license, `.gitignore`, root `package.json`, TypeScript config,
  Playwright config, build/docs scripts, lint/format/test scripts, and GitHub
  Actions CI.
- Create package workspaces for core, browser runtime, and sandbox.
- Create the top-level engineering design, implementation plan, parity matrix,
  API reference, sandbox guide, tutorials, and all phase spec files.
- Add minimal smoke exports only: package name/version markers and a scaffold
  sandbox canvas route. Do not add Rect, Actor, clock, input, loader, animation,
  audio, storage, or sandbox project CRUD behavior in this phase.

## Unit Verification

- `bun test` imports `@js-game-zero/core` and
  `@js-game-zero/browser-runtime` by package name to prove workspace export maps
  work.
- A sandbox unit test calls the real Phase 1 request handler and asserts
  `GET /api/health` returns HTTP 200 with `{ ok: true, phase: 1 }`.
- `bun run docs:check` confirms every required document exists, each phase has
  unit/e2e/exit criteria, and no unfinished marker text is present.
- `bun run lint` runs TypeScript and non-mutating Prettier checks.

## E2E Verification

- `bun run test:e2e` starts the Bun sandbox with Playwright.
- Playwright loads `/`, checks the title and heading, captures console errors
  and page errors, reads the canvas pixel buffer directly, and requires at least
  one nontransparent/nonzero painted pixel.

## Exit Criteria

- `bun --version`, `bun run lint`, `bun test`, `bun run docs:check`,
  `bun run build`, and `bun run test:e2e` all pass.
- Manual: `bun --version` returns a supported version.
- `git status --short` contains only intentional Phase 1 source changes before
  commit and no generated `dist`, `test-results`, or `playwright-report` files.

## Verification Criteria

- The Phase 1 commit demonstrates repository/tooling readiness without shipping
  any later-phase framework behavior.
- CI and local scripts exercise the same gates, except CI additionally installs
  Playwright Chromium before browser e2e tests.
