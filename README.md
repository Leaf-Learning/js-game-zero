# js-game-zero

[![CI](https://github.com/taharafiq/js-game-zero/actions/workflows/ci.yml/badge.svg)](https://github.com/taharafiq/js-game-zero/actions/workflows/ci.yml)

`js-game-zero` teaches kids and other beginners how to build browser games
in JavaScript, with as little boilerplate as possible. Declare `WIDTH` and
`HEIGHT`, write a `draw()` function, and you have a game window — no build
step, no canvas setup, no game loop to hand-write. It's inspired by
[Pygame Zero](https://github.com/lordmauve/pgzero)'s beginner-friendly model
and brings the same idea — and much of the same vocabulary — to the browser.

```js
WIDTH = 480;
HEIGHT = 360;
TITLE = "Comet Catcher";

let ship = new Actor("player.svg", { midbottom: [240, 350] });

function update(dt) {
  if (keyboard.left) ship.x -= 220 * dt;
  if (keyboard.right) ship.x += 220 * dt;
}

function draw() {
  screen.fill("#0b1220", "#132a43");
  ship.draw();
  screen.draw.filled_circle([240, 60], 16, "gold"); // a comet to catch
}
```

That's a complete, runnable game file. Build the rest of it — catching
comets, sound, a score, win/lose — in [the tutorial](docs/tutorial.md).

![The sandbox running a game, with the editor, asset panel, and live preview visible](docs/media/main-view-running-game.png)

## Quickstart

```sh
git clone https://github.com/taharafiq/js-game-zero.git
cd js-game-zero
bun install
bun run dev:sandbox
```

Then open **http://localhost:4173** in your browser — that's the sandbox, a
local code editor and live preview with no account or internet connection
required after install.

## Learn more

- [**Getting started**](docs/getting-started.md) — install/run paths for
  learners and teachers, plus troubleshooting.
- [**Tutorial**](docs/tutorial.md) — build a complete game from scratch,
  step by step.
- [**Cookbook**](docs/cookbook.md) — short recipes for specific tasks
  (drawing, sound, saving data, the mouse wheel, and more).
- [**API reference**](docs/reference/) — every symbol, with a signature,
  explanation, and example.
- [**Sandbox guide**](docs/sandbox.md) — a tour of the editor UI.
- [**Examples**](docs/examples.md) — every shipped example game, including
  two complete arcade games.
- [**Migrating from Pygame Zero**](docs/migrating-from-pgzero.md) — a
  cheat sheet for teachers moving between the two.

## Requirements

- [Bun](https://bun.sh) 1.3+ — the only tool you need to install; it's the
  package manager, test runner, and the server the sandbox runs on.
- A Chromium-based browser, for playing games and (if contributing) running
  the browser test suite.

## Common commands

```sh
bun run dev:sandbox
bun run format
bun run check
bun run build
bun run test:e2e
```

`bun run check` runs the same lint/unit-test/docs-check gate as CI;
`bun run test:e2e` runs the full browser test suite (Playwright, Chromium)
and needs a browser installed once via `bunx playwright install chromium`.
See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full development workflow.

## Packages

- `packages/core` — rendering, actors, geometry, input, animation, audio,
  and storage: the framework itself.
- `packages/browser-runtime` — the zero-boilerplate wrapper that injects
  globals and runs learner code.
- `apps/sandbox` — the Bun-backed local project editor and preview server.
- `examples` — playable example games and their assets.

## License and credits

`js-game-zero` is licensed under the GNU Lesser General Public License
version 3 only (`LGPL-3.0-only`) — see [`LICENSE`](LICENSE). It is a
reimplementation inspired by and derived in part from
[Pygame Zero](https://github.com/lordmauve/pgzero), which is itself
LGPL-3.0; this project's naming, API shape, and beginner-friendly model
follow Pygame Zero closely on purpose, credited here rather than claimed as
independent invention.

Example games use free [CC0-licensed assets from kenney.nl](https://kenney.nl/),
which requires no attribution but is credited here out of respect for the
work.

Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the dev
setup, test commands, and PR expectations.
