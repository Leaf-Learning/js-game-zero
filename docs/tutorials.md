# Tutorials

## Summary

These short tutorials use the zero-boilerplate browser runtime unless a section
explicitly imports from `@js-game-zero/core`. Each JavaScript snippet is checked
by `bun run docs:check`, and each linked example is launched by Playwright.

## Tutorial 1: Draw A Shape

Example route: `/examples/drawing-basics`

```js
WIDTH = 640;
HEIGHT = 360;
TITLE = "Drawing Basics";

function draw() {
  screen.fill("#0f172a", "#164e63");
  screen.draw.filled_rect([48, 52, 160, 96], "#f97316");
  screen.draw.filled_circle([360, 160], 52, "gold");
  screen.draw.line([0, 340], [640, 260], "#ffffff", 4);
}
```

The runtime creates a canvas, injects `screen`, and calls `draw` each frame.
Use `screen.clear()` to reset the frame to black, or `screen.fill()` for a solid
or gradient background.

## Tutorial 2: Actors And Input

Example route: `/examples/actor-movement`

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Actor Movement";

let player = new Actor("player.svg", { center: [72, 92] });

function update(dt) {
  if (keyboard.right) player.x += 130 * dt;
  if (keyboard.left) player.x -= 130 * dt;
  player.x = Math.max(18, Math.min(WIDTH - 18, player.x));
}

function draw() {
  screen.fill("#111827");
  screen.draw.filled_rect([0, 130, WIDTH, 50], "#334155");
  player.draw();
}
```

Put `player.svg` in `images/player.svg`. `Actor("player.svg")` resolves that
asset name relative to the images directory, and `keyboard.left`/`keyboard.right`
reflect real browser key state.

## Tutorial 3: Sound And Tone

Example route: `/examples/sound-tone`

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Sound And Tone";

let clicks = 0;

function draw() {
  screen.fill("#1f2937");
  screen.draw.filled_circle([160, 82], 28 + clicks * 4, "#38bdf8");
  screen.draw.text("click for tone", [96, 134], {
    fontsize: 18,
    color: "#f8fafc",
  });
}

function on_mouse_down() {
  clicks = Math.min(6, clicks + 1);
  tone.play("C5", 0.08, { volume: 0.15 });
}
```

Browser audio starts after a user gesture, so tone and sound examples are
triggered from mouse or keyboard hooks.

## Tutorial 4: Storage

Example route: `/examples/storage-save`

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Storage Save";

let score = storage.get("score") ?? 0;

function update() {
  score += 1;
  storage.set("score", score);
}

function draw() {
  screen.fill("#12312b");
  screen.draw.text(`score ${score}`, [92, 76], {
    fontsize: 28,
    color: "#ffffff",
  });
}
```

Browser projects store values under a project-scoped key. In the sandbox,
storage can use the file adapter so saves stay inside the selected project
directory.

## Tutorial 5: Sandbox Workflow

Example route: `/examples/sandbox-starter`

1. Run `bun run dev:sandbox`.
2. Open `http://localhost:4173`.
3. Create a project named `first_game`.
4. Replace `main.js` with the snippet below.
5. Press Play and verify the preview canvas redraws.

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Sandbox Starter";

function draw() {
  screen.fill("#10243d");
  screen.draw.filled_circle([160, 90], 42, "#38bdf8");
  screen.draw.text("js-game-zero", [22, 24], {
    fontsize: 24,
    color: "#ffffff",
  });
}
```

The sandbox writes project files to `.jgz-projects` by default. Use
`bun run dev:sandbox -- --projects-root <path>` when you want a disposable root
for tests or workshops.

## Verification Criteria

- `bun run docs:check` compiles or executes every JavaScript tutorial snippet.
- Playwright launches every tutorial-backed example route and checks a visible
  canvas or deterministic status marker.
- The sandbox workflow is verified from a clean project root in browser e2e.
