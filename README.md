# js-game-zero

`js-game-zero` is a clean-room, LGPL-3.0-only JavaScript framework inspired by
[Pygame Zero](https://github.com/lordmauve/pgzero)'s beginner-friendly
programming model. It lets new game developers write tiny browser games with
either PGZero-like globals or normal JavaScript imports.

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

## Install

```sh
bun install --frozen-lockfile
bunx playwright install chromium
```

Use plain `bun install` while iterating locally if you intentionally need to
update `bun.lock`.

## Common Commands

```sh
bun run lint
bun test
bun run docs:check
bun run test:e2e
bun run build
bun run dev:sandbox
```

Open the sandbox at `http://localhost:4173`.

## Try An Example

Start the sandbox server and open the example index:

```sh
bun run dev:sandbox
```

Then visit `http://localhost:4173/examples`. The shipped examples cover drawing
basics, actor movement, sound and tone, storage, and an explicit import-mode
starter.

## Sandbox Workflow

The sandbox is a local editor and preview runner. Create a project, edit
`main.js`, add assets under `images`, `sounds`, `music`, or `fonts`, then press
Play to reload the iframe preview. For isolated test runs, provide an explicit
project root:

```sh
bun run dev:sandbox -- --projects-root .jgz-projects
```

See [docs/sandbox.md](docs/sandbox.md) for route details and the browser e2e
workflow.

## Documentation

- [API reference](docs/api.md)
- [Tutorials](docs/tutorials.md)
- [Feature parity matrix](docs/feature-parity.md)
- [Engineering design](docs/engineering-design.md)
- [Implementation plan](docs/implementation-plan.md)

## Packages

- `packages/core` - rendering, actors, geometry, input, animation, audio, and storage.
- `packages/browser-runtime` - zero-boilerplate code wrapper and browser runner.
- `apps/sandbox` - Bun-backed local project editor and preview server.
- `examples` - browser-playable examples and assets.

Package bundles are emitted with `bun run build` into each package's ignored
`dist` directory. The build is part of the local gate and GitHub Actions CI.

## Verification

`bun run check` runs lint, unit tests, and docs checks. The complete release
gate is:

```sh
bun run check
bun run build
bun run test:e2e
```

CI mirrors that gate with a frozen Bun install and a Chromium install before
browser tests.

## License And Upstream Compatibility

This project is licensed under GNU LGPL version 3 only (`LGPL-3.0-only`), in
line with upstream [Pygame Zero](https://github.com/lordmauve/pgzero). It targets
behavior compatibility with Pygame Zero's public API and documentation, but it is
not a source-code translation of Pygame Zero. Project source, examples, tests,
docs, and package assets are authored for this repository; CI includes a
clean-room check that rejects copied upstream source markers in package source
and example assets.
