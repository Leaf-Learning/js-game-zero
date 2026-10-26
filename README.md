<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/logo-lockup-dark.svg">
    <img src="docs/media/logo-lockup-light.svg" alt="js-game-zero" width="420">
  </picture>
</h1>

[![CI](https://github.com/Leaf-Learning/js-game-zero/actions/workflows/ci.yml/badge.svg)](https://github.com/Leaf-Learning/js-game-zero/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@js-game-zero/browser-runtime)](https://www.npmjs.com/package/@js-game-zero/browser-runtime)

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

let ship = new Actor("player.svg", { midBottom: [240, 350] });

function update(dt) {
  if (keyboard.left) ship.x -= 220 * dt;
  if (keyboard.right) ship.x += 220 * dt;
}

function draw() {
  screen.fill("#0b1220", "#132a43");
  ship.draw();
  screen.draw.filledCircle([240, 60], 16, "gold"); // a comet to catch
}
```

That's a complete, runnable game file. Build the rest of it — catching
comets, sound, a score, win/lose — in [the tutorial](docs/tutorial.md).

Games can also use [touch controls](docs/reference/hooks.md#touch-controls):
add `TOUCH_CONTROLS = { left: keys.LEFT, right: keys.RIGHT, a: keys.SPACE }`
to show buttons on touch devices, using the same keyboard actions. Canvas
taps and drags work with the existing mouse hooks too.

![The sandbox running a game, with the code, the game, and Messages visible](docs/media/main-view-running-game.png)

## Quickstart

```sh
git clone https://github.com/Leaf-Learning/js-game-zero.git
cd js-game-zero
bun install
bun run dev:sandbox
```

Then open **http://127.0.0.1:4173**, the address it prints, in your browser —
that's the sandbox, a local code editor and live preview with no account or
internet connection required after install.

## A game in one web page

To try it with nothing to install, save this as `my-game.html`, open it in
your browser, and press the arrow keys. It loads js-game-zero from
[jsDelivr](https://www.jsdelivr.com/package/npm/@js-game-zero/browser-runtime),
so it needs an internet connection.

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>My game</title>
    <script src="https://cdn.jsdelivr.net/npm/@js-game-zero/browser-runtime@0.2/dist/browser/browser.js"></script>
  </head>
  <body>
    <script id="game" type="text/plain">
      WIDTH = 480;
      HEIGHT = 360;

      let x = 240;

      function update(dt) {
        if (keyboard.left) x -= 200 * dt;
        if (keyboard.right) x += 200 * dt;
      }

      function draw() {
        screen.fill("navy");
        screen.draw.filledCircle([x, 180], 30, "gold");
      }
    </script>
    <pre id="problems"></pre>
    <script>
      JGZ.run(document.getElementById("game").textContent, {
        // Anything that goes wrong shows up on the page.
        diagnostics(problem) {
          document.getElementById("problems").textContent +=
            problem.message + "\n";
        },
      });
    </script>
  </body>
</html>
```

Change the game's code and reload the page to try it. [Getting
started](docs/getting-started.md#a-game-in-one-web-page) says more, including
how to use images and sounds.

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
- [**Game verification CLI**](docs/cli.md) — drive input and ticks, inspect
  state, and capture screenshots from agents or the terminal.
- [**Examples**](docs/examples.md) — every shipped example game, including
  five complete games.
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
bun run jgz -- test examples/snake
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

Three packages are on npm, released together at one version:

- [`@js-game-zero/core`](https://www.npmjs.com/package/@js-game-zero/core)
  (`packages/core`) — rendering, actors, geometry, input, animation, audio,
  and storage: the framework itself, with its API reference
  (`@js-game-zero/core/reference`).
- [`@js-game-zero/browser-runtime`](https://www.npmjs.com/package/@js-game-zero/browser-runtime)
  (`packages/browser-runtime`) — the zero-boilerplate wrapper that injects
  globals and runs learner code, with the script-tag build used above.
- [`@js-game-zero/cli`](https://www.npmjs.com/package/@js-game-zero/cli)
  (`packages/cli`) — the browser-backed `jgz` verification and automation CLI.

To use one in a project of your own:

```sh
bun add @js-game-zero/browser-runtime
# or
npm install @js-game-zero/browser-runtime
```

The rest of the repository isn't published:

- `apps/sandbox` — the Bun-backed local project editor and preview server.
- `examples` — playable example games and their assets.

## License and credits

`js-game-zero` is released under the MIT License — see [`LICENSE`](LICENSE).
It is written from scratch, but its naming, API shape, and behavior follow
[Pygame Zero](https://github.com/lordmauve/pgzero)'s beginner-friendly model
closely on purpose, credited here rather than claimed as our own invention.
It contains no Pygame Zero code. The tweens' easing curves are
[Robert Penner's easing equations](http://robertpenner.com/easing/), used
under his MIT terms, and text wrapping is ported from Christopher Night's
[pygame-text](https://github.com/cosmologicon/pygame-text), which is in the
public domain (CC0).

Example games use free [CC0-licensed assets from kenney.nl](https://kenney.nl/),
which requires no attribution but is credited here out of respect for the
work. The sandbox is set in [Fredoka](https://github.com/hafontia/Fredoka-One),
[Nunito](https://github.com/googlefonts/nunito) and
[JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), each under the
SIL Open Font License 1.1, and the logo's wordmark is drawn from Fredoka.

Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the dev
setup, test commands, and PR expectations.
