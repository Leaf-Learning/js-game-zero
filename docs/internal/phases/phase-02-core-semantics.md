# Phase 02: Core Semantics

> Status: Complete

## Summary

Implement the framework's pure runtime semantics: geometry, input constants,
keyboard state, event mapping, clock scheduling, and animation. Rendering,
assets, audio, and sandbox project editing remain out of scope except for test
fixtures needed to drive browser events.

## Implementation Steps

- Implement `Rect` and `ZRect` with pygame-style geometry properties and
  collision methods.
- Implement `keys`, `keymods`, `mouse`, and `keyboard`.
- Implement event dispatch helpers that map browser events to hook arguments.
- Implement `Clock`, one-shot and interval scheduling, unique scheduling,
  unscheduling, and per-tick callbacks.
- Implement `animate`, `Animation`, all documented tween names, and target
  replacement behavior.
- Add explicit camelCase aliases only where documented: `scheduleUnique`,
  `scheduleInterval`, and import-mode hook aliases.
- Define error behavior: invalid rect constructor shapes throw `TypeError`;
  unknown keys return false through `keyboard.<name>` but invalid constants fail
  tests; unknown tweens throw an error that includes the requested tween name and
  nearest suggestion when one exists.
- Preserve PGZero half-open collision semantics and `angle_to` coordinate
  conventions in math helpers consumed later by Actor.

## Unit Verification

- Rect tests cover every position getter/setter, size mutation, move/move_ip,
  inflate/inflate_ip, clamp, clip, union, unionall, fit, normalize, contains,
  collidepoint, colliderect, collidelist, and collidelistall.
- Keyboard tests cover lower-case attributes, `enter` alias, key constants,
  press/release/clear, modifier bitmasks, and unsupported keys.
- Event dispatch tests cover mouse down/up/move, relative motion, pressed button
  sets, key down/up, unicode text, modifier flags, and skipped unsupported keys.
- Clock tests cover schedule order, repeated intervals, unique reschedule,
  unschedule of all matching callbacks, per-tick callbacks, and deterministic
  behavior across large `dt` jumps.
- Animation tests cover all tween names, scalar and tuple/array targets,
  replacement of an existing animation on the same target property, `stop(false)`,
  `stop(true)`, and `on_finished`.

## E2E Verification

- Playwright loads a browser fixture that logs runtime state into
  `window.__jgzTest`.
- The test presses arrow/letter keys, clicks and drags the mouse, waits for a
  clock callback, and asserts the fixture observed the expected hook arguments
  and keyboard state.
- The fixture runs an animation for multiple frames and asserts a visible or
  exposed numeric state change from start to target.

## Exit Criteria

- `bun test packages/core/test` passes the semantic test suite.
- The Phase 2 Playwright fixture passes in Chromium with no console/page errors.
- No Canvas drawing, asset loading, audio, or sandbox project CRUD APIs are
  introduced in this phase.

## Verification Criteria

- Every public semantic method listed in `docs/api.md` has at least one unit
  test and at least one browser-observed behavior where applicable.

## Implementation notes

Phase 02 implements the core pure runtime semantics in `@js-game-zero/core`:
`Rect`/`ZRect` geometry, PGZero-style half-open collision checks, the
`angleTo` and `distanceTo` math helpers for later Actor work, key/mouse/modifier
constants, proxy-backed keyboard state, browser event mapping and hook dispatch,
`Clock` scheduling, and `animate`/`Animation` with documented tweens,
replacement behavior, stop behavior, and target interpolation.

The implementation adds the documented JavaScript aliases for
`scheduleUnique`, `scheduleInterval`, and import-mode camelCase input hooks
while preserving snake_case PGZero-style APIs. Error behavior is covered for bad
rect constructor shapes, unknown keyboard attributes, invalid key constants, and
unknown tween names with nearest-name suggestions.

Verification now includes focused core tests for geometry, keyboard/input,
event dispatch, clock scheduling, and animation behavior, plus a Playwright
Phase 2 fixture at `/phase-two` that observes real browser key presses, mouse
click/drag movement, a scheduled clock callback, and an animation reaching its
target through `window.__jgzTest`.

The independent critic passed on the first iteration. It raised only
non-blocking notes about extra legacy tween-name aliases and a few coverage
strengthening opportunities; no required implementation or test changes were
requested.
