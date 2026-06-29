# js-game-zero Engineering Design

## Summary

`js-game-zero` is a clean-room JavaScript framework for teaching browser game
development with a Pygame Zero-like model. It must be beginner friendly, browser
native, MIT licensed, and behavior-compatible with Pygame Zero's documented
surface without copying LGPL implementation code.

## Architecture

- `packages/core` implements the framework primitives: `run`, `Actor`, `Rect`,
  `ZRect`, `Screen`, loaders, input, clock, animation, audio, tone, and storage.
- `packages/browser-runtime` wraps learner code so both zero-boilerplate globals
  and explicit imports are supported.
- `apps/sandbox` is a Bun-backed web IDE that creates local project directories,
  edits files, accepts assets, and plays the game in a preview pane.
- `examples` contains browser-playable projects that are also e2e smoke fixtures.
- `docs/phases` defines phase-specific specifications and verification criteria.

## Public API

The public core export surface is:

```ts
run, Actor, Rect, ZRect, Screen, screen, clock, Clock, animate, Animation,
keyboard, KeyboardState, keys, keymods, mouse, images, sounds, music, tone,
storage, Storage, exit
```

The zero-boilerplate runtime injects those names plus standard hooks:

```ts
WIDTH, HEIGHT, TITLE, ICON, draw, update, on_mouse_down, on_mouse_up,
on_mouse_move, on_key_down, on_key_up, on_music_end
```

Import mode accepts camelCase hook aliases for idiomatic JS:

```ts
onMouseDown, onMouseUp, onMouseMove, onKeyDown, onKeyUp, onMusicEnd
```

## Runtime Model

- The browser owns a single visible `<canvas>` per game run.
- `requestAnimationFrame` drives update/draw with `dt` in seconds.
- The game can be configured through globals or `run({ ...hooks })`.
- Input events update `keyboard` state before user hooks run.
- Assets load from a project root with conventional `images`, `sounds`,
  `music`, and `fonts` directories.
- Drawing uses Canvas 2D. Audio uses Web Audio and HTML audio elements.
- Storage defaults to `localStorage` in browser mode and to project JSON files
  when the Bun sandbox adapter is active.

## Clean-Room License Boundary

Pygame Zero's upstream implementation is LGPL-3.0. This project is MIT. Public
documentation, observable behavior, and tests may guide compatibility, but code,
comments, structure, and assets from upstream are not copied into this repo.
Where an algorithm is common and simple, it is implemented from first principles
and covered with independent tests.

## Sandbox Design

The sandbox uses Bun for server-side filesystem operations and static serving.
It exposes JSON endpoints for:

- project creation and listing
- file read/write
- asset upload
- preview page serving
- runtime bundle serving
- diagnostics and reload metadata

Filesystem operations are scoped under `.jgz-projects` by default and reject
path traversal. The preview runs learner code in an isolated iframe and reports
runtime errors back to the editor.

## Verification Criteria

- Unit tests cover each public API behavior listed in `docs/feature-parity.md`.
- Browser e2e tests launch the sandbox, run examples, interact with canvas input,
  and verify visible/nonblank rendering plus console health.
- Docs checks confirm every phase spec exists and contains verification criteria.
- CI runs typecheck, unit tests, docs checks, and Playwright Chromium tests.
