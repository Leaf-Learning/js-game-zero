WIDTH = 640;
HEIGHT = 480;
TITLE = "Snake";

// Change these to tune how the game feels.
const CELL = 32; // size of one grid square, in pixels
const COLS = WIDTH / CELL;
const ROWS = HEIGHT / CELL;
const START_INTERVAL = 0.18; // seconds between moves - lower is faster
const MIN_INTERVAL = 0.07; // the snake can't get faster than this
const SPEEDUP_STEP = 0.008; // how much faster each apple makes it

storage.setdefault("highscore", 0);

let snake; // array of {x, y} grid cells, snake[0] is the head
let direction; // current heading, e.g. {x: 1, y: 0}
let pendingDirection; // queued turn, applied on the next tick
let apple;
let score;
let moveInterval;
let state; // "playing" or "dead"

function resetGame() {
  snake = [
    { x: 8, y: 7 },
    { x: 7, y: 7 },
    { x: 6, y: 7 },
  ];
  direction = { x: 1, y: 0 };
  pendingDirection = direction;
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
  // Keep picking random cells until one isn't under the snake.
  let cell;
  do {
    cell = { x: randomInt(COLS), y: randomInt(ROWS) };
  } while (
    snake.some((segment) => segment.x === cell.x && segment.y === cell.y)
  );
  apple = new Actor("fruit", { center: cellCenter(cell) });
  apple.cell = cell;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function cellCenter(cell) {
  return [cell.x * CELL + CELL / 2, cell.y * CELL + CELL / 2];
}

function turn(dx, dy) {
  // Compare against the already-queued direction (not the current one) so
  // two quick turns pressed before the next tick - e.g. down then left -
  // chain correctly instead of the second one being treated as a reversal
  // of the stale heading.
  if (pendingDirection.x === -dx && pendingDirection.y === -dy) return;
  pendingDirection = { x: dx, y: dy };
}

function on_key_down(key) {
  // Checking the polled `keyboard` state (rather than comparing `key`
  // against each direction constant) reads the just-pressed key too,
  // since it's marked down before this hook runs.
  if (keyboard.left || keyboard.a) turn(-1, 0);
  else if (keyboard.right || keyboard.d) turn(1, 0);
  else if (keyboard.up || keyboard.w) turn(0, -1);
  else if (keyboard.down || keyboard.s) turn(0, 1);
  else if (key === keys.SPACE && state === "dead") resetGame();
}

function on_mouse_down() {
  if (state === "dead") resetGame();
}

function moveSnake() {
  if (state !== "playing") return;
  direction = pendingDirection;
  const head = snake[0];
  const next = { x: head.x + direction.x, y: head.y + direction.y };

  if (
    next.x < 0 ||
    next.x >= COLS ||
    next.y < 0 ||
    next.y >= ROWS ||
    snake.some((segment) => segment.x === next.x && segment.y === next.y)
  ) {
    die();
    return;
  }

  snake.unshift(next);
  if (next.x === apple.cell.x && next.y === apple.cell.y) {
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
  sounds.die.play();
}

resetGame();

function draw() {
  screen.fill("#111827");
  drawGrid();
  apple.draw();
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

  if (state === "dead") {
    screen.draw.text("Game Over", undefined, {
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
      screen.draw.filled_rect([x * CELL, y * CELL, CELL, CELL], "#1a2233");
    }
  }
}

function drawSnake() {
  snake.forEach((segment, index) => {
    const inset = 2;
    const rect = [
      segment.x * CELL + inset,
      segment.y * CELL + inset,
      CELL - inset * 2,
      CELL - inset * 2,
    ];
    screen.draw.filled_rect(rect, index === 0 ? "#4ade80" : "#22c55e");
  });
}
