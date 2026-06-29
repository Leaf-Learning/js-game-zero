# Phase 07: Docs, CI, And GitHub

## Implementation Steps

- Finish README, API docs, tutorials, sandbox docs, phase specs, and parity
  matrix.
- Ensure CI runs typecheck, unit tests, docs checks, and browser e2e tests.
- Build package bundles.
- Initialize the local git repo, commit implementation files, and create/push a
  private GitHub repository named `js-game-zero` using the authenticated `gh`
  CLI account.

## Verification Criteria

- Unit: docs checker passes and confirms each phase spec has verification
  criteria.
- Unit: README/tutorial snippets are represented by tests or examples.
- E2E: Playwright examples and sandbox workflow pass.
- Release: `git remote -v` points to a private GitHub repo and `gh repo view`
  confirms visibility is private.
