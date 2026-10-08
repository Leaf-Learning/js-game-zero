WIDTH = 800;
HEIGHT = 600;
TITLE = "Breakout";
TOUCH_CONTROLS = { left: keys.LEFT, right: keys.RIGHT, start: keys.SPACE };

// The wall of bricks is a grid: ROWS rows of COLUMNS bricks each, coloured
// by row so the wall looks striped like the classic game.
const COLUMNS = 10;
const ROWS = 5;
const BRICK_W = 64;
const BRICK_H = 32;
const BRICK_GAP = 6;
const GRID_LEFT = (WIDTH - COLUMNS * (BRICK_W + BRICK_GAP)) / 2;
const GRID_TOP = 80;
const BRICK_COLORS = [
  "brick_red",
  "brick_yellow",
  "brick_green",
  "brick_blue",
  "brick_purple",
];

const paddle = new Actor("paddle", { center: [WIDTH / 2, HEIGHT - 40] });
const ball = new Actor("ball", { center: [WIDTH / 2, HEIGHT / 2] });
ball.vx = 220;
ball.vy = -320;

let score = 0;
let lives = 3;
let bricks = [];
let state = "playing"; // "playing", "won", or "lost"

function buildBricks() {
  bricks = [];
  for (let rowIndex = 0; rowIndex < ROWS; rowIndex++) {
    for (let columnIndex = 0; columnIndex < COLUMNS; columnIndex++) {
      const x = GRID_LEFT + columnIndex * (BRICK_W + BRICK_GAP);
      const y = GRID_TOP + rowIndex * (BRICK_H + BRICK_GAP);
      bricks.push(new Actor(BRICK_COLORS[rowIndex], { topleft: [x, y] }));
    }
  }
}
buildBricks();

function resetBall() {
  ball.center = [WIDTH / 2, HEIGHT / 2];
  ball.vx = Math.random() < 0.5 ? -220 : 220;
  ball.vy = -320;
}

function startNewGame() {
  score = 0;
  lives = 3;
  state = "playing";
  buildBricks();
  paddle.x = WIDTH / 2;
  resetBall();
}

function clampPaddle() {
  paddle.clamp_ip(screen.bounds());
}

function on_mouse_move(pos) {
  if (state !== "playing") return;
  paddle.x = pos[0];
  clampPaddle();
}

function on_mouse_down() {
  if (state !== "playing") startNewGame();
}

function on_key_down(key) {
  if (state !== "playing" && key === keys.SPACE) startNewGame();
}

function moveBall(dt) {
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.left < 0) {
    ball.left = 0;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.right > WIDTH) {
    ball.right = WIDTH;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.top < 0) {
    ball.top = 0;
    ball.vy = Math.abs(ball.vy);
  }

  if (ball.vy > 0 && ball.colliderect(paddle)) {
    ball.bottom = paddle.top; // step out of the paddle so it can't re-hit next frame
    ball.vy = -Math.abs(ball.vy);
    // Where the ball hit the paddle (-1 left edge .. 1 right edge) steers
    // the bounce, so players can aim by catching the ball off-centre.
    const offset = (ball.x - paddle.x) / (paddle.width / 2);
    ball.vx = offset * 260;
    sounds.bounce.play();
    return;
  }

  const hitIndex = bricks.findIndex((brick) => ball.colliderect(brick));
  if (hitIndex !== -1) {
    const brick = bricks[hitIndex];
    bricks.splice(hitIndex, 1);
    score += 10;
    sounds.brick.play();
    // Bounce sideways if the ball mostly clipped a corner, otherwise bounce
    // straight back the way it came.
    const dx = (ball.x - brick.x) / BRICK_W;
    const dy = (ball.y - brick.y) / BRICK_H;
    if (Math.abs(dx) > Math.abs(dy)) {
      ball.vx = (dx > 0 ? 1 : -1) * Math.abs(ball.vx);
    } else {
      ball.vy = (dy > 0 ? 1 : -1) * Math.abs(ball.vy);
    }
    if (bricks.length === 0) state = "won";
  }

  if (ball.top > HEIGHT) {
    lives -= 1;
    if (lives <= 0) {
      state = "lost";
      sounds.lose.play();
    } else {
      resetBall();
    }
  }
}

function update(dt) {
  if (state !== "playing") return;
  if (keyboard.left) paddle.x -= 360 * dt;
  if (keyboard.right) paddle.x += 360 * dt;
  clampPaddle();

  // The ball is fast enough to fly clean through a paddle or brick between
  // two frames, so we move it in a few smaller steps instead of one big one.
  const steps = 3;
  for (let step = 0; step < steps; step += 1) {
    moveBall(dt / steps);
    if (state !== "playing") break; // the last ball just drained or won
  }
}

function draw() {
  screen.fill("#0f172a");
  for (const brick of bricks) brick.draw();
  paddle.draw();
  ball.draw();

  screen.draw.text(`Score: ${score}`, [16, 16], {
    fontsize: 22,
    color: "white",
  });
  screen.draw.text(`Lives: ${lives}`, undefined, {
    topright: [WIDTH - 16, 16],
    fontsize: 22,
    color: "white",
  });

  if (state === "won") {
    screen.draw.text("You win! Click or press space to play again", undefined, {
      center: [WIDTH / 2, HEIGHT / 2],
      fontsize: 28,
      color: "#facc15",
      shadow: 1,
    });
  } else if (state === "lost") {
    screen.draw.text(
      "Game over - click or press space to try again",
      undefined,
      {
        center: [WIDTH / 2, HEIGHT / 2],
        fontsize: 28,
        color: "#f87171",
        shadow: 1,
      },
    );
  }
}
