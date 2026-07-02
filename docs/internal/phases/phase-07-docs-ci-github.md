# Phase 07: Docs, CI, And GitHub

> Status: Complete

## Summary

Finish public documentation, CI, package build artifacts, and private GitHub
publishing. This phase does not add new framework behavior; it proves the
completed system can be used, tested, and reviewed.

## Implementation Steps

- Finish README, API docs, tutorials, sandbox docs, phase specs, and parity
  matrix.
- Ensure CI runs typecheck, unit tests, docs checks, and browser e2e tests.
- Build package bundles.
- Initialize the local git repo, commit implementation files, and create/push a
  private GitHub repository named `js-game-zero` using the authenticated `gh`
  CLI account.
- README includes install, test, sandbox, example, build, license, and
  upstream-compatibility notes.
- Tutorials include runnable snippets for drawing, actors/input, sound/tone,
  storage, and sandbox workflow.
- CI installs Bun, installs dependencies with a frozen lockfile, runs
  `bun run lint`, `bun test`, `bun run docs:check`, `bun run build`, installs
  Playwright Chromium, and runs `bun run test:e2e`.
- GitHub publishing uses `gh repo create js-game-zero --private --source .` or
  equivalent, then verifies visibility.

## Unit Verification

- Docs checker validates required files, required phase sections, no unfinished
  markers, and links to phase specs.
- Tutorial code extraction tests execute or compile every fenced JavaScript
  tutorial snippet.
- README command smoke tests verify documented commands exist in `package.json`.
- License tests verify project manifests are LGPL-3.0-only and no upstream code
  or assets were copied into package source.

## E2E Verification

- Playwright launches each tutorial-backed example from docs and confirms the
  expected visible or state-marker result.
- Playwright launches the sandbox guide workflow from a clean project root.
- CI e2e proves the same browser checks run outside the local machine.

## Exit Criteria

- `bun run check`, `bun run build`, and `bun run test:e2e` pass locally.
- CI is green on GitHub.
- `git remote -v` points to the private GitHub repo and `gh repo view
js-game-zero --json visibility` reports `PRIVATE`.
- `git status --short` is clean after commit/push.

## Verification Criteria

- Documentation, examples, CI, and private GitHub publishing are all verified
  with executable tests or concrete CLI checks, not manual inspection alone.

## Implementation notes

- Expanded README, API, tutorial, sandbox, phase, and parity docs to cover
  install, commands, examples, sandbox workflow, build output, license, and
  upstream-compatibility notes.
- Added docs checks for required docs, complete phase status/sections, Markdown
  phase links, README command smoke coverage, tutorial snippet compilation,
  tutorial routes, CI step order, build metadata, LGPL package licenses, and
  copied upstream source markers.
- Added the `storage-save` example plus Playwright coverage for tutorial-backed
  example routes and a clean-root sandbox guide workflow with an isolated
  sandbox server.
- Updated CI to use a frozen Bun install, lint/typecheck, unit tests, docs
  checks, build, Playwright Chromium installation with dependencies, and e2e.
- Created and pushed the private `js-game-zero` GitHub repository with `gh`;
  `gh repo view js-game-zero --json visibility` reported `PRIVATE`.
- Critic feedback tightened the phase status checker, private remote
  verification, Markdown link parsing, and sandbox e2e root isolation. The final
  critic pass found only the GitHub Actions run blocked before startup by the
  account Actions budget; local frozen install, checks, build, e2e, and
  independent browser verification were run manually, matching the user-approved
  exception for Actions budget failures.
