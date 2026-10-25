# Tutorial: Build Your First Game

This tutorial builds a complete tiny game, **Comet Catcher**, from an empty
sandbox project to a finished win/lose game with score, sound, and a saved
high score. Every code block below is the _complete_ contents of `main.js`
at that point — copy the whole block over whatever is already in your
editor rather than pasting fragments in, and you'll always have something
that runs.

You'll need the sandbox running: `bun run dev:sandbox`, then open
`http://127.0.0.1:4173`. If anything here is unfamiliar about the sandbox
itself (panels, buttons, autosave), [`docs/sandbox.md`](sandbox.md) has the
full tour — this tutorial only explains what you need as you go.

## 1. Create the project

On the sandbox's front page, choose **Start from an example**, then pick
**Actor Movement**. Name the project `comet_catcher`.

Why start from an example instead of a blank project? Actor Movement ships
with an `images/player.svg` sprite, and we want a sprite to fly around the
screen. Starting here means the asset is already sitting in your project's
Assets panel, ready to use — no drawing or uploading required to get going.
We're about to replace all of its _code_, but we're keeping its _sprite_.

Open `main.js` in the editor and select all the existing code — you'll
replace it completely in the next step.

## 2. A blank window

Every js-game-zero game starts by declaring how big its window is. Replace
`main.js` with:

```js
WIDTH = 480;
HEIGHT = 360;
TITLE = "Comet Catcher";

function draw() {
  screen.fill("#0b1220");
}
```

- `WIDTH` and `HEIGHT` are the canvas size in pixels. They must be assigned
  exactly like this — all capitals — because the runtime looks for those
  exact names. `width`/`Width`/`WIDTh` are just ordinary variables to
  JavaScript and won't resize anything.
- `TITLE` sets the browser tab title.
- `draw()` runs once per frame and is where everything you see on screen
  gets painted. `screen.fill(color)` clears the canvas to a solid color —
  we're using a dark navy so our comets and player show up clearly.

Press **Play**. You should see a plain dark blue rectangle — that's your
game window.

## 3. Draw some shapes

Let's sketch the scene before we add anything that moves: a strip of
"ground" at the bottom, and a circle standing in for our player until we
wire up the real sprite.

```js
WIDTH = 480;
HEIGHT = 360;
TITLE = "Comet Catcher";

function draw() {
  screen.fill("#0b1220", "#132a43");
  screen.draw.filledRect([0, 330, WIDTH, 30], "#1e293b");
  screen.draw.filledCircle([240, 300], 18, "#38bdf8");
}
```

`screen.fill(color, gcolor)` with two colors draws a top-to-bottom gradient
instead of a flat fill. `screen.draw.filledRect([left, top, width,
height], color)` and `screen.draw.filledCircle([x, y], radius, color)` are
two of several drawing primitives — `docs/reference/screen.md` covers the
rest (lines, outlined shapes, polygons, text).

## 4. Add a sprite

Now let's swap that stand-in circle for the real player sprite. Open the
**Assets** panel on the left — you should see `images/player.svg` listed
already (that's what we got from starting off the Actor Movement example).
Click it to preview it if you like.

```js
WIDTH = 480;
HEIGHT = 360;
TITLE = "Comet Catcher";

let player = new Actor("player.svg", { midBottom: [240, 350] });

function draw() {
  screen.fill("#0b1220", "#132a43");
  screen.draw.filledRect([0, 330, WIDTH, 30], "#1e293b");
  player.draw();
}
```

`new Actor("player.svg", { midBottom: [240, 350] })` loads the image named
`player.svg` and positions it so its bottom-center point sits at `[240,
350]` — standing on the ground strip. Full positioning and property details
are in `docs/reference/actor.md`.

**Asset names are case-sensitive and must be lowercase.** `"player.svg"`
works; `"Player.svg"` or `"PLAYER.SVG"` will fail to load even though the
file on disk is named `player.svg`, because asset names in this framework
are always lowercase by convention. If you ever add your own image, drop it
into the Assets panel's **Images** section (via the **Upload** button or by
dragging it into the panel) and reference it the same way, in lowercase,
matching the filename you uploaded.

## 5. Move with the keyboard

```js
WIDTH = 480;
HEIGHT = 360;
TITLE = "Comet Catcher";

let player = new Actor("player.svg", { midBottom: [240, 350] });

function update(dt) {
  if (keyboard.left) player.x -= 220 * dt;
  if (keyboard.right) player.x += 220 * dt;
  player.clampIp(screen.bounds());
}

function draw() {
  screen.fill("#0b1220", "#132a43");
  screen.draw.filledRect([0, 330, WIDTH, 30], "#1e293b");
  player.draw();
}
```

`update(dt)` runs once per frame, right before `draw()`. `dt` is the number
of seconds since the last frame — multiplying a speed (pixels per second)
by `dt` gives you frame-rate-independent movement, so the player moves at
the same speed whether the game is running at 30fps or 144fps.
`keyboard.left` and `keyboard.right` are `true` while those arrow keys are
held down. `player.clampIp(screen.bounds())` keeps the player from sliding
off either edge of the window: `screen.bounds()` is a rectangle covering the
whole game, and `clampIp` moves the player back inside it.

Press Play, then **click the game canvas once** before pressing the arrow
keys — the sandbox (like any web page with an embedded frame) only sends
keyboard events to whichever part of the page currently has focus, so an
un-clicked preview won't see your key presses. A "Click the game to use
your keyboard" prompt covers the game each time you press Play, and again
whenever you click somewhere else, such as the editor. Click it (or the
canvas itself) to give the game your keyboard.

## 6. Add mouse input

Let's make clicking do something: drop a comet at the click's x position,
falling from the top.

```js
WIDTH = 480;
HEIGHT = 360;
TITLE = "Comet Catcher";

let player = new Actor("player.svg", { midBottom: [240, 350] });
let comets = [];

function spawnComet(x) {
  comets.push({ x, y: -20, radius: 14 });
}

function onMouseDown(pos) {
  spawnComet(pos[0]);
}

function update(dt) {
  if (keyboard.left) player.x -= 220 * dt;
  if (keyboard.right) player.x += 220 * dt;
  player.clampIp(screen.bounds());

  for (const comet of comets) {
    comet.y += 140 * dt;
  }
}

function draw() {
  screen.fill("#0b1220", "#132a43");
  screen.draw.filledRect([0, 330, WIDTH, 30], "#1e293b");
  for (const comet of comets) {
    screen.draw.filledCircle([comet.x, comet.y], comet.radius, "#facc15");
  }
  player.draw();
}
```

`onMouseDown(pos)` fires whenever the canvas is clicked; `pos` is the
`[x, y]` click position in canvas pixels. Click anywhere and watch a yellow
comet fall from that x position. (`onMouseDown` also receives a second
parameter, `button`, if you want to tell left/right/middle clicks apart —
see `docs/reference/hooks.md`.)

## 7. Sound and tone

Let's reward the player with a sound. `tone` generates a short beep with no
sound file needed — perfect for quick feedback like this.

```js
WIDTH = 480;
HEIGHT = 360;
TITLE = "Comet Catcher";

let player = new Actor("player.svg", { midBottom: [240, 350] });
let comets = [];
let score = 0;

function spawnComet(x) {
  comets.push({ x, y: -20, radius: 14 });
}

function onMouseDown(pos) {
  spawnComet(pos[0]);
}

function update(dt) {
  if (keyboard.left) player.x -= 220 * dt;
  if (keyboard.right) player.x += 220 * dt;
  player.clampIp(screen.bounds());

  const remaining = [];
  for (const comet of comets) {
    comet.y += 140 * dt;
    if (player.touches([comet.x, comet.y])) {
      score += 1;
      tone.play("C5", 0.12);
    } else if (comet.y < HEIGHT + 20) {
      remaining.push(comet);
    }
  }
  comets = remaining;
}

function draw() {
  screen.fill("#0b1220", "#132a43");
  screen.draw.filledRect([0, 330, WIDTH, 30], "#1e293b");
  for (const comet of comets) {
    screen.draw.filledCircle([comet.x, comet.y], comet.radius, "#facc15");
  }
  player.draw();
  screen.draw.text(`Score: ${score}`, [16, 16], {
    size: 20,
    color: "white",
  });
}
```

`player.touches([comet.x, comet.y])` checks whether the falling
comet's position is inside the player's hitbox; if so, we count it as
caught, bump the score, and play a `"C5"` tone (a musical note name — you
can also pass a frequency in Hz). Comets that fall past the bottom without
being caught are simply dropped from the array.

**Browsers block audio until the page has seen a user gesture** — a click
or key press. This is a browser rule, not something this framework can turn
off. In practice it's rarely a problem: the same click that spawns a comet
(or the click on the "use your keyboard" prompt from the last step) already
counts as that gesture, so by the time any comet is close enough to catch,
audio is already unlocked. If you ever add a sound that should play the
_instant_ the game loads, trigger it lazily on the player's first click or
key press instead of at startup, or it may play silently.

## 8. Schedule comets with the clock

Clicking to spawn every comet works, but a real game should keep the
pressure on by itself. `clock.scheduleInterval` calls a function
repeatedly, on a timer:

```js
WIDTH = 480;
HEIGHT = 360;
TITLE = "Comet Catcher";

let player = new Actor("player.svg", { midBottom: [240, 350] });
let comets = [];
let score = 0;

function spawnComet(x) {
  comets.push({ x, y: -20, radius: 14 });
}

function spawnRandomComet() {
  spawnComet(randomInt(24, WIDTH - 24));
}

clock.scheduleInterval(spawnRandomComet, 1.1);

function onMouseDown(pos) {
  spawnComet(pos[0]);
}

function update(dt) {
  if (keyboard.left) player.x -= 220 * dt;
  if (keyboard.right) player.x += 220 * dt;
  player.clampIp(screen.bounds());

  const remaining = [];
  for (const comet of comets) {
    comet.y += 140 * dt;
    if (player.touches([comet.x, comet.y])) {
      score += 1;
      tone.play("C5", 0.12);
    } else if (comet.y < HEIGHT + 20) {
      remaining.push(comet);
    }
  }
  comets = remaining;
}

function draw() {
  screen.fill("#0b1220", "#132a43");
  screen.draw.filledRect([0, 330, WIDTH, 30], "#1e293b");
  for (const comet of comets) {
    screen.draw.filledCircle([comet.x, comet.y], comet.radius, "#facc15");
  }
  player.draw();
  screen.draw.text(`Score: ${score}`, [16, 16], {
    size: 20,
    color: "white",
  });
}
```

`clock.scheduleInterval(spawnRandomComet, 1.1)` is called once, at the top
of the file — it doesn't need to be inside `update()`. From then on, a new
comet appears at a random x position roughly every 1.1 seconds, on top of
whatever you spawn by clicking. `randomInt(24, WIDTH - 24)` picks a random
whole number from 24 to `WIDTH - 24`, including both ends, so comets never
start half off the screen.

## 9. Score and a saved high score

Right now the score resets every time you reload the page. `storage` fixes
that — it's a persistent key/value store, and (unlike some frameworks) you
don't need to explicitly save or load it:

```js
WIDTH = 480;
HEIGHT = 360;
TITLE = "Comet Catcher";

let player = new Actor("player.svg", { midBottom: [240, 350] });
let comets = [];
let score = 0;
let highScore = storage.get("highScore") ?? 0;

function spawnComet(x) {
  comets.push({ x, y: -20, radius: 14 });
}

function spawnRandomComet() {
  spawnComet(randomInt(24, WIDTH - 24));
}

clock.scheduleInterval(spawnRandomComet, 1.1);

function onMouseDown(pos) {
  spawnComet(pos[0]);
}

function update(dt) {
  if (keyboard.left) player.x -= 220 * dt;
  if (keyboard.right) player.x += 220 * dt;
  player.clampIp(screen.bounds());

  const remaining = [];
  for (const comet of comets) {
    comet.y += 140 * dt;
    if (player.touches([comet.x, comet.y])) {
      score += 1;
      if (score > highScore) {
        highScore = score;
        storage.set("highScore", highScore);
      }
      tone.play("C5", 0.12);
    } else if (comet.y < HEIGHT + 20) {
      remaining.push(comet);
    }
  }
  comets = remaining;
}

function draw() {
  screen.fill("#0b1220", "#132a43");
  screen.draw.filledRect([0, 330, WIDTH, 30], "#1e293b");
  for (const comet of comets) {
    screen.draw.filledCircle([comet.x, comet.y], comet.radius, "#facc15");
  }
  player.draw();
  screen.draw.text(`Score: ${score}`, [16, 16], {
    size: 20,
    color: "white",
  });
  screen.draw.text(`Best: ${highScore}`, [16, 40], {
    size: 16,
    color: "#94a3b8",
  });
}
```

`storage.get("highScore") ?? 0` runs once, at the top of the file, and
already sees last session's value — storage is loaded automatically before
your game code runs. `storage.set("highScore", highScore)` saves it back;
you don't need to call anything like `storage.save()` yourself, changes are
written out automatically a moment after you make them. Play a round, beat
your score, then reload the page — "Best" should hold.

## 10. Win, lose, and play again

Let's finish the game: three lives, a score target to win, and a click to
play again once it's over.

```js
WIDTH = 480;
HEIGHT = 360;
TITLE = "Comet Catcher";

const WIN_SCORE = 8;
const START_LIVES = 3;

let player = new Actor("player.svg", { midBottom: [240, 350] });
let comets = [];
let score = 0;
let lives = START_LIVES;
let highScore = storage.get("highScore") ?? 0;
let over = false;
let won = false;

function spawnComet(x) {
  comets.push({ x, y: -20, radius: 14 });
}

function spawnRandomComet() {
  if (over) return;
  spawnComet(randomInt(24, WIDTH - 24));
}

clock.scheduleInterval(spawnRandomComet, 1.1);

function endGame(playerWon) {
  over = true;
  won = playerWon;
  if (score > highScore) {
    highScore = score;
    storage.set("highScore", highScore);
  }
}

function resetGame() {
  comets = [];
  score = 0;
  lives = START_LIVES;
  over = false;
  won = false;
}

function onMouseDown(pos) {
  if (over) {
    resetGame();
    return;
  }
  spawnComet(pos[0]);
}

function update(dt) {
  if (over) return;

  if (keyboard.left) player.x -= 220 * dt;
  if (keyboard.right) player.x += 220 * dt;
  player.clampIp(screen.bounds());

  const remaining = [];
  for (const comet of comets) {
    comet.y += 140 * dt;
    if (player.touches([comet.x, comet.y])) {
      score += 1;
      tone.play("C5", 0.12);
      if (score >= WIN_SCORE) endGame(true);
    } else if (comet.y < HEIGHT + 20) {
      remaining.push(comet);
    } else {
      lives -= 1;
      tone.play("A2", 0.2, { waveform: "square" });
      if (lives <= 0) endGame(false);
    }
  }
  comets = remaining;
}

function draw() {
  screen.fill("#0b1220", "#132a43");
  screen.draw.filledRect([0, 330, WIDTH, 30], "#1e293b");
  for (const comet of comets) {
    screen.draw.filledCircle([comet.x, comet.y], comet.radius, "#facc15");
  }
  player.draw();
  screen.draw.text(`Score: ${score}`, [16, 16], {
    size: 20,
    color: "white",
  });
  screen.draw.text(`Lives: ${lives}`, [16, 40], {
    size: 16,
    color: "#94a3b8",
  });
  screen.draw.text(`Best: ${highScore}`, [16, 62], {
    size: 16,
    color: "#94a3b8",
  });

  if (over) {
    const message = won
      ? "You win! Click to play again"
      : "Game over — click to play again";
    screen.draw.text(message, {
      center: [WIDTH / 2, HEIGHT / 2],
      size: 26,
      color: "white",
      background: "#0b1220cc",
    });
  }
}
```

What changed:

- A comet that reaches the bottom uncaught now costs a life instead of just
  vanishing, with a lower-pitched "thud" tone so catching and missing sound
  different.
- `endGame(playerWon)` freezes the game (`over = true`) and records the
  high score one last time.
- While `over` is `true`, `update()` returns immediately (nothing keeps
  moving) and `spawnRandomComet` refuses to add more comets, so the scene
  holds still.
- `onMouseDown` now does double duty: normally it spawns a comet, but
  once the game is over the very next click calls `resetGame()` instead,
  putting everything back to the start.

Play it: dodge with the arrow keys, click to add extra comets if you're
bored waiting, catch eight to win, miss three to lose, and click anywhere
on the game-over screen to go again.

## Where to go next

- [`docs/cookbook.md`](cookbook.md) has short, standalone recipes for
  specific tasks (drawing, sound, saving data, the mouse wheel, and more) if
  you want to try something this tutorial didn't cover.
- [`docs/reference/`](reference/) documents every symbol used above (and
  everything else in the framework) in full — signatures, every option, and
  a short example each.
- [`docs/examples.md`](examples.md) lists the full example games shipped
  with the sandbox, including five complete games, if you'd like to read
  more source before writing your own.
