# Phase 03: Rendering, Assets, And Actor

## Implementation Steps

- Implement `Screen` around Canvas 2D with clear, fill, gradient fill, blit,
  bounds, and drawing primitives.
- Implement text and textbox drawing with common beginner options.
- Implement image, sound, music, and font loaders with cache/unload APIs and
  lowercase portable path validation.
- Implement `Actor` with image assignment, position keywords, anchor, angle,
  opacity, rectangle delegation, `angle_to`, `distance_to`, and `draw`.

## Verification Criteria

- Unit: drawing helpers validate arguments and call the expected canvas APIs.
- Unit: loader caches can load, unload one resource, and unload all resources.
- Unit: actor position, anchor, angle, opacity, and collision behavior is
  deterministic.
- E2E: an example using an SVG sprite renders a nonblank canvas, moves an
  actor, changes opacity, and reports collision state.
