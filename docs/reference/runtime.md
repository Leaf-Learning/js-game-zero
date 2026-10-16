# The `run()` Module API

Most learners never call `run()` directly — the sandbox and zero-boilerplate
examples call it for you, and you just write top-level `WIDTH`/`draw`/
`update`/hook definitions. This page is for import-mode code and for anyone
embedding the framework in a host page (a custom sandbox, a course platform,
an automated test).

```ts
function run(
  moduleOrSource: GameModule | DefinedGame | string,
  options?: RunOptions,
): GameHandle;
```

## Three entry styles

**Scoped import mode (recommended for applications)** — `defineGame()` gives
the game a typed set of services owned by that one run. Actors, assets,
storage, animation, input, and audio therefore cannot accidentally bind to a
different game on the same page:

```ts
import { defineGame, run } from "@js-game-zero/core";

run(
  defineGame(({ Actor, screen, keyboard }) => {
    const player = new Actor("player.svg");
    return {
      WIDTH: 320,
      HEIGHT: 180,
      update(dt) {
        if (keyboard.right) player.x += 120 * dt;
      },
      draw() {
        screen.clear();
        player.draw();
      },
      onKeyDown(event) {
        console.log(event.key);
      },
    };
  }),
);
```

The input hooks in a defined game receive one typed event object.
Zero-boilerplate and raw import hooks keep their Pygame Zero-style
parameter-name dispatch.

Package-level `screen`, `clock`, `keyboard`, `images`, `sounds`, `music`, and
`storage` remain available for learner compatibility. They are convenience
proxies for a single active runtime; applications that can run more than one
game should prefer the services passed to `defineGame()`.

**Import mode** — pass a plain object of hooks and config:

```js
import { run, screen, keyboard } from "@js-game-zero/core";

run({
  WIDTH: 320,
  HEIGHT: 180,
  draw() {
    screen.fill("#10243d");
  },
  update(dt) {
    /* ... */
  },
  onKeyDown(key) {
    /* hooks receive values by parameter name */
  },
});
```

**Global mode** — pass a source-code string, which runs with the framework's
globals (`Actor`, `screen`, `keyboard`, `WIDTH`, `draw`, ...) already in
scope, exactly like a zero-boilerplate sandbox project. This is how the
sandbox's preview pane runs the code from your editor.

```js
run(`
  WIDTH = 320;
  HEIGHT = 180;
  function draw() { screen.fill("navy"); }
`);
```

`handle.mode` tells you which one was used (`"import"` or `"global"`).

A global-mode game runs in its own scope rather than the page's. Reading a
name nothing defines throws a `ReferenceError` with a suggestion
(`scren is not defined. Did you mean screen?`); `typeof name` stays safe.
Browser APIs a game can't reach say what to use instead — for example,
`setTimeout` points at `clock.schedule(callback, seconds)`, and
`localStorage` at `storage`. Standard JavaScript built-ins such as `Math`,
`JSON`, `isNaN`, `Map` and `console` are available as usual.

Every library name has one spelling, in camelCase: `screen.draw.filledCircle`,
`actor.angleTo`, `rect.collidePoint`, `clock.scheduleInterval`, `onKeyDown`.
Constants stay upper case (`WIDTH`, `keys.SPACE`, `mouse.LEFT`). Another
spelling of a member, such as Pygame Zero's `actor.angle_to` or
`rect.colliderect`, throws where it's read, naming the real one
(`actor.angle_to doesn't exist. Did you mean actor.angleTo?`). In a
global-mode game, `screen`, `clock`, `music`, `tone`, `keys`, `keymods` and
`mouse` also throw with a suggestion for any member they don't have
(`screen.draw.cirlce doesn't exist. Did you mean screen.draw.circle?`), and
an undefined global suggests the real one
(`random_int is not defined. Did you mean randomInt?`).
The classes behind them (`Screen`, `Clock`, `Storage`) are globals too, so a
capital letter by mistake, as in `Screen.fill("navy")`, points at the service
instead (`Screen.fill doesn't exist. Did you mean screen.fill?`).

## `RunOptions`

| Option               | Purpose                                                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canvas`             | Draw into an existing `<canvas>` instead of creating one.                                                                                                                                                                                                      |
| `container`          | Where to mount a created canvas.                                                                                                                                                                                                                               |
| `autostart`          | Default `true`. Set `false` to skip the automatic frame loop and drive frames yourself via `handle.step(dt)` — useful for deterministic tests.                                                                                                                 |
| `projectId`          | Scopes storage keys and asset URLs, so multiple games on one page don't collide.                                                                                                                                                                               |
| `assetBaseUrl`       | Where asset URLs are rooted (default `/assets`).                                                                                                                                                                                                               |
| `assetUrls`          | The game's assets by path, each with its URL: `{ "images/cat.svg": "data:image/svg+xml;base64,…" }`. When set, assets load only from here, never from `assetBaseUrl`. See [assets without a server](loaders.md#assets-without-a-server).                       |
| `preload`            | An array of asset paths (e.g. `["images/player.svg"]`) to start loading immediately, before any is referenced by code.                                                                                                                                         |
| `preloadedAssets`    | Pre-built `{ images, sounds, music, fonts }` asset maps to seed the cache synchronously — used by hosts that already have the bytes (e.g. the sandbox preview).                                                                                                |
| `storage`            | A `Storage` instance or a raw `StorageAdapter` (`{ path, load(), save(text) }`) to use instead of the default `localStorage`-backed one.                                                                                                                       |
| `loaders`            | Override one or more of the `images`/`sounds`/`music`/`fonts` loader instances.                                                                                                                                                                                |
| `keyboardTarget`     | The `EventTarget` that receives keyboard events (default `window`).                                                                                                                                                                                            |
| `mouseReleaseTarget` | The `EventTarget` where mouse releases (`mouseup`) are heard (default `window`, so a drag released outside the canvas still ends). A host driving a game itself passes the canvas, so its releases reach no other game.                                        |
| `seed`               | A string or number that makes the game's randomness repeatable: `Math.random` as a zero-boilerplate game sees it, and `randomInt` and `randomChoice`, follow one sequence for this seed, the sequence `jgz test --seed` uses. See [seeded runs](#seeded-runs). |
| `TOUCH_CONTROLS`     | `true` for the full touch-control preset, `false` to disable it, or a button mapping with optional `show: "auto"` / `"always"`. See [touch controls](hooks.md#touch-controls).                                                                                 |
| `PIXEL_DENSITY`      | Canvas pixels per logical pixel. Defaults to the device's pixel ratio, from 1 to 3. See [pixel density](#pixel-density).                                                                                                                                       |
| `scheduler`          | Override `requestAnimationFrame`/`cancelAnimationFrame` (for tests).                                                                                                                                                                                           |
| `diagnostics`        | `(diagnostic) => void` — called for every diagnostic warning (see below).                                                                                                                                                                                      |

Any hook or `WIDTH`/`HEIGHT`/`PIXEL_DENSITY`/`TITLE`/`ICON`/`TOUCH_CONTROLS`
config can also be passed directly on `RunOptions`; if the same one is also present on the module
object, the option wins and a diagnostic warns about the duplicate.

## `GameHandle`

`run()` returns a handle for controlling the running game:

| Member                                                        | Purpose                                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `canvas`, `screen`, `clock`, `keyboard`, `loaders`, `storage` | The live instances this run is using.                                                                |
| `module`                                                      | The final, merged hook/config object.                                                                |
| `diagnostics`                                                 | The diagnostics collected so far.                                                                    |
| `state`, `failure`                                            | Lifecycle state and the first fatal runtime failure, if one occurred.                                |
| `ready: Promise<void>`                                        | Resolves once the preload gate is satisfied (see below).                                             |
| `done: Promise<void>`                                         | Resolves after final storage flushing and resource cleanup complete.                                 |
| `pause()` / `resume()`                                        | Stop/restart the frame loop without tearing anything down.                                           |
| `step(dt)`                                                    | Manually advance one frame by `dt` seconds — only meaningful with `autostart: false`.                |
| `stop()`                                                      | Detaches input listeners, flushes any pending storage save, and cancels the frame loop.              |
| `dispose()`                                                   | Awaited form of cleanup; resolves only after pending persistence work is finished.                   |
| `restart(nextSource?)`                                        | Awaits cleanup, then starts a fresh run with the same options.                                       |
| `reload(nextSource?)`                                         | Compatibility alias that starts synchronously; prefer `restart()` when persistence ordering matters. |

```js
const handle = run(gameModule, { canvas });
// later
handle.stop();
```

## `exit()`

```js
import { exit } from "@js-game-zero/core";
exit(); // equivalent to calling .stop() on the currently active run() handle
```

Also injected as a zero-boilerplate global, so game code can call `exit()`
directly to end itself.

## Preload gate

Each run tracks its own required image and font loads (Actor constructions,
`images.player` touches, and `preload` entries) and holds drawing until those
loads and storage initialization settle. A required image/font failure rejects
`handle.ready`, fails the handle, and performs cleanup. Sound and music loads
are recoverable: they report a warning but never freeze another run or stop
rendering. `handle.ready` lets hosts await startup explicitly instead of
polling.

## Pixel density

The canvas holds `WIDTH × HEIGHT × density` pixels, so a game is as sharp
as the screen it's on. Density is the device's `devicePixelRatio`, from 1
to 3, unless the game file or `RunOptions` sets `PIXEL_DENSITY`. A
`PIXEL_DENSITY` that isn't a positive number warns and uses the device's
ratio.

Game code works in logical pixels at any density; only reading the
canvas itself sees its real pixels:

| Logical pixels                                           | Canvas pixels (logical × density) |
| -------------------------------------------------------- | --------------------------------- |
| `screen.width`, `screen.height`, `screen.bounds()`       | `canvas.width`, `canvas.height`   |
| Every drawing call, text, images and Actors              | `getImageData()`, `toDataURL()`   |
| Mouse and touch positions, Actor positions and hit tests |                                   |

`screen.density` reports the density in use, so a host reading pixels back
multiplies logical coordinates by it.

**CSS size.** A denser canvas would show at its pixel size, so the runtime
gives it a CSS width of `WIDTH` px through a `:where(canvas[data-jgz-density])`
rule; its height follows the aspect ratio. The rule has no specificity, so
CSS the page sets on the canvas wins. A page that sizes the canvas should
set its width, or both width and height: a height alone keeps the rule's
width. The touch-control dock and the sandbox preview fit the canvas by its
logical size. At density 1 the canvas gets no rule and shows at its own
size.

**Changes.** Before each frame the runtime checks the canvas against the
screen:

- With no `PIXEL_DENSITY`, density follows `devicePixelRatio`, which
  changes when the page is zoomed or moved to another display. The canvas
  keeps what it shows, rescaled, for games that don't redraw everything.
- A host that sets `canvas.width` or `canvas.height` sets the logical size,
  and the runtime multiplies it by the density.
- Setting a canvas's size resets its context, so the runtime restores the
  density scale.

**Limit.** iOS Safari leaves a canvas over 16,777,216 pixels (4096²)
blank, so density comes down until the canvas fits, though never below 1
unless the game asks for less. A `PIXEL_DENSITY` that doesn't fit warns
and uses the most that does.

Raster images (PNG, JPEG) can't hold more detail than their own pixels. In
Chromium, SVG images draw from their vectors at the canvas's density, so an
SVG Actor stays sharp at any size.

## Package boundaries

Games import learner-facing values from `@js-game-zero/core`. Embedders should
import loader factories, browser adapters, scheduler/diagnostic types, and
other integration APIs from `@js-game-zero/core/host`; Node filesystem storage
lives at `@js-game-zero/core/node`. Browser-safe advanced root imports remain
as deprecated compatibility aliases through 0.2.

Host tooling can also import `getGameInspector(handle)` from
`@js-game-zero/core/host`. It returns a live, read-only binding inspector for a
running zero-boilerplate source game, or `null` for import-mode and disposed
handles (a failed game keeps its inspector, so a host can read the state at the
crash). This is the inspection seam the browser-backed `jgz` verification CLI
uses; it does not add globals or learner-facing runtime methods.

| Member           | Purpose                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `bindings()`     | The captured non-function top-level identifiers, in source order.                                                                         |
| `functions()`    | The top-level functions.                                                                                                                  |
| `read(path)`     | The live value at a binding or a [state path](#state-paths), as it is.                                                                    |
| `inspect(path?)` | The value at a path as JSON, exactly as `jgz`'s `inspect` reports it (`serializeGameValue`); with no path, every binding's value by name. |

The same module exports `serializeGameValue(value)`, `parseStatePath(source)`
and `createSeededRandom(seed)`.

### State paths

A path names a top-level binding, then `.name` for a property and `[n]` for an
index: `score`, `player.x`, `fish[0].y`. `parseStatePath("fish[0].y")` returns
`{ source: "fish[0].y", binding: "fish", segments: [0, "y"] }`, and throws a
`TypeError` for anything else, including `__proto__`, `prototype` and
`constructor`. `jgz`'s `inspect` takes the same paths.

### What a frame drew

A path that starts with `$drawn` reads what the game's last `draw()` drew,
in order, rather than one of its bindings, through `read`, `inspect` and
`jgz`'s `inspect` alike. Each thing drawn has its `kind` and what it is and
where, as the game gave them:

| `kind`    | Fields                                                  | From                                                      |
| --------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `fill`    | `color`, and `to` for a gradient                        | `screen.fill`                                             |
| `clear`   |                                                         | `screen.clear`                                            |
| `image`   | `image` (its name), `x`, `y` (its top-left)             | `screen.blit`, `screen.draw.image`                        |
| `actor`   | `image`, `x`, `y`                                       | an Actor's `draw()`                                       |
| `circle`  | `x`, `y`, `radius`, `color`, `filled`                   | `screen.circle`, `screen.draw.circle`, `filledCircle`     |
| `rect`    | `x`, `y`, `width`, `height`, `color`, `filled`          | `screen.rect`, `screen.draw.rect`, `filledRect`           |
| `polygon` | `x`, `y` (its first point), `points`, `color`, `filled` | `screen.triangle`, `screen.draw.polygon`, `filledPolygon` |
| `line`    | `x`, `y`, `x2`, `y2`, `color`                           | `screen.line`, `screen.draw.line`                         |
| `text`    | `text`, and `x`, `y`, `color` when it has them          | `screen.text`, `screen.draw.text`, `screen.draw.textbox`  |

`$drawn[0].kind`, `$drawn[2].image` and the like read single things. A frame
keeps its first 200 things; before the first frame `$drawn` is empty. So a
check that something is on the screen reads what the game drew rather than
its pixels: `{ kind: "actor", image: "robot.svg" }` is in `$drawn`.

### Inspected values

`serializeGameValue` turns a value into JSON: numbers, strings, booleans,
arrays and plain objects as they are (object keys sorted); anything else tagged
with `$type`:

```js
serializeGameValue(new Actor("cat", [40, 60]));
// { $type: "Actor", image: "cat", x: 40, y: 60, width, height, angle, … }
serializeGameValue(new Rect(1, 2, 3, 4));
// { $type: "Rect", left: 1, top: 2, right: 4, bottom: 6, width: 3, height: 4, center: [2.5, 4] }
serializeGameValue({ missing: undefined, big: Infinity });
// { big: { $type: "Number", value: "Infinity" }, missing: { $type: "Undefined" } }
```

Sets, maps, dates and errors are tagged too; values deeper than six levels,
lists past 100 items and circular references come back as `Truncated` or
`Circular`.

### Seeded runs

`run(source, { seed })` gives the game a sequence of its own. A
zero-boilerplate game sees a `Math` whose `random` follows the seed (every
other member is the real `Math`'s), and `randomInt` and `randomChoice` draw
from it while the game runs, in its hooks and its top-level code alike. An
import-mode game's `randomInt` and `randomChoice` follow the seed in its hooks;
its `Math.random` is the page's. Nothing else changes: the page's own
`Math.random`, and any other game on the page, keep their randomness, and a
`restart()` starts the sequence again.

Up to nine plain digits are the number they spell (`42` and `"42"` are the same
seed); any other string is hashed (FNV-1a), and the sequence is Mulberry32 over
that 32-bit state. `jgz test --seed` passes its seed to the same option, so one
seed gives the same values in the CLI and in a host page;
`createSeededRandom(seed)` returns the sequence itself, for a host or a test to
predict. A seed that isn't a string or a finite number fails at startup.

### Driving a game from a host page

The script-tag build (`window.JGZ`) carries `getGameInspector`,
`serializeGameValue`, `parseStatePath` and `createSeededRandom` beside the
learner-facing API, so a page can run a game it drives itself, the way the CLI
does, without a bundler:

```js
const canvas = document.createElement("canvas"); // never added to the page
const handle = JGZ.run(source, {
  canvas,
  autostart: false,
  seed: "check-1",
  keyboardTarget: canvas,
  mouseReleaseTarget: canvas,
  PIXEL_DENSITY: 1,
});
await handle.ready;
handle.step(0); // draws the first screen, as the CLI does
canvas.dispatchEvent(
  new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight" }),
);
for (let frame = 0; frame < 30; frame += 1) handle.step(1 / 60);
canvas.dispatchEvent(
  new KeyboardEvent("keyup", { key: "ArrowRight", code: "ArrowRight" }),
);
canvas.dispatchEvent(
  new MouseEvent("mousedown", {
    clientX: 25,
    clientY: 30,
    button: 0,
    buttons: 1,
  }),
);
canvas.dispatchEvent(
  new MouseEvent("mouseup", { clientX: 25, clientY: 30, button: 0 }),
);
JGZ.getGameInspector(handle).inspect("player.x");
```

- **Frames.** With `autostart: false`, nothing runs until the page calls
  `handle.step(dt)`; each call is one `update(dt)` and one `draw()`. The CLI
  steps once with `dt` 0 after `ready`, then one sixtieth of a second per frame,
  so a page that does the same sees what `jgz test play` sees.
- **Keys.** Keyboard events are heard on `keyboardTarget` (default `window`):
  `keydown` and `keyup`, read by `code` first (`ArrowRight`, `Space`, `KeyA`)
  and then `key`. Passing the canvas keeps them from reaching other games.
- **Mouse and taps.** `mousedown`, `mousemove` and `wheel` are heard on the
  canvas, `mouseup` on `mouseReleaseTarget` (default `window`). A position is
  mapped from the canvas's displayed box onto the logical screen:
  `clientX = box.left + x / screen.width * box.width`, and the same for `y`
  (`handle.canvas.getBoundingClientRect()`, `handle.screen`). A canvas that
  isn't on the page has an empty box, so its client coordinates are the
  logical ones, as above. Touch arrives as `pointerdown`, `pointermove` and
  `pointerup` with `pointerType: "touch"`; the CLI uses the mouse events.

## Diagnostics

`run()` performs lightweight static checks and reports them through the
`diagnostics` option (and collects them on `handle.diagnostics`) rather than
failing outright, except for one case that's a hard error: **`draw()` must
not declare any parameters** (`run()` throws a `TypeError` if it does, since
mixing it up with `update(dt)` is a very common typo).

Everything else is a warning:

| `code`             | Meaning                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `hook-typo`        | A top-level function is named nearly like a hook (e.g. `onKeyDwon`), or is a hook spelled another way (`on_key_down`), which is never called. |
| `constant-typo`    | A top-level assignment is named nearly like a setting, such as `WIDTH` or `TITLE`.                                                            |
| `duplicate-config` | The same setting was given both on the module and in the run options.                                                                         |
| `hook-arity`       | `update` declares more than one parameter.                                                                                                    |
| `hook-parameter`   | An input hook parameter isn't one of its documented names; says what it receives.                                                             |
| `invalid-config`   | `WIDTH`/`HEIGHT`/`PIXEL_DENSITY`/`ICON` isn't usable.                                                                                         |
| `asset-name`       | A quoted string that looks like an asset filename doesn't match the naming grammar.                                                           |
| `runtime-error`    | An uncaught error, or a failure loading/saving storage.                                                                                       |

The two typo checks only look at names the script _defines_ at top level
(`function drow()`, `const udpate = () => {}`, `WIDHT = 800`), never at names
it merely uses (`row`, `col`, `rows[y]`), and they stay quiet when the real
name is also defined. Short names get one edit of slack and longer ones two.

A `runtime-error` raised by the game's own code (a hook that threw, or a
top-level statement at startup) also carries `line`: the 1-based line in the
game source where the error was thrown, when the engine's stack trace names it.
A syntax error carries one too: where the engine gives no position (V8 gives
none for compiled game code), it's the first line whose part of the source
fails the same way, so a missing `)` is placed on the line it's missing from,
and a block left open on the line it opens on. A name the game never defined
is placed the same way where the engine gives no position (JavaScriptCore): on
the one line that reads it, when only one does. `handle.failure.line` is the
same number. Errors thrown inside the library have no `line`.

The sandbox surfaces these in its Problems panel; import-mode hosts can pass
a `diagnostics` callback to log or display them however they like.
