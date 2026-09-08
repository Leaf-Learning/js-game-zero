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

The camelCase input hooks in a defined game receive one typed event object.
Existing zero-boilerplate and raw import hooks keep their Pygame Zero-style
parameter-name dispatch unchanged.

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
    /* camelCase aliases work here */
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

## `RunOptions`

| Option            | Purpose                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canvas`          | Draw into an existing `<canvas>` instead of creating one.                                                                                                       |
| `container`       | Where to mount a created canvas.                                                                                                                                |
| `autostart`       | Default `true`. Set `false` to skip the automatic frame loop and drive frames yourself via `handle.step(dt)` — useful for deterministic tests.                  |
| `projectId`       | Scopes storage keys and asset URLs, so multiple games on one page don't collide.                                                                                |
| `assetBaseUrl`    | Where asset URLs are rooted (default `/assets`).                                                                                                                |
| `preload`         | An array of asset paths (e.g. `["images/player.svg"]`) to start loading immediately, before any is referenced by code.                                          |
| `preloadedAssets` | Pre-built `{ images, sounds, music, fonts }` asset maps to seed the cache synchronously — used by hosts that already have the bytes (e.g. the sandbox preview). |
| `storage`         | A `Storage` instance or a raw `StorageAdapter` (`{ path, load(), save(text) }`) to use instead of the default `localStorage`-backed one.                        |
| `loaders`         | Override one or more of the `images`/`sounds`/`music`/`fonts` loader instances.                                                                                 |
| `keyboardTarget`  | The `EventTarget` that receives keyboard events (default `window`).                                                                                             |
| `scheduler`       | Override `requestAnimationFrame`/`cancelAnimationFrame` (for tests).                                                                                            |
| `diagnostics`     | `(diagnostic) => void` — called for every diagnostic warning (see below).                                                                                       |

Any hook or `WIDTH`/`HEIGHT`/`TITLE`/`ICON` config can also be passed
directly on `RunOptions`; if the same one is also present on the module
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

## Package boundaries

Games import learner-facing values from `@js-game-zero/core`. Embedders should
import loader factories, browser adapters, scheduler/diagnostic types, and
other integration APIs from `@js-game-zero/core/host`; Node filesystem storage
lives at `@js-game-zero/core/node`. Browser-safe advanced root imports remain
as deprecated compatibility aliases through 0.2.

## Diagnostics

`run()` performs lightweight static checks and reports them through the
`diagnostics` option (and collects them on `handle.diagnostics`) rather than
failing outright, except for one case that's a hard error: **`draw()` must
not declare any parameters** (`run()` throws a `TypeError` if it does, since
mixing it up with `update(dt)` is a very common typo).

Everything else is a warning:

| `code`                                      | Meaning                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `hook-typo`                                 | A top-level function is named nearly like a hook (e.g. `on_key_dwon`).              |
| `constant-typo`                             | A top-level assignment is named nearly like `WIDTH`/`HEIGHT`/`TITLE`/`ICON`.        |
| `duplicate-config` / `duplicate-hook-alias` | The same setting or hook was given two ways.                                        |
| `hook-arity`                                | `update` declares more than one parameter.                                          |
| `invalid-config`                            | `WIDTH`/`HEIGHT`/`ICON` isn't usable.                                               |
| `asset-name`                                | A quoted string that looks like an asset filename doesn't match the naming grammar. |
| `runtime-error`                             | An uncaught error, or a failure loading/saving storage.                             |

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
