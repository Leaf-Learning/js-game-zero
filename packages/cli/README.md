# @js-game-zero/cli

`jgz` drives a [js-game-zero](https://github.com/Leaf-Learning/js-game-zero)
game from the terminal in headless Chromium: step frames, press keys, move and
click the mouse, read live top-level state, and save the canvas as a PNG. Its
JSON mode is built for agents and other programs checking a game.

## Install

The CLI runs on [Bun](https://bun.sh) 1.3 or later. Install it and the Chromium
it drives once:

```sh
bun add --global @js-game-zero/cli
bunx playwright install chromium
```

Playwright (1.57 or later) is a peer dependency: installing the CLI installs it
too, unless the project already has a version the CLI accepts, which it then
uses. Install Chromium with that same Playwright, since each version drives its
own build.

## Use

Start a session on a folder holding a game's `main.js`:

```sh
jgz test path/to/game
```

Then, at the prompt, hold Right for half a second of game time, read the
player's position and capture the canvas:

```text
key down right
step 0.0166666667 30
key up right
inspect player.pos
screenshot
```

With `--json`, stdin and stdout become a newline-delimited JSON protocol, and
`--seed` makes the game's randomness repeatable:

```sh
jgz test path/to/game --json --seed verification-run
```

```json
{"id":1,"command":"key","action":"down","key":"right"}
{"id":2,"command":"step","dt":0.0166666667,"count":30}
{"id":3,"command":"inspect","path":"player.pos"}
```

The [CLI guide](https://github.com/Leaf-Learning/js-game-zero/blob/main/docs/cli.md)
covers every command, the protocol, batched `play` requests, state inspection
and screenshots.

## License

MIT. See [LICENSE](LICENSE).
