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

| Option            | Purpose                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `canvas`          | Draw into an existing `<canvas>` instead of creating one.                                                                                                                      |
| `container`       | Where to mount a created canvas.                                                                                                                                               |
| `autostart`       | Default `true`. Set `false` to skip the automatic frame loop and drive frames yourself via `handle.step(dt)` — useful for deterministic tests.                                 |
| `projectId`       | Scopes storage keys and asset URLs, so multiple games on one page don't collide.                                                                                               |
| `assetBaseUrl`    | Where asset URLs are rooted (default `/assets`).                                                                                                                               |
| `preload`         | An array of asset paths (e.g. `["images/player.svg"]`) to start loading immediately, before any is referenced by code.                                                         |
| `preloadedAssets` | Pre-built `{ images, sounds, music, fonts }` asset maps to seed the cache synchronously — used by hosts that already have the bytes (e.g. the sandbox preview).                |
| `storage`         | A `Storage` instance or a raw `StorageAdapter` (`{ path, load(), save(text) }`) to use instead of the default `localStorage`-backed one.                                       |
| `loaders`         | Override one or more of the `images`/`sounds`/`music`/`fonts` loader instances.                                                                                                |
| `keyboardTarget`  | The `EventTarget` that receives keyboard events (default `window`).                                                                                                            |
| `TOUCH_CONTROLS`  | `true` for the full touch-control preset, `false` to disable it, or a button mapping with optional `show: "auto"` / `"always"`. See [touch controls](hooks.md#touch-controls). |
| `PIXEL_DENSITY`   | Canvas pixels per logical pixel. Defaults to the device's pixel ratio, from 1 to 3. See [pixel density](#pixel-density).                                                       |
| `scheduler`       | Override `requestAnimationFrame`/`cancelAnimationFrame` (for tests).                                                                                                           |
| `diagnostics`     | `(diagnostic) => void` — called for every diagnostic warning (see below).                                                                                                      |

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
handles. `bindings()` lists captured non-function top-level identifiers and
`read(name)` returns the current value of an allowlisted binding. This is the
inspection seam used by the browser-backed `jgz` verification CLI; it does not
add globals or learner-facing runtime methods.

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
`handle.failure.line` is the same number. Errors thrown inside the library have
no `line`.

The sandbox surfaces these in its Problems panel; import-mode hosts can pass
a `diagnostics` callback to log or display them however they like.
