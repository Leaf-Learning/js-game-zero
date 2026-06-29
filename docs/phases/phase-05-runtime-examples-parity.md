# Phase 05: Runtime, Examples, And Parity

## Summary

Finish the learner entry modes, diagnostics, examples, and parity matrix. This
phase makes the framework usable without the sandbox project editor.

## Implementation Steps

- Implement zero-boilerplate code execution with injected framework globals.
- Implement explicit import mode through core package exports.
- Add diagnostics for likely hook and constant typos.
- Port representative playable examples: drawing basics, actor movement,
  sound/tone, and sandbox starter project.
- Keep `docs/feature-parity.md` current as features and tests land.
- Zero-boilerplate execution wraps learner code in an isolated module scope and
  injects only documented globals.
- Explicit import mode exports `run` and all core symbols from package names,
  with no reliance on global state outside the selected game handle.
- Diagnostics warn for misspelled hooks/constants, wrong `draw` parameters,
  invalid `update` arity, duplicate globals/import options, and common asset
  naming mistakes.
- Examples must be deterministic enough for smoke assertions and include
  `window.__jgzExampleStatus` markers for e2e.

## Unit Verification

- Runtime tests compile and execute zero-boilerplate fixtures with `WIDTH`,
  `HEIGHT`, `TITLE`, `draw`, `update`, and input hooks.
- Import-mode tests call `run({ ...hooks })` and verify hook lifecycle, canvas
  sizing, event listener cleanup, and no leaked globals.
- Diagnostic tests cover hook typos, constants typos, invalid function arity,
  asset names, and duplicate configuration.
- Example manifest tests verify every example has a title, entry point, asset
  list, smoke marker, README/tutorial link, and e2e scenario.

## E2E Verification

- Playwright launches every shipped example from an example index page.
- For each example, tests assert no console/page errors, nonblank canvas when
  visual, deterministic status marker, and at least one user interaction where
  the example expects input.
- Runtime e2e covers both zero-boilerplate global mode and explicit import mode.

## Exit Criteria

- All feature rows in `docs/feature-parity.md` are either covered or explicitly
  linked to the later sandbox/docs phase.
- Examples are playable through a static browser route without the sandbox app.
- Earlier phase tests still pass.

## Verification Criteria

- Both learner entry modes are covered by unit and Playwright e2e tests, and
  every example has a deterministic browser smoke assertion.
