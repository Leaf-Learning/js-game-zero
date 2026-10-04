WIDTH = 640;
HEIGHT = 480;
TITLE = "Snake";
TOUCH_CONTROLS = {
  up: keys.UP,
  down: keys.DOWN,
  left: keys.LEFT,
  right: keys.RIGHT,
  start: keys.SPACE,
};

// Change these to tune how the game feels.
const CELL = 32; // size of one grid square, in pixels
const HUD_HEIGHT = CELL; // scores sit above the playable grid
const COLS = WIDTH / CELL;
const ROWS = (HEIGHT - HUD_HEIGHT) / CELL;
const START_INTERVAL = 0.18; // seconds between moves - lower is faster
const MIN_INTERVAL = 0.07; // the snake can't get faster than this
const SPEEDUP_STEP = 0.008; // how much faster each apple makes it

storage.setdefault("highscore", 0);

let snake; // array of {x, y} grid cells, snake[0] is the head
let direction; // current heading, e.g. {x: 1, y: 0}
let turnQueue; // turns applied one per tick, including quick corner inputs
let apple;
let score;
let moveInterval;
let state; // "playing", "dead", or "won"

function resetGame() {
  snake = [
    { x: 8, y: 7 },
    { x: 7, y: 7 },
    { x: 6, y: 7 },
  ];
  direction = { x: 1, y: 0 };
  turnQueue = [];
  score = 0;
  moveInterval = START_INTERVAL;
  state = "playing";
  placeApple();
  scheduleMove();
}

// The clock drives movement on a fixed schedule, independent of the
// frame rate. Re-calling this cancels any previous schedule first, which
// is how the snake speeds up after eating without stacking up duplicate
// intervals.
function scheduleMove() {
  clock.unschedule(moveSnake);
  clock.schedule_interval(moveSnake, moveInterval);
}

function placeApple() {
  // Pick from free cells so a full board ends the game instead of looping.
  const freeCells = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!snake.some((segment) => segment.x === x && segment.y === y)) {
        freeCells.push({ x, y });
      }
    }
  }
  if (freeCells.length === 0) {
    apple = null;
    state = "won";
    clock.unschedule(moveSnake);
    return;
  }
  const cell = freeCells[randomInt(freeCells.length)];
  apple = new Actor("fruit", { center: cellCenter(cell), width: CELL - 4 });
  apple.cell = cell;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function cellCenter(cell) {
  return [cell.x * CELL + CELL / 2, HUD_HEIGHT + cell.y * CELL + CELL / 2];
}

function turn(dx, dy) {
  if (state !== "playing" || turnQueue.length >= 2) return;
  const last = turnQueue[turnQueue.length - 1] ?? direction;
  if (last.x === -dx && last.y === -dy) return;
  if (last.x === dx && last.y === dy) return;
  turnQueue.push({ x: dx, y: dy });
}

function on_key_down(key) {
  if (key === keys.SPACE && state !== "playing") resetGame();
  else if (key === keys.LEFT || key === keys.A) turn(-1, 0);
  else if (key === keys.RIGHT || key === keys.D) turn(1, 0);
  else if (key === keys.UP || key === keys.W) turn(0, -1);
  else if (key === keys.DOWN || key === keys.S) turn(0, 1);
}

function on_mouse_down() {
  if (state !== "playing") resetGame();
}

function moveSnake() {
  if (state !== "playing") return;
  direction = turnQueue.shift() ?? direction;
  const head = snake[0];
  const next = { x: head.x + direction.x, y: head.y + direction.y };
  const eating = next.x === apple.cell.x && next.y === apple.cell.y;
  // The tail vacates its cell on a non-growing move, so it is safe to enter.
  const body = eating ? snake : snake.slice(0, -1);

  if (
    next.x < 0 ||
    next.x >= COLS ||
    next.y < 0 ||
    next.y >= ROWS ||
    body.some((segment) => segment.x === next.x && segment.y === next.y)
  ) {
    die();
    return;
  }

  snake.unshift(next);
  if (eating) {
    score += 1;
    sounds.eat.play();
    if (score > storage.highscore) storage.highscore = score;
    if (moveInterval > MIN_INTERVAL) {
      moveInterval = Math.max(MIN_INTERVAL, moveInterval - SPEEDUP_STEP);
      scheduleMove(); // showcase re-scheduling the clock at a new interval
    }
    placeApple();
  } else {
    snake.pop(); // no growth - drop the tail to keep the same length
  }
}

function die() {
  state = "dead";
  clock.unschedule(moveSnake);
  sounds.die.play();
}

resetGame();

function draw() {
  screen.fill("#111827");
  drawGrid();
  if (apple) apple.draw();
  drawSnake();

  screen.draw.text(`Score: ${score}`, [10, 8], {
    fontsize: 22,
    color: "white",
    shadow: 1,
  });
  screen.draw.text(`Best: ${storage.highscore}`, undefined, {
    topright: [WIDTH - 10, 8],
    fontsize: 22,
    color: "#facc15",
    shadow: 1,
  });

  if (state !== "playing") {
    screen.draw.text(state === "won" ? "You win!" : "Game Over", undefined, {
      center: [WIDTH / 2, HEIGHT / 2 - 16],
      fontsize: 44,
      color: "#f87171",
      shadow: 2,
    });
    screen.draw.text("Click or press space to play again", undefined, {
      center: [WIDTH / 2, HEIGHT / 2 + 28],
      fontsize: 20,
      color: "white",
      shadow: 1,
    });
  }
}

function drawGrid() {
  // A faint checkerboard makes the grid easy to read at a glance.
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if ((x + y) % 2 === 0) continue;
      screen.draw.filled_rect(
        [x * CELL, HUD_HEIGHT + y * CELL, CELL, CELL],
        "#1a2233",
      );
    }
  }
}

function drawSnake() {
  snake.forEach((segment, index) => {
    const inset = 2;
    const rect = [
      segment.x * CELL + inset,
      HUD_HEIGHT + segment.y * CELL + inset,
      CELL - inset * 2,
      CELL - inset * 2,
    ];
    screen.draw.filled_rect(rect, index === 0 ? "#4ade80" : "#22c55e");
  });
}
