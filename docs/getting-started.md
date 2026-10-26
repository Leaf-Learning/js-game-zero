# Getting Started

This page gets you to a running game: in the sandbox, which runs from a
clone of this repository, or in [a single web page](#a-game-in-one-web-page)
with nothing to install. If you're brand new to `js-game-zero`, the
[tutorial](tutorial.md) is the next stop after this — it walks through
building a small game step by step.

## Requirements

- [Bun](https://bun.sh) 1.3 or later. Bun is the only tool you need — it's
  the package manager, test runner, and the server the sandbox runs on.
- A Chromium-based browser for playing games and (if you're contributing)
  running the browser test suite.

Check your Bun version with `bun --version`. If you don't have Bun yet,
install it from [bun.sh](https://bun.sh), then re-open your terminal.

## Install

```sh
git clone https://github.com/Leaf-Learning/js-game-zero.git
cd js-game-zero
bun install
```

## The sandbox — the primary way to learn and build

The sandbox is a local web app: a code editor, your game's images and
sounds, and the game itself, all in your browser, backed by a small Bun server that saves your
project files to disk as you type.

```sh
bun run dev:sandbox
```

Then open **http://127.0.0.1:4173**, the address the server prints
(`http://localhost:4173` works too). On first run you'll see two ways to
start: **Remix an example** copies one of the shipped example games into a
new game you can edit freely, and **Make a blank game** starts from a tiny
working game (an arrow-key-controlled circle) so you have something on
screen immediately. See [`docs/sandbox.md`](sandbox.md) for the full guided
tour of the editor, the asset panels, and Messages.

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
sandbox's example gallery, and they're a good way to see idiomatic
code before writing your own. With the sandbox running, open the **Examples**
button in the top bar, or browse to `http://127.0.0.1:4173/examples`.

## A game in one web page

A game can also live in one HTML file, with no Bun and no clone: the page
loads js-game-zero from [jsDelivr](https://www.jsdelivr.com/package/npm/@js-game-zero/browser-runtime),
so all it needs is a browser and an internet connection. Save this as
`my-game.html` and open it in your browser:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>My game</title>
    <script src="https://cdn.jsdelivr.net/npm/@js-game-zero/browser-runtime@0.2/dist/browser/browser.js"></script>
  </head>
  <body>
    <script id="game" type="text/plain">
      WIDTH = 480;
      HEIGHT = 360;

      let x = 240;

      function update(dt) {
        if (keyboard.left) x -= 200 * dt;
        if (keyboard.right) x += 200 * dt;
      }

      function draw() {
        screen.fill("navy");
        screen.draw.filledCircle([x, 180], 30, "gold");
      }
    </script>
    <pre id="problems"></pre>
    <script>
      JGZ.run(document.getElementById("game").textContent, {
        // Anything that goes wrong shows up on the page.
        diagnostics(problem) {
          document.getElementById("problems").textContent +=
            problem.message + "\n";
        },
      });
    </script>
  </body>
</html>
```

- **Your game** goes in the `<script id="game">` block. It's the same code
  as a sandbox game's `main.js`, so the tutorial's and the cookbook's code
  works there as it is. Save the file and reload the page to see a change.
- **Problems** appear above the game, in the same words the sandbox uses
  (`draw failed: screen.fil doesn't exist. Did you mean screen.fill?`). A
  game that fails stops and disappears, and only the message is left. The
  sandbox does more for you here: it marks the line and offers to fix it.
- **Saved data** (`storage`) belongs to the website the page comes from, so
  two games on the same site, or two files opened from your disk, share it
  unless each has its own `projectId`: add `projectId: "my_game",` next to
  `diagnostics` in `JGZ.run(...)`, with a different name for each game.
- **`@0.2`** in the address loads the newest 0.2 release. Write a full
  version, such as `@0.2.1`, to keep a page on one release.

### Images and sounds in a web page

Put the files in `images/` and `sounds/` folders next to the page, and list
them in an `assetUrls` map, so `JGZ.run` knows where each one is. The game
names them as usual: `new Actor("ship")`, `sounds.laser.play()`.

```js
JGZ.run(document.getElementById("game").textContent, {
  assetUrls: {
    "images/ship.png": "images/ship.png",
    "sounds/laser.wav": "sounds/laser.wav",
  },
  diagnostics(problem) {
    document.getElementById("problems").textContent += problem.message + "\n";
  },
});
```

Images load in a page opened from your disk, but browsers don't let such a
page load sounds. For sounds, open the page from a web server instead: run
one in the page's folder, such as `python3 -m http.server`, and open
`http://localhost:8000/my-game.html`. A file that doesn't load is reported above the game.
[Assets without a server](reference/loaders.md#assets-without-a-server)
covers the map in full.

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

**The sandbox won't start: "Failed to start server. Is port 4173 in use?"**
The sandbox uses two ports: 4173 for the editor, and the next one, 4174, for
the game preview. The message names the one that's taken. Something else is
already listening on it — either stop that, or run the sandbox on different
ports:

```sh
bun apps/sandbox/src/server.ts --port 4200
```

The preview then uses 4201, and you open `http://127.0.0.1:4200` instead.
To choose the preview's port yourself, add `--preview-port`, for example
`--preview-port 4300`.

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

**My game stopped with "… is not defined".** A name in your code doesn't
match anything your game or js-game-zero defines — usually a typo. The
message suggests the closest real name (`scren is not defined. Did you mean
screen?`), and the sandbox marks the line and offers to make the change. Browser features games
can't use, such as `setTimeout` or `document`, say what to use instead. A
misspelled library method, such as `screen.draw.cirlce`, fails the same way
with "doesn't exist. Did you mean screen.draw.circle?".

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
- [`docs/cli.md`](cli.md) — drive games programmatically for deterministic
  testing, state inspection, and screenshots.
