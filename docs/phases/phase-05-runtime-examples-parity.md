# Phase 05: Runtime, Examples, And Parity

## Implementation Steps

- Implement zero-boilerplate code execution with injected framework globals.
- Implement explicit import mode through core package exports.
- Add diagnostics for likely hook and constant typos.
- Port representative playable examples: drawing basics, actor movement,
  sound/tone, and sandbox starter project.
- Keep `docs/feature-parity.md` current as features and tests land.

## Verification Criteria

- Unit: zero-boilerplate fixtures expose `draw`, `update`, dimensions, and hooks.
- Unit: import-mode fixtures can call `run` with hook objects.
- Unit: diagnostics suggest likely names for common beginner mistakes.
- E2E: every shipped example loads in the browser, has no console errors, and
  produces a nonblank canvas or a deterministic state marker.
