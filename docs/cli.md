# Game Verification CLI

The `jgz` command runs a js-game-zero project in Chromium and gives tests,
automation agents, and people a persistent control session. You can send real
keyboard and mouse input, advance the game a precise number of frames, inspect
live top-level state, and save the current canvas as a PNG.

## Install

The CLI runs on [Bun](https://bun.sh) 1.3 or later and drives Chromium through
Playwright (1.57 or later), a peer dependency. Each Playwright version drives
its own build of Chromium, so install Chromium with the Playwright the CLI
uses. Added to a project, the CLI shares the project's Playwright, which
`bunx playwright` runs:

```sh
bun add -d @js-game-zero/cli
bunx playwright install chromium
bunx jgz test path/to/game
```

Installed globally, the CLI has a Playwright of its own, which may not be the
version `bunx playwright` runs in a project. `jgz install-chromium` runs that
Playwright's installer instead:

```sh
bun add --global @js-game-zero/cli
jgz install-chromium
```

Either way, when the Chromium the CLI needs is missing, `jgz test` fails with
the version of Playwright it uses and the command that installs its Chromium.
The examples below call the CLI `jgz`; in a project, run it as `bunx jgz`.

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

`<key>` names a key in any case, in one of three ways:

- By name: `left`, `right`, `up`, `down`, `space`, `enter` (or `return`),
  `escape` (or `esc`), `backspace`, `tab`, `delete`, `insert`, `home`, `end`,
  `pageup`, `pagedown`, `capslock`, `numlock`, `scrolllock`, `pause`,
  `printscreen`, `shift`, `ctrl` (or `control`), `alt`, `meta`, and `F1` to
  `F12`.
- By what it types unshifted: a letter, a digit, or one of `-` `=` `[` `]`
  `\` `;` `'` `` ` `` `,` `.` `/`.
- By its keyboard event `code`, for any other key the engine knows:
  `Numpad1`, `NumpadEnter`, `ShiftLeft`, `ContextMenu`, and the codes of the
  keys above (`KeyA`, `Digit1`, `Comma`).

At the prompt, quotes and a backslash group and escape words, as in
`screenshot "shots/after jump.png"`, so type those two keys as `\'` and `\\`,
or by their codes, `Quote` and `Backslash`. A lone `'` or `\` at the end of the
line stands for itself too: `key tap '`. In JSON they are `"'"` and `"\\"`.

A key is pressed as a keyboard sends it: `key tap a` reaches `onKeyDown` with
`unicode` `"a"`, and with `shift` held down it's `"A"` (`7` is `"&"`, `,` is
`"<"`). The number pad presses with NumLock off, so it types nothing. An
unknown key name is refused before anything is pressed.

`status` lists the keys and mouse buttons held down with `key down` and
`mouse down` as `heldKeys` and `heldMouseButtons`. Each key is listed by its
first name above (`right`, `ctrl`), else by what it types (`b`, `;`), else by
its code (`Numpad1`), however it was given. A `key tap` of a held key, or a
`mouse click` of a held button, leaves it released.

Use `--headed` when you also want a visible game window. `--watch` restarts the
game when `main.js` or a file in its asset folders changes; other files, such
as screenshots saved into the project, don't restart it. Without `--watch`,
`restart` is the only operation that rereads files. Browser storage survives
every kind of restart for the life of the CLI session.

## Options

`jgz test <project-directory>` takes these flags:

| Flag             | Default | Effect                                                                                                                                                  |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json`         | off     | Makes stdin and stdout the [JSONL protocol](#jsonl-automation) instead of a prompt.                                                                     |
| `--headed`       | off     | Shows the browser window too.                                                                                                                           |
| `--watch`, `-w`  | off     | Restarts the game when `main.js`, or a file in its `images/`, `sounds/`, `music/` or `fonts/` folder, changes (in the `assets/` folder in that layout). |
| `--seed <value>` | none    | Gives the game's randomness the same sequence after every restart (see [Determinism and timing](#determinism-and-timing)).                              |
| `--timeout <ms>` | `15000` | How long the game may take to start, and to answer each call into the browser, before it counts as stuck and is restarted (see [Timeouts](#timeouts)).  |

`jgz install-chromium` installs Chromium for the CLI's Playwright, and exits
with the installer's status. `jgz --help` (or `-h`) lists the commands and
flags, and `jgz --version` (or `-v`) prints the version.

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
`ok: false` with a stable error `code` and human-readable `message` (see
[Errors and exit codes](#errors-and-exit-codes)). Separate event records
report readiness, restarts, diagnostics, console output, and runtime errors.
`ready` comes once the session takes commands, even when the game's code
failed to start: then a `runtime-error` event with `"phase": "startup"` comes
first, and `ready`'s `status` carries the `startupError`. A
`restarted` event's `source` says what restarted the game: `command` (a
`restart`, or a `play` with `"restart": true`), `watch`, or `timeout` (see
[Timeouts](#timeouts)). In JSON mode every stdout line is JSON; operational
failures do not inject plain text into the stream.

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

Every action is checked before any of them runs, so a malformed one, such as
an unknown key, fails the request with nothing done, and the message gives its
place: `actions[1]: Unsupported key: zz. …`. An action that fails as it runs
is reported the same way, `actions[3]: …`, with the actions before it done.
Once the actions have run, a path in `inspect` that can't be read is answered
in its place, as `{ "error": "Unknown game-state binding: nothere" }`, and the
rest of the response stands.

`status` accepts `"pixels": true` to include the same summary on its own: the
number of distinct colours over a sparse sample of the canvas and a hash of
that sample, so a caller can tell a blank canvas from a painted one and one
frame from the next without decoding the PNG. `screenshot` accepts
`"inline": true` to return the PNG as base64 `data` instead of writing a file.

## Errors and exit codes

Every error has a stable code: in `--json` mode it's the response's
`error.code`, and at the prompt it starts the line, as in
`invalid_request: Usage: step [dt] [count]`. The message is the game's or the
browser's own first line, without Playwright's wrapping or the in-page stack.

| Code                 | Meaning                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_request`    | The request is malformed, and nothing ran: not JSON or not an object, a missing or wrong field, the wrong words at the prompt, or an unknown key name. In `--json` mode a wrong command line is reported this way too, without an `id`.                                   |
| `unknown_command`    | No command has that name, and nothing ran.                                                                                                                                                                                                                                |
| `invalid_state_path` | An `inspect` path isn't a plain read-only path (see [State inspection](#state-inspection)), and nothing ran.                                                                                                                                                              |
| `command_failed`     | The request was valid, but the game or the browser couldn't carry it out: an `inspect` or `call` of a binding the game doesn't have, a path through a missing value, a `call` of something that isn't a function, or a game that didn't answer in time and was restarted. |
| `startup_failed`     | The session couldn't start: the folder has no `main.js`, Chromium isn't installed, or the game didn't finish starting in time. In `--json` mode this response, without an `id`, is the only line, and the CLI exits with 1.                                               |

The CLI exits with:

| Exit code           | When                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `0`                 | After `quit`, or at the end of its input.                                                                                              |
| `1`                 | The session couldn't start (`startup_failed`).                                                                                         |
| `2`                 | The command line was wrong.                                                                                                            |
| `129`, `130`, `143` | On SIGHUP, SIGINT (Ctrl-C, at the prompt too) or SIGTERM: 128 plus the signal's number. The browser is closed first, even mid-command. |

## State inspection

`state` (or `inspect` with no path) returns every non-function top-level
identifier declaration or assignment found in the zero-boilerplate game.
`inspect player.pos` and `inspect enemies[0].x` read a smaller value. Paths are
strictly observational: calls, assignments, quoted indexes, and prototype
access are rejected.

Actors are represented by stable summaries containing their image, position,
size, angle, opacity, anchor and rectangle, and under `properties` the fields
the game gave them: `bug.speed = 40` is `properties.speed`. A path reads the
actor itself rather than its summary, so it's `inspect bug.speed` for that
field and `inspect bug.left` for an edge of its rectangle. Other
framework objects, sets, maps, undefined or special numeric values, circular
references, and truncated collections use explicit `$type` tags so the output
always remains valid JSON.

`call <binding>` invokes a zero-argument top-level function of the game and
returns its result with the same serialization, so a game or a test harness
can expose a probe such as `const __probe = () => ({ score, lives })` and read
several values consistently in one request. Functions aren't part of `state`
output; call them by name.

Only plain identifier declarations are captured automatically: a destructured
declaration such as `let [a, b] = pair;` isn't inspectable.

The CLI runs games the way the sandbox does: a project folder whose `main.js`
is zero-boilerplate code. A game written as a module, with `import` lines and
`defineGame()`, can't run in it.

## Determinism and timing

Games start with automatic animation frames disabled. The CLI waits for storage
and render assets, calls one `step(0)` to draw the initial screen, and advances
only in response to `step`. The default step is one sixtieth of a second. A
`step` runs `count` frames (a whole number from 1 to 100,000) of `dt` seconds
each (0 or more), so `{"command": "step", "dt": 0}` runs one frame without
moving time on, and a `count` of 0 is refused.

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

## Timeouts

`--timeout` (15000 ms by default) bounds everything the CLI waits on the
browser for: loading the game and waiting for it to start, at launch, after a
`restart` and on a `--watch` reload, and each call into the page, such as one
`step` request's frames, a key press, a click, an `inspect` or `call`, or a
screenshot. A `play` request makes many calls, each bounded on its own.

A game stuck in an endless loop in `update` or `draw` can't be interrupted, so
when a call times out the CLI closes the page and loads the game afresh on a
new one, as `restart` does. The request fails with `command_failed`, saying the
game may be stuck and was restarted, and a `restarted` event with
`"source": "timeout"` reports the new status. Browser storage survives, though
a change the game made just before it got stuck may not have been saved. A
game that doesn't finish starting in time fails with `startup_failed` at
launch. A long `step` of a slow game counts as stuck too, so split it or raise
`--timeout`.
