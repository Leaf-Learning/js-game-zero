WIDTH = 480;
HEIGHT = 640;
TITLE = "Space Shooter";
TOUCH_CONTROLS = {
  up: keys.UP,
  down: keys.DOWN,
  left: keys.LEFT,
  right: keys.RIGHT,
  a: keys.SPACE,
};

// Change these to tune how the game feels.
const PLAYER_SPEED = 260; // pixels per second
const FIRE_COOLDOWN = 0.28; // seconds between shots
const LASER_SPEED = 420;
const INVULNERABLE_TIME = 1.4; // seconds of flashing after getting hit
const EXPLOSION_FRAME_TIME = 0.06;
const EXPLOSION_FRAMES = [
  "explosion_0",
  "explosion_1",
  "explosion_2",
  "explosion_3",
  "explosion_4",
];
const ENEMY_COLS = 4;
const ENEMY_SPACING_X = 104;
const ENEMY_SPACING_Y = 100;
const ENEMY_TOP = 70;
const BASE_ENEMY_VX = 40; // sideways drift of the whole formation
const BASE_ENEMY_DROP_SPEED = 18; // downward creep
const PLAYER_TOP_LIMIT = HEIGHT * 0.55; // player can't fly above this line

// A starfield drawn with plain rectangles instead of an image - it scrolls
// slowly downward to sell the feeling of flying through space.
const stars = Array.from({ length: 70 }, () => ({
  x: Math.random() * WIDTH,
  y: Math.random() * HEIGHT,
  size: Math.random() < 0.15 ? 2 : 1,
  speed: 30 + Math.random() * 60,
}));

const player = new Actor("player_ship", { center: [WIDTH / 2, HEIGHT - 70] });
let lasers = []; // player shots, each an Actor moving upward
let enemies = []; // the current wave, each an Actor moving as a group
let explosions = []; // { actor, frame, timer } - little animated bursts
let enemyVX = BASE_ENEMY_VX;
let enemyDropSpeed = BASE_ENEMY_DROP_SPEED;
let wave = 0;
let score = 0;
let lives = 3;
let fireCooldown = 0;
let invulnerableTime = 0;
let state = "playing"; // "playing" or "gameover"

function spawnWave() {
  wave += 1;
  enemies = [];
  // Keep new formations above the player's flight area, even in later waves.
  const rowCount = Math.min(2 + Math.floor((wave - 1) / 3), 3);
  const startX = (WIDTH - (ENEMY_COLS - 1) * ENEMY_SPACING_X) / 2;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < ENEMY_COLS; columnIndex += 1) {
      enemies.push(
        new Actor("enemy_ship", {
          center: [
            startX + columnIndex * ENEMY_SPACING_X,
            ENEMY_TOP + rowIndex * ENEMY_SPACING_Y,
          ],
        }),
      );
    }
  }
  // Escalating difficulty: every wave the formation drifts and descends
  // a little faster than the last.
  enemyVX = BASE_ENEMY_VX + wave * 6;
  enemyDropSpeed = BASE_ENEMY_DROP_SPEED + wave * 4;
}

function resetGame() {
  player.center = [WIDTH / 2, HEIGHT - 70];
  player.opacity = 1;
  lasers = [];
  explosions = [];
  score = 0;
  lives = 3;
  wave = 0;
  fireCooldown = 0;
  invulnerableTime = 0;
  state = "playing";
  spawnWave();
}
resetGame();

function explodeAt(pos) {
  explosions.push({
    actor: new Actor("explosion_0", { center: pos }),
    frame: 0,
    timer: 0,
  });
}

function fireLaser() {
  lasers.push(new Actor("laser", { midbottom: [player.x, player.top + 10] }));
  sounds.laser.play();
}

function on_key_down(key) {
  if (state === "gameover" && key === keys.SPACE) resetGame();
}

function on_mouse_down() {
  if (state === "gameover") resetGame();
}

function movePlayer(dt) {
  let vx = 0;
  let vy = 0;
  if (keyboard.left || keyboard.a) vx -= 1;
  if (keyboard.right || keyboard.d) vx += 1;
  if (keyboard.up || keyboard.w) vy -= 1;
  if (keyboard.down || keyboard.s) vy += 1;
  // Normalize diagonal input so it has the same speed as one direction.
  const length = Math.hypot(vx, vy) || 1;
  player.x += (vx / length) * PLAYER_SPEED * dt;
  player.y += (vy / length) * PLAYER_SPEED * dt;
  // Stay inside the lower part of the screen.
  player.clamp_ip([0, PLAYER_TOP_LIMIT, WIDTH, HEIGHT - PLAYER_TOP_LIMIT]);

  fireCooldown = Math.max(0, fireCooldown - dt);
  if (keyboard.space && fireCooldown <= 0) {
    fireLaser();
    fireCooldown = FIRE_COOLDOWN;
  }

  if (invulnerableTime > 0) {
    invulnerableTime = Math.max(0, invulnerableTime - dt);
    // Blink by flicking opacity a few times a second.
    player.opacity = Math.floor(invulnerableTime * 8) % 2 === 0 ? 1 : 0.3;
  } else {
    player.opacity = 1;
  }
}

function hitPlayer(enemyIndex) {
  explodeAt(enemies[enemyIndex].pos);
  enemies.splice(enemyIndex, 1);
  if (invulnerableTime > 0) return; // still flashing from the last hit
  lives -= 1;
  invulnerableTime = INVULNERABLE_TIME;
  sounds.hit.play();
  if (lives <= 0) state = "gameover";
}

function moveEnemies(dt) {
  if (enemies.length === 0) return;
  let minLeft = Infinity;
  let maxRight = -Infinity;
  for (const enemy of enemies) {
    minLeft = Math.min(minLeft, enemy.left);
    maxRight = Math.max(maxRight, enemy.right);
  }
  if (minLeft <= 0) enemyVX = Math.abs(enemyVX);
  if (maxRight >= WIDTH) enemyVX = -Math.abs(enemyVX);

  for (let index = enemies.length - 1; index >= 0; index -= 1) {
    const enemy = enemies[index];
    enemy.x += enemyVX * dt;
    enemy.y += enemyDropSpeed * dt;
    if (enemy.colliderect(player)) {
      hitPlayer(index);
      continue;
    }
    // An enemy that reaches the player's row without a collision still
    // costs a life - it "got through".
    if (enemy.top > player.bottom) {
      hitPlayer(index);
    }
  }
}

function moveLasers(dt) {
  for (let index = lasers.length - 1; index >= 0; index -= 1) {
    const laser = lasers[index];
    laser.y -= LASER_SPEED * dt;
    if (laser.bottom < 0) {
      lasers.splice(index, 1);
      continue;
    }
    const hitIndex = enemies.findIndex((enemy) => enemy.colliderect(laser));
    if (hitIndex !== -1) {
      explodeAt(enemies[hitIndex].pos);
      enemies.splice(hitIndex, 1);
      lasers.splice(index, 1);
      score += 10;
      sounds.explosion.play();
    }
  }
}

function moveExplosions(dt) {
  for (let index = explosions.length - 1; index >= 0; index -= 1) {
    const explosion = explosions[index];
    explosion.timer += dt;
    if (explosion.timer < EXPLOSION_FRAME_TIME) continue;
    // Advance every elapsed frame, including after a slow browser frame.
    const elapsedFrames = Math.floor(explosion.timer / EXPLOSION_FRAME_TIME);
    explosion.timer -= elapsedFrames * EXPLOSION_FRAME_TIME;
    explosion.frame += elapsedFrames;
    if (explosion.frame >= EXPLOSION_FRAMES.length) {
      explosions.splice(index, 1);
      continue;
    }
    explosion.actor.image = EXPLOSION_FRAMES[explosion.frame];
  }
}

function moveStars(dt) {
  for (const star of stars) {
    star.y += star.speed * dt;
    if (star.y > HEIGHT) star.y -= HEIGHT;
  }
}

function update(dt) {
  moveStars(dt);
  moveExplosions(dt); // let the final hit finish animating after game over
  if (state !== "playing") return;
  movePlayer(dt);
  moveLasers(dt);
  moveEnemies(dt);
  // Both lasers and contact with the player can remove the final enemy.
  if (enemies.length === 0 && state === "playing") spawnWave();
}

function draw() {
  screen.fill("#050414");
  for (const star of stars) {
    screen.draw.filled_rect([star.x, star.y, star.size, star.size], "#e2e8f0");
  }

  for (const laser of lasers) laser.draw();
  for (const enemy of enemies) enemy.draw();
  for (const explosion of explosions) explosion.actor.draw();
  if (state === "playing" || invulnerableTime > 0) player.draw();

  screen.draw.text(`Score: ${score}`, [12, 10], {
    fontsize: 22,
    color: "white",
  });
  screen.draw.text(`Wave: ${wave}`, undefined, {
    midtop: [WIDTH / 2, 10],
    fontsize: 22,
    color: "white",
  });
  screen.draw.text(`Lives: ${lives}`, undefined, {
    topright: [WIDTH - 12, 10],
    fontsize: 22,
    color: "white",
  });

  if (state === "gameover") {
    screen.draw.text("Game Over", undefined, {
      center: [WIDTH / 2, HEIGHT / 2 - 20],
      fontsize: 48,
      color: "#f87171",
      shadow: 2,
    });
    screen.draw.text("Click or press space to try again", undefined, {
      center: [WIDTH / 2, HEIGHT / 2 + 30],
      fontsize: 20,
      color: "white",
      shadow: 1,
    });
  }
}
