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

Only plain identifier declarations are captured automatically. Destructured
declarations and games using the typed `defineGame()` import style are not
inspectable in this first version. Screenshots and input still work normally.

## Determinism and timing

Games start with automatic animation frames disabled. The CLI waits for storage
and render assets, calls one `step(0)` to draw the initial screen, and advances
only in response to `step`. The default step is one sixtieth of a second.

`--seed <value>` replaces `Math.random` with the same repeatable sequence after
each restart. Without it, Chromium's normal randomness is used. Manual steps
control the js-game-zero clock and `update`/`draw` cycle; they do not virtualize
`Date`, timers, network requests, or audio playback time.

Screenshots contain the logical canvas pixels rather than the scaled browser
element. With no path they are written to a numbered file in a temporary
per-session directory, and the response reports its absolute path.
