# js-game-zero

`js-game-zero` is a clean-room, MIT-licensed JavaScript framework inspired by
Pygame Zero's beginner-friendly programming model. It lets new game developers
write tiny browser games with either PGZero-like globals or normal JavaScript
imports.

```js
WIDTH = 800;
HEIGHT = 600;

let alien = new Actor("alien", { center: [400, 300] });

function draw() {
  screen.clear();
  alien.draw();
}

function update() {
  if (keyboard.left) alien.x -= 3;
  if (keyboard.right) alien.x += 3;
}
```

## Requirements

- Bun 1.3+
- Node-compatible shell for local development
- Chromium for Playwright browser verification

## Common Commands

```sh
bun install
bun test
bun run test:e2e
bun run build
bun run dev:sandbox
```

Open the sandbox at `http://localhost:4173`.

## Packages

- `packages/core` - rendering, actors, geometry, input, animation, audio, and storage.
- `packages/browser-runtime` - zero-boilerplate code wrapper and browser runner.
- `apps/sandbox` - Bun-backed local project editor and preview server.
- `examples` - browser-playable examples and assets.

## License And Upstream Compatibility

This project is MIT licensed. It targets behavior compatibility with Pygame
Zero's public API and documentation, but it is not a source-code translation of
Pygame Zero, whose upstream implementation is LGPL-3.0.
