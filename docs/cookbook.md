# Cookbook

Short, standalone recipes for common tasks. Unlike the
[tutorial](tutorial.md), each recipe here is independent — copy the one you
need into a project and adapt it, rather than following them in order. Every
snippet is a complete, runnable `main.js`. Full option lists live in
[`docs/reference/`](reference/); this page is about getting something
working fast.

## Draw shapes

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Shapes";

function draw() {
  screen.fill("#0f172a", "#164e63");
  screen.draw.filled_rect([18, 22, 84, 52], "#f97316");
  screen.draw.line([0, 176], [320, 112], "#fde68a", 4);
  screen.draw.filled_circle([168, 72], 28, "#22c55e");
  screen.draw.polygon(
    [
      [238, 40],
      [292, 64],
      [270, 126],
      [214, 118],
    ],
    "#f8fafc",
    3,
  );
}
```

`screen.draw` has filled and outlined versions of rectangles, circles, and
polygons, plus `line` and `text`/`textbox`. See it running:
`/examples/drawing-basics`. Full list: [`docs/reference/screen.md`](reference/screen.md).

## Move an actor

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Move An Actor";

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

Multiply speed by `dt` in `update()` for frame-rate-independent movement.
See it running: `/examples/actor-movement`. Full API:
[`docs/reference/actor.md`](reference/actor.md).

## Play sounds

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Play Sounds";

let clicks = 0;

function draw() {
  screen.fill("#1f2937");
  screen.draw.filled_circle([160, 82], 28 + clicks * 4, "#38bdf8");
  screen.draw.text("click to play a sound", [76, 134], {
    fontsize: 16,
    color: "#f8fafc",
  });
}

function on_mouse_down() {
  clicks = Math.min(6, clicks + 1);
  sounds.tap.play();
  tone.play("C5", 0.08, { volume: 0.15 });
}
```

`sounds.<name>.play()` plays an asset from `sounds/` (upload one through the
Assets panel, e.g. `sounds/tap.wav`, then reference it as `sounds.tap`).
`tone.play(note, duration)` generates a short beep with no asset needed at
all. Both require a prior click or key press somewhere on the page — see
the audio-unlock note in the tutorial's [sound and tone
step](tutorial.md#7-sound-and-tone). See it running: `/examples/sound-tone`.
Full API: [`docs/reference/audio.md`](reference/audio.md).

## Save data

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Save Data";

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

Storage loads automatically before your code runs and saves automatically
after each change — no explicit `save()`/`load()` calls needed for normal
use. See it running: `/examples/storage-save`. Full API:
[`docs/reference/storage.md`](reference/storage.md).

## Animate properties

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Animate Properties";

let orb = { x: 48, y: 90 };
animate(orb, { x: 260, duration: 1, tween: "decelerate" });

function draw() {
  screen.fill("#18212f");
  screen.draw.line([48, 112], [260, 112], "#94a3b8", 3);
  screen.draw.filled_circle([orb.x, orb.y], 18, "#facc15");
}
```

`animate(target, options)` smoothly changes any numeric property (or array
of numbers) on any object over time, using one of 13 named easing curves.
Works on plain objects, `Actor`s, anything. See it running:
`/examples/animation-basics`. Full tween list:
[`docs/reference/clock.md#animation`](reference/clock.md#animation).

## Schedule events

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Schedule Events";

let enemies = 0;

function spawnEnemy() {
  enemies += 1;
}

clock.schedule(spawnEnemy, 1); // once, after 1 second
clock.schedule_interval(spawnEnemy, 2); // then again every 2 seconds

function draw() {
  screen.fill("#1c1330");
  screen.draw.text(`Enemies spawned: ${enemies}`, [24, 24], {
    fontsize: 20,
    color: "white",
  });
}
```

`clock.schedule(callback, delay)` runs once; `clock.schedule_interval`
repeats forever until `clock.unschedule(callback)` is called with the same
function reference. Full API: [`docs/reference/clock.md`](reference/clock.md).

## Handle the mouse wheel

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Mouse Wheel";

let zoom = 1;

function on_mouse_down(pos, button) {
  if (button === mouse.WHEEL_UP) zoom = Math.min(4, zoom + 0.2);
  if (button === mouse.WHEEL_DOWN) zoom = Math.max(0.2, zoom - 0.2);
}

function draw() {
  screen.fill("#0b1220");
  screen.draw.filled_circle([160, 90], 30 * zoom, "#38bdf8");
  screen.draw.text(`zoom: ${zoom.toFixed(1)}`, [16, 16], {
    fontsize: 16,
    color: "white",
  });
}
```

There's no separate wheel hook — scroll events arrive through
`on_mouse_down`, with `button` set to `mouse.WHEEL_UP` or
`mouse.WHEEL_DOWN`, matching pygame's convention of treating the wheel as
two extra mouse buttons. Full constant table:
[`docs/reference/hooks.md`](reference/hooks.md#mouse).

## Use explicit imports (no globals)

Everything above uses zero-boilerplate globals (`screen`, `keyboard`, `draw`
as a bare top-level function, ...), which is how the sandbox runs your code
and the fastest way to start. If you'd rather work with normal JavaScript
imports and no injected globals — publishing to npm, using a bundler, or
just personal preference — import from `@js-game-zero/core` and call `run()`
yourself:

```js
import { run, screen, keyboard } from "@js-game-zero/core";

run({
  WIDTH: 320,
  HEIGHT: 180,
  TITLE: "Explicit Imports",
  update(dt) {
    /* same idea as zero-boilerplate update(dt) */
  },
  draw() {
    screen.fill("#10243d");
    screen.draw.filled_circle([160, 90], 32, "#38bdf8");
  },
  onKeyDown(key) {
    /* camelCase hook aliases are only available in import mode */
  },
});
```

See it running: `/examples/sandbox-starter`. Full API:
[`docs/reference/runtime.md`](reference/runtime.md).
