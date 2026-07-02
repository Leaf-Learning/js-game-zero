WIDTH = 800;
HEIGHT = 480;
TITLE = "Flappy Bird";

// Change these to tune how the game feels.
const GAP = 170; // vertical space the plane must fly through
const GRAVITY = 900; // pixels per second^2 pulling the plane down
const FLAP_STRENGTH = 320; // upward speed applied by a single flap
const PIPE_SPEED = 220; // how fast the rocks scroll toward the plane

const plane = new Actor("plane", { center: [140, HEIGHT / 2] });
plane.vy = 0; // Actor doesn't know about velocity, so we track our own.
plane.crashed = false;

let score = 0;
storage.setdefault("highscore", 0);

// The rocks are drawn hanging from the ceiling and standing on the floor,
// anchored at the point closest to the gap so their pointy tips line up.
const rockTop = new Actor("rock_top", { anchor: ["left", "bottom"] });
const rockBottom = new Actor("rock_bottom", { anchor: ["left", "top"] });

function resetPipes() {
  const gapCenter = 150 + Math.random() * (HEIGHT - 300);
  rockTop.pos = [WIDTH + 40, gapCenter - GAP / 2];
  rockBottom.pos = [WIDTH + 40, gapCenter + GAP / 2];
}
resetPipes();

function resetGame() {
  plane.center = [140, HEIGHT / 2];
  plane.vy = 0;
  plane.angle = 0;
  plane.crashed = false;
  score = 0;
  resetPipes();
}

function flap() {
  if (plane.crashed) {
    resetGame();
    return;
  }
  plane.vy = -FLAP_STRENGTH;
  sounds.flap.play();
}

function on_mouse_down() {
  flap();
}

function on_key_down(key) {
  if (key === keys.SPACE) flap();
}

// Rocks look like tall spikes with a lot of empty space around the tip, so
// colliding against their full image would feel unfair. Shrinking both
// boxes a little before testing keeps near-misses feeling like near-misses.
function hitsRock(rock) {
  return plane.inflate(-16, -10).colliderect(rock.inflate(-30, 0));
}

function updatePlane(dt) {
  plane.vy += GRAVITY * dt;
  plane.y += plane.vy * dt;
  // Nose up while climbing, nose down while falling - a small touch that
  // makes the flight feel alive.
  plane.angle = Math.max(-25, Math.min(75, -plane.vy / 8));

  if (plane.crashed) {
    plane.y = Math.min(plane.y, HEIGHT - 30); // stay in view after dying
    return;
  }

  if (plane.top < 0) {
    plane.top = 0;
    plane.vy = 0;
  }
  if (plane.bottom > HEIGHT || hitsRock(rockTop) || hitsRock(rockBottom)) {
    plane.crashed = true;
    sounds.hit.play();
  }
}

function updatePipes(dt) {
  if (plane.crashed) return; // freeze the course while the game is over
  rockTop.left -= PIPE_SPEED * dt;
  rockBottom.left -= PIPE_SPEED * dt;
  if (rockTop.right < 0) {
    resetPipes();
    score += 1;
    sounds.score.play();
    if (score > storage.highscore) {
      storage.highscore = score; // assigning to storage saves it automatically
    }
  }
}

function update(dt) {
  updatePlane(dt);
  updatePipes(dt);
}

function draw() {
  screen.blit("background", [0, 0]);
  rockTop.draw();
  rockBottom.draw();
  plane.draw();

  screen.draw.text(`${score}`, undefined, {
    midtop: [WIDTH / 2, 16],
    fontsize: 56,
    color: "white",
    shadow: 2,
  });
  screen.draw.text(`Best: ${storage.highscore}`, undefined, {
    midtop: [WIDTH / 2, 84],
    fontsize: 24,
    color: "#facc15",
    shadow: 1,
  });

  if (plane.crashed) {
    screen.draw.text("Click or press space to play again", undefined, {
      center: [WIDTH / 2, HEIGHT - 40],
      fontsize: 22,
      color: "white",
      shadow: 1,
    });
  }
}
