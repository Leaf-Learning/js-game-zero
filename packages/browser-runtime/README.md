<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Leaf-Learning/js-game-zero/main/docs/media/logo-lockup-dark.svg">
  <img src="https://raw.githubusercontent.com/Leaf-Learning/js-game-zero/main/docs/media/logo-lockup-light.svg" alt="js-game-zero" width="280">
</picture>

# @js-game-zero/browser-runtime

The zero-boilerplate runtime for
[js-game-zero](https://github.com/Leaf-Learning/js-game-zero). Declare `WIDTH`
and `HEIGHT`, write a `draw()` function, and you have a game window: no build
step, no canvas setup, no game loop to write.

```js
WIDTH = 480;
HEIGHT = 360;

let ship = new Actor("player.svg", { midBottom: [240, 350] });

function update(dt) {
  if (keyboard.left) ship.x -= 220 * dt;
  if (keyboard.right) ship.x += 220 * dt;
}

function draw() {
  screen.fill("#0b1220", "#132a43");
  ship.draw();
}
```

```sh
bun add @js-game-zero/browser-runtime
# or
npm install @js-game-zero/browser-runtime
```

## Use

`run()` takes a game's source as a string and runs it with the framework's
globals (`Actor`, `screen`, `keyboard`, `clock` and the rest) in its own scope:

```js
import { run } from "@js-game-zero/browser-runtime";

run(`
  WIDTH = 320;
  HEIGHT = 180;
  function draw() { screen.fill("navy"); }
`);
```

The package re-exports [`@js-game-zero/core`](https://www.npmjs.com/package/@js-game-zero/core),
so import-mode games and `defineGame()` work from here too.

## Script tag

`@js-game-zero/browser-runtime/iife` (the file `dist/browser/browser.js`) is one
self-contained script for pages with no bundler. It puts the whole API on
`window.JGZ`, with the host APIs a page needs to start, drive and read a game
it runs: `loadImages`, `getGameInspector`, `serializeGameValue`,
`parseStatePath` and `createSeededRandom`.

Load it from a CDN such as jsDelivr, or copy the file next to your page.
`JGZ.run` adds the game's canvas to the page's `<body>`:

```html
<script src="https://cdn.jsdelivr.net/npm/@js-game-zero/browser-runtime@0.2/dist/browser/browser.js"></script>
<script>
  JGZ.run(`
    WIDTH = 320;
    HEIGHT = 180;
    function draw() { screen.fill("navy"); }
  `);
</script>
```

Problems with the game, from a misspelled name to an image that won't load,
go to the browser console, or to a `diagnostics` callback if you pass one. A
game that fails stops, and its canvas is removed. [Getting
started](https://github.com/Leaf-Learning/js-game-zero/blob/main/docs/getting-started.md#a-game-in-one-web-page)
has a complete page that shows them on the page, with images and sounds.

In TypeScript, `/// <reference types="@js-game-zero/browser-runtime/iife" />`
declares `window.JGZ`.

The file opens with its license notice, so a page that inlines it carries it.

## Docs

- [Tutorial](https://github.com/Leaf-Learning/js-game-zero/blob/main/docs/tutorial.md):
  build a complete game step by step.
- [API reference](https://github.com/Leaf-Learning/js-game-zero/tree/main/docs/reference):
  every symbol, with a signature, an explanation and an example. The
  [runtime page](https://github.com/Leaf-Learning/js-game-zero/blob/main/docs/reference/runtime.md)
  covers `run()`, its options and driving a game from a host page.

## License

MIT. See [LICENSE](LICENSE).
