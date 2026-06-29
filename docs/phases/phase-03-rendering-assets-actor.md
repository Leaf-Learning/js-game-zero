# Phase 03: Rendering, Assets, And Actor

## Summary

Add the browser rendering layer, resource loaders, text rendering, and Actor
behavior on top of Phase 2 semantics. This phase makes simple games visible and
asset-backed but does not add audio playback or sandbox project editing.

## Implementation Steps

- Implement `Screen` around Canvas 2D with clear, fill, gradient fill, blit,
  bounds, and drawing primitives.
- Implement text and textbox drawing with common beginner options.
- Implement image, sound, music, and font loaders with cache/unload APIs and
  lowercase portable path validation.
- Implement `Actor` with image assignment, position keywords, anchor, angle,
  opacity, rectangle delegation, `angle_to`, `distance_to`, and `draw`.
- Define loader roots by project id and asset base URL; do not allow `..`,
  absolute paths, mixed-case file names, or names that start with a digit.
- Implement a `SurfaceLike` wrapper for images with `get_width`, `get_height`,
  `get_size`, and `get_rect`.
- Text APIs implement documented options with browser-stable behavior:
  positioning, wrapping, alignment, outline, shadow, gradient, alpha, anchor,
  rotation, and textbox font-size fitting.
- Actor constructor accepts exactly one position source; mixed `pos` and
  symbolic positions throw `TypeError`.

## Unit Verification

- Canvas mock tests assert every `Screen.draw` primitive validates inputs and
  calls the expected Canvas 2D operation.
- Gradient tests inspect sampled pixels on a small test canvas.
- Loader tests cover valid names, invalid names, missing assets, cache hits,
  `unload(name)`, `unload_all()`, nested directories, and surface dimensions.
- Text tests cover option normalization and textbox fit decisions with a mocked
  measureText surface.
- Actor tests cover default `topleft`, explicit `pos`, every symbolic position,
  anchor strings/numbers, angle bounding-box math, opacity clamp, image swap,
  distance/angle math, collision delegation, and invalid keyword errors.

## E2E Verification

- Playwright launches drawing, text, loader, and actor examples.
- Tests read canvas pixels from known regions to prove clear/fill/shape/blit
  behavior, while allowing browser text antialiasing variance.
- Actor e2e verifies sprite render, movement after keyboard input, opacity
  state, rotation bounding rect state, and collision output in `window.__jgzTest`.

## Exit Criteria

- All Phase 2 tests still pass.
- New rendering/loader/actor unit tests pass in Bun.
- New Playwright examples pass in Chromium with no console/page errors.
- Browser examples use repo-owned MIT-compatible assets.

## Verification Criteria

- Each rendering, asset, text, and actor feature in the parity matrix has both a
  unit test and a browser e2e assertion.
