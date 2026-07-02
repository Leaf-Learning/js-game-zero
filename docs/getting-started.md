# Getting Started

This page gets you from a fresh clone to a running game. If you're brand new
to `js-game-zero`, the [tutorial](tutorial.md) is the next stop after this —
it walks through building a small game step by step.

## Requirements

- [Bun](https://bun.sh) 1.3 or later. Bun is the only tool you need — it's
  the package manager, test runner, and the server the sandbox runs on.
- A Chromium-based browser for playing games and (if you're contributing)
  running the browser test suite.

Check your Bun version with `bun --version`. If you don't have Bun yet,
install it from [bun.sh](https://bun.sh), then re-open your terminal.

## Install

```sh
git clone https://github.com/taharafiq/js-game-zero.git
cd js-game-zero
bun install
```

## The sandbox — the primary way to learn and build

The sandbox is a local web app: a code editor, an asset panel, and a live
preview, all in your browser, backed by a small Bun server that saves your
project files to disk as you type.

```sh
bun run dev:sandbox
```

Then open **http://localhost:4173**. On first run you'll see two ways to
start: **Start from an example** clones one of the shipped example games
into a new project you can edit freely, and **Blank project** starts from a
tiny working game (an arrow-key-controlled circle) so you have something on
screen immediately. See [`docs/sandbox.md`](sandbox.md) for the full guided
tour of the editor, asset panel, and console.

Projects are written to a `.jgz-projects` directory next to wherever you ran
the command, so nothing is lost between sessions — close the terminal,
reopen it later, run `bun run dev:sandbox` again, and your projects are
still there. If you want a disposable project directory (for a workshop, or
to try something without keeping it), point at a different folder:

```sh
bun run dev:sandbox -- --projects-root /tmp/workshop-projects
```

## Running the shipped examples

The sandbox also serves the example games listed in
[`docs/examples.md`](examples.md) — they're the same games offered in the
"Start from an example" gallery, and they're a good way to see idiomatic
code before writing your own. With the sandbox running, open the **Examples**
button in the top bar, or browse to `http://localhost:4173/examples`.

## For teachers: running a classroom session

- Each student can run their own `bun run dev:sandbox` locally — projects
  are per-machine, there's no account system or server to share.
- If you want every student starting from a clean, empty project list,
  have them pass a fresh `--projects-root` (or delete `.jgz-projects` before
  the session).
- The [cookbook](cookbook.md) is organized as short, copy-pasteable recipes
  ("draw a shape", "move an actor", "play a sound") that work well as
  live-coding demos or handouts alongside the tutorial.
- `bun run dev:sandbox` needs no internet access once `bun install` has run
  — everything (editor, examples, assets) is served from disk.

## Troubleshooting

**"Address already in use" / the sandbox won't start on port 4173.**
Something else is already listening on that port — either stop it, or run
the sandbox on a different port:

```sh
bun apps/sandbox/src/server.ts --port 4200
```

then open `http://localhost:4200` instead.

**I pressed Play but there's no sound.** Browsers block audio until the
page has seen a user gesture (a click or key press). Click anywhere in the
preview canvas first — the sandbox shows a "Click the game to use your
keyboard" overlay for the same reason, and clicking it also unlocks audio.
This is a browser rule, not a bug in your game; see the audio-unlock note in
the tutorial's sound section for how to design around it.

**Keyboard input isn't reaching my game.** The preview runs inside an
`<iframe>`, and browsers only send keyboard events to whichever frame has
focus. Click the game canvas once (the focus overlay mentioned above will
disappear) before pressing movement keys.

**My code changes don't seem to take effect.** The sandbox auto-saves your
file a moment after you stop typing (watch the save status next to the
editor), but the _preview_ only reloads when you press Play or Restart —
editing code while a game is running doesn't hot-reload it.

## Next steps

- [`docs/tutorial.md`](tutorial.md) — build a complete tiny game from
  scratch.
- [`docs/cookbook.md`](cookbook.md) — short recipes for common tasks.
- [`docs/reference/`](reference/) — the full per-symbol API reference.
- [`docs/sandbox.md`](sandbox.md) — a guided tour of the sandbox UI.
