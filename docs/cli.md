# Game Verification CLI

The `jgz` command runs a js-game-zero project in Chromium and gives tests,
automation agents, and people a persistent control session. You can send real
keyboard and mouse input, advance the game a precise number of frames, inspect
live top-level state, and save the current canvas as a PNG.

## Install

Install the CLI and its Chromium browser once:

```sh
bun add --global @js-game-zero/cli
bunx playwright install chromium
```

From a js-game-zero source checkout, you can instead use the root script without
installing the package globally:

```sh
bun run jgz -- test examples/snake
```

The target directory must contain `main.js`. Sandbox projects keep `images/`,
`sounds/`, `music/`, and `fonts/` beside that file. The repository's shipped
examples use an `assets/` wrapper around those folders; the CLI recognizes both
layouts.

## Interactive use

Start a headless session:

```sh
jgz test path/to/game
```

The prompt accepts these commands:

```text
status
step [dt=0.0166666667] [count=1]
key down|up|tap <key>
mouse move <x> <y>
mouse down|up <left|middle|right> [x y]
mouse click <left|middle|right> <x> <y>
wheel <up|down> [x y]
inspect [binding.property[index]]
state
call <binding>
screenshot [path]
restart
help
quit
```

For example, hold Right for half a second of simulated time, release it, inspect
the player, and capture the canvas:

```text
key down right
step 0.0166666667 30
key up right
inspect player.pos
screenshot
```

Use `--headed` when you also want a visible game window. `--watch` reloads the
game after source or asset edits; without it, `restart` is the only operation
that rereads files. Browser storage survives either kind of restart for the
life of the CLI session.

## JSONL automation

Pass `--json` to make stdin and stdout a newline-delimited JSON protocol. This
is the recommended mode for agents and other programs:

```sh
jgz test path/to/game --json --seed verification-run
```

Each request has a `command` and may have a string, number, or null `id`:

```json
{"id":1,"command":"key","action":"down","key":"right"}
{"id":2,"command":"step","dt":0.0166666667,"count":30}
{"id":3,"command":"key","action":"up","key":"right"}
{"id":4,"command":"inspect","path":"player.pos"}
{"id":5,"command":"screenshot"}
{"id":6,"command":"quit"}
```

Responses repeat the request ID and use `ok: true` with a `result`, or
`ok: false` with a stable error `code` and human-readable `message`. Separate
event records report readiness, restarts, diagnostics, console output, and
runtime errors. In JSON mode every stdout line is JSON; operational failures
do not inject plain text into the stream.

### Batched play

Agents drive a whole scenario in one round trip with `play` (JSON mode only).
`actions` holds any sequence of `step`, `key`, `mouse` and `wheel` requests,
which run in order; `"restart": true` first reloads the project from disk,
waits for it to initialize and steps one frame (then `actions` may be empty);
the response carries the final status with a `pixels` summary, plus an
`inspect` result (a state path, a list of up to twelve paths answered as a map
keyed by path, or `true` for everything) and an inline `screenshot` when
asked:

```json
{
  "id": 8,
  "command": "play",
  "actions": [
    { "command": "key", "action": "down", "key": "right" },
    { "command": "step", "count": 30 },
    { "command": "key", "action": "up", "key": "right" }
  ],
  "inspect": "player.x",
  "screenshot": true
}
```

`status` accepts `"pixels": true` to include the same summary on its own: the
number of distinct colours over a sparse sample of the canvas and a hash of
that sample, so a caller can tell a blank canvas from a painted one and one
frame from the next without decoding the PNG. `screenshot` accepts
`"inline": true` to return the PNG as base64 `data` instead of writing a file.

## State inspection

`state` (or `inspect` with no path) returns every non-function top-level
identifier declaration or assignment found in the zero-boilerplate game.
`inspect player.pos` and `inspect enemies[0].x` read a smaller value. Paths are
strictly observational: calls, assignments, quoted indexes, and prototype
access are rejected.

Actors are represented by stable summaries containing their image, position,
size, angle, opacity, anchor, rectangle, and learner-added properties. Other
framework objects, sets, maps, undefined or special numeric values, circular
references, and truncated collections use explicit `$type` tags so the output
always remains valid JSON.

`call <binding>` invokes a zero-argument top-level function of the game and
returns its result with the same serialization, so a game or a test harness
can expose a probe such as `const __probe = () => ({ score, lives })` and read
several values consistently in one request. Function bindings are listed
separately from state and are never included in `state` output.

Only plain identifier declarations are captured automatically. Destructured
declarations and games using the typed `defineGame()` import style are not
inspectable in this first version. Screenshots and input still work normally.

## Determinism and timing

Games start with automatic animation frames disabled. The CLI waits for storage
and render assets, calls one `step(0)` to draw the initial screen, and advances
only in response to `step`. The default step is one sixtieth of a second.

`--seed <value>` gives the game the same repeatable sequence after each
restart: `Math.random`, `randomInt` and `randomChoice` follow it. It is
`run()`'s [`seed`](reference/runtime.md#seeded-runs), so a host page that runs
the game with the same seed sees the same values. Without it, Chromium's normal
randomness is used. Manual steps
control the js-game-zero clock and `update`/`draw` cycle; they do not virtualize
`Date`, timers, network requests, or audio playback time.

The CLI's browser has a device pixel ratio of 1, so games run at
[pixel density](reference/runtime.md#pixel-density) 1 unless the game sets
`PIXEL_DENSITY` itself. `status` reports the logical `canvas` size with its
`density`, and mouse and wheel coordinates are always logical.

Screenshots contain the canvas's own pixels rather than the scaled browser
element: `WIDTH × HEIGHT` at density 1, and that size times the density
when a game sets `PIXEL_DENSITY`. The response gives the logical `width`
and `height` with the `density`. The pixel summary samples a grid over the
logical screen, so it has the same number of cells at any density. With no
path, screenshots are written to a numbered file in a temporary
per-session directory, and the response reports its absolute path.
