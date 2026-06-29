# API Reference

## Summary

This document describes the learner-facing API exposed by `@js-game-zero/core`
and by the zero-boilerplate browser runtime.

## Globals And Imports

Zero-boilerplate games can use globals such as `Actor`, `screen`, `keyboard`,
`clock`, `sounds`, `music`, `tone`, `storage`, `WIDTH`, `HEIGHT`, and lifecycle
functions. Import-mode games can import the same symbols:

```js
import { run, Actor, keyboard, screen } from "@js-game-zero/core";
```

## Core Types

- `Rect` and `ZRect` implement pygame-style rectangle positioning, collision,
  moving, inflating, clipping, clamping, and union operations.
- `Screen` wraps a canvas with `clear`, `fill`, `blit`, `bounds`, and `draw`.
- `Actor` wraps an image and a rectangle with anchor positioning, rotation,
  opacity, collision methods, `angle_to`, `distance_to`, and `draw`.
- `Clock` supports `schedule`, `schedule_unique`, `schedule_interval`,
  `unschedule`, `each_tick`, and `tick`.
- `animate` creates an `Animation` using tween names compatible with PGZero.

## Verification Criteria

- API examples in README and tutorials must compile or execute in tests.
- Each exported symbol must be covered by at least one unit smoke test.
- Browser e2e tests must verify the zero-boilerplate and import-mode paths.
