# Phase 02: Core Semantics

## Implementation Steps

- Implement `Rect` and `ZRect` with pygame-style geometry properties and
  collision methods.
- Implement `keys`, `keymods`, `mouse`, and `keyboard`.
- Implement event dispatch helpers that map browser events to hook arguments.
- Implement `Clock`, one-shot and interval scheduling, unique scheduling,
  unscheduling, and per-tick callbacks.
- Implement `animate`, `Animation`, all documented tween names, and target
  replacement behavior.

## Verification Criteria

- Unit: rect property setters, collision, clipping, union, movement, and
  normalization tests pass.
- Unit: keyboard state can be queried by lowercase names and key constants.
- Unit: clock fires scheduled callbacks in deterministic tick order.
- Unit: animation tweens scalar, tuple, and array values and supports `stop`.
- E2E: a browser game reacts to key press, mouse click, and scheduled callback
  events and reports the expected state.
