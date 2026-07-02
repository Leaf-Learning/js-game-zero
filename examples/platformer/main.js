TILE_SIZE = 54; // every tile and the player sprite are drawn at this pixel size
const COLS = 16;
const ROWS = 9;
WIDTH = COLS * TILE_SIZE;
HEIGHT = ROWS * TILE_SIZE;
TITLE = "Platformer";

// The level, hand-authored as one string per row. This is the whole
// layout: '#' is solid ground, 'G' is a gem, 'F' is the goal flag, '~' is
// decorative water (not solid - it just shows where a fall leads), and
// '.' is empty air.
const LEVEL = [
  "................",
  "................",
  ".............F..",
  "..........G.####",
  ".G..............",
  ".......G.###..G.",
  ".............###",
  "####..###.......",
  "####~~###~~~~~~~",
];
const START_CELL = { column: 1, rowIndex: 7 };
// Purely cosmetic - trees that stand on the ground but never affect play.
const DECORATIONS = [
  new Actor("tree", { midbottom: cellTop({ column: 0, rowIndex: 7 }) }),
  new Actor("tree", { midbottom: cellTop({ column: 15, rowIndex: 6 }) }),
];

// Change these to tune how the game feels.
const MOVE_SPEED = 250;
const GRAVITY = 1700;
const JUMP_SPEED = 680;
const MAX_FALL_SPEED = 900;
const COYOTE_TIME = 0.12; // grace period to jump just after walking off a ledge

const player = new Actor("player", { midbottom: cellTop(START_CELL) });
player.vx = 0;
player.vy = 0;
// The player spawns standing on solid ground, so start grounded rather
// than waiting for the first physics frame to discover that - otherwise
// a jump pressed the instant the game loads would be dropped.
let onGround = true;
let coyoteTimer = COYOTE_TIME;
let gems = []; // Actors still waiting to be collected
let flag;
let score = 0;
let state = "playing"; // "playing" or "won"

function cellTop(cell) {
  return [cell.column * TILE_SIZE + TILE_SIZE / 2, cell.rowIndex * TILE_SIZE];
}

function cellCenter(columnIndex, rowIndex) {
  return [
    columnIndex * TILE_SIZE + TILE_SIZE / 2,
    rowIndex * TILE_SIZE + TILE_SIZE / 2,
  ];
}

function isSolidCell(columnIndex, rowIndex) {
  if (
    columnIndex < 0 ||
    columnIndex >= COLS ||
    rowIndex < 0 ||
    rowIndex >= ROWS
  ) {
    return false;
  }
  return LEVEL[rowIndex][columnIndex] === "#";
}

function buildLevel() {
  gems = [];
  for (let rowIndex = 0; rowIndex < ROWS; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < COLS; columnIndex += 1) {
      const tile = LEVEL[rowIndex][columnIndex];
      if (tile === "G") {
        gems.push(
          new Actor("gem", { center: cellCenter(columnIndex, rowIndex) }),
        );
      }
      if (tile === "F") {
        flag = new Actor("flag", { center: cellCenter(columnIndex, rowIndex) });
      }
    }
  }
}
buildLevel();

function resetGame() {
  player.midbottom = cellTop(START_CELL);
  player.vx = 0;
  player.vy = 0;
  onGround = true;
  coyoteTimer = COYOTE_TIME;
  score = 0;
  state = "playing";
  buildLevel();
}

function respawn() {
  // A gentler reset than resetGame(): keep the score and collected gems,
  // just send the player back to the start after a fall.
  player.midbottom = cellTop(START_CELL);
  player.vx = 0;
  player.vy = 0;
}

function on_key_down(key) {
  if (key === keys.UP || key === keys.W || key === keys.SPACE) tryJump();
  if (state !== "playing" && key === keys.SPACE) resetGame();
}

function on_mouse_down() {
  if (state !== "playing") resetGame();
}

function tryJump() {
  if (state !== "playing" || coyoteTimer <= 0) return;
  player.vy = -JUMP_SPEED;
  coyoteTimer = 0;
  sounds.jump.play();
}

// Rows/columns of tiles a rectangle (given by its edges) overlaps.
function spannedRange(low, high) {
  const range = [];
  for (
    let index = Math.floor(low / TILE_SIZE);
    index <= Math.floor((high - 1) / TILE_SIZE);
    index += 1
  ) {
    range.push(index);
  }
  return range;
}

function moveHorizontal(dt) {
  player.x += player.vx * dt;
  const rowsCovered = spannedRange(player.top + 2, player.bottom - 2);
  if (player.vx > 0) {
    const columnIndex = Math.floor((player.right - 1) / TILE_SIZE);
    if (rowsCovered.some((rowIndex) => isSolidCell(columnIndex, rowIndex))) {
      player.right = columnIndex * TILE_SIZE;
      player.vx = 0;
    }
  } else if (player.vx < 0) {
    const columnIndex = Math.floor(player.left / TILE_SIZE);
    if (rowsCovered.some((rowIndex) => isSolidCell(columnIndex, rowIndex))) {
      player.left = (columnIndex + 1) * TILE_SIZE;
      player.vx = 0;
    }
  }
  player.left = Math.max(0, Math.min(WIDTH - player.width, player.left));
}

function moveVertical(dt) {
  player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL_SPEED);
  player.y += player.vy * dt;
  onGround = false;
  const columnsCovered = spannedRange(player.left + 2, player.right - 2);
  if (player.vy > 0) {
    const rowIndex = Math.floor((player.bottom - 1) / TILE_SIZE);
    if (
      columnsCovered.some((columnIndex) => isSolidCell(columnIndex, rowIndex))
    ) {
      player.bottom = rowIndex * TILE_SIZE;
      player.vy = 0;
      onGround = true;
    }
  } else if (player.vy < 0) {
    const rowIndex = Math.floor(player.top / TILE_SIZE);
    if (
      columnsCovered.some((columnIndex) => isSolidCell(columnIndex, rowIndex))
    ) {
      player.top = (rowIndex + 1) * TILE_SIZE;
      player.vy = 0;
    }
  }
}

function updatePlayer(dt) {
  player.vx = 0;
  if (keyboard.left || keyboard.a) player.vx -= MOVE_SPEED;
  if (keyboard.right || keyboard.d) player.vx += MOVE_SPEED;

  moveHorizontal(dt);
  moveVertical(dt);

  // Coyote time: keep the jump available for a few frames after leaving
  // solid ground, so a jump pressed a beat too late still feels fair.
  coyoteTimer = onGround ? COYOTE_TIME : Math.max(0, coyoteTimer - dt);

  if (player.top > HEIGHT) respawn(); // fell off the world

  const gemIndex = gems.findIndex((gem) => player.colliderect(gem));
  if (gemIndex !== -1) {
    gems.splice(gemIndex, 1);
    score += 1;
    sounds.coin.play();
  }

  if (flag && player.colliderect(flag)) state = "won";
}

function update(dt) {
  if (state === "playing") updatePlayer(dt);
}

function draw() {
  screen.fill("#7dd3fc"); // sky
  drawLevel();
  for (const tree of DECORATIONS) tree.draw();
  for (const gem of gems) gem.draw();
  if (flag) flag.draw();
  player.draw();

  screen.draw.text(`Gems: ${score}`, [10, 8], {
    fontsize: 22,
    color: "white",
    shadow: 1,
  });

  if (state === "won") {
    screen.draw.text("You made it!", undefined, {
      center: [WIDTH / 2, HEIGHT / 2 - 16],
      fontsize: 42,
      color: "#facc15",
      shadow: 2,
    });
    screen.draw.text("Click or press space to play again", undefined, {
      center: [WIDTH / 2, HEIGHT / 2 + 26],
      fontsize: 20,
      color: "white",
      shadow: 1,
    });
  }
}

function drawLevel() {
  for (let rowIndex = 0; rowIndex < ROWS; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < COLS; columnIndex += 1) {
      const tile = LEVEL[rowIndex][columnIndex];
      const pos = [columnIndex * TILE_SIZE, rowIndex * TILE_SIZE];
      if (tile === "#") {
        const image = isSolidCell(columnIndex, rowIndex - 1)
          ? "ground_fill"
          : "ground_top";
        screen.blit(image, pos);
      } else if (tile === "~") {
        screen.blit("water", pos);
      }
    }
  }
}
