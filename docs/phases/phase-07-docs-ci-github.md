# Phase 07: Docs, CI, And GitHub

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
- README includes install, test, sandbox, example, build, license, and clean-room
  compatibility notes.
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
- License tests verify project-authored files are MIT and no LGPL upstream code
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
