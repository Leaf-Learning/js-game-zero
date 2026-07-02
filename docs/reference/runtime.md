# The `run()` Module API

Most learners never call `run()` directly — the sandbox and zero-boilerplate
examples call it for you, and you just write top-level `WIDTH`/`draw`/
`update`/hook definitions. This page is for import-mode code and for anyone
embedding the framework in a host page (a custom sandbox, a course platform,
an automated test).

```ts
function run(
  moduleOrSource: GameModule | string,
  options?: RunOptions,
): GameHandle;
```

## Two entry styles

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

| Member                                                        | Purpose                                                                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canvas`, `screen`, `clock`, `keyboard`, `loaders`, `storage` | The live instances this run is using.                                                                                                                    |
| `module`                                                      | The final, merged hook/config object.                                                                                                                    |
| `diagnostics`                                                 | The diagnostics collected so far.                                                                                                                        |
| `ready: Promise<void>`                                        | Resolves once the preload gate is satisfied (see below).                                                                                                 |
| `pause()` / `resume()`                                        | Stop/restart the frame loop without tearing anything down.                                                                                               |
| `step(dt)`                                                    | Manually advance one frame by `dt` seconds — only meaningful with `autostart: false`.                                                                    |
| `stop()`                                                      | Detaches input listeners, flushes any pending storage save, and cancels the frame loop.                                                                  |
| `reload(nextSource?)`                                         | Stops this run and starts a fresh one with the same options (used by the sandbox's Restart button); pass a new module/source to swap the code being run. |

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

The runtime tracks every asset load kicked off while your top-level code
runs (Actor constructions, `images.player` touches, `preload` entries) and
holds the very first frame's `draw()` until they've all settled — and until
storage has finished loading. This is why a game can safely read
`storage.get("score")` or `images.player.get_size()` at the top level and
never show a half-loaded frame: by the time anything is drawn, everything
that was requested during startup is ready. `handle.ready` resolves at the
same moment, for hosts that want to `await` startup explicitly instead of
polling.

## Diagnostics

`run()` performs lightweight static checks and reports them through the
`diagnostics` option (and collects them on `handle.diagnostics`) rather than
failing outright, except for one case that's a hard error: **`draw()` must
not declare any parameters** (`run()` throws a `TypeError` if it does, since
mixing it up with `update(dt)` is a very common typo).

Everything else is a warning:

| `code`                                      | Meaning                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `hook-typo`                                 | A defined function name is close to a real hook name (e.g. `on_key_dwon`).          |
| `constant-typo`                             | A top-level name is close to `WIDTH`/`HEIGHT`/`TITLE`/`ICON`.                       |
| `duplicate-config` / `duplicate-hook-alias` | The same setting or hook was given two ways.                                        |
| `hook-arity`                                | `update` declares more than one parameter.                                          |
| `invalid-config`                            | `WIDTH`/`HEIGHT`/`ICON` isn't usable.                                               |
| `asset-name`                                | A quoted string that looks like an asset filename doesn't match the naming grammar. |
| `runtime-error`                             | An uncaught error, or a failure loading/saving storage.                             |

The sandbox surfaces these in its Problems panel; import-mode hosts can pass
a `diagnostics` callback to log or display them however they like.
