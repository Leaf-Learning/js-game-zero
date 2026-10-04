WIDTH = 800;
HEIGHT = 480;
TITLE = "Tappy Plane";

// Change these to tune how the game feels.
const GAP = 170; // vertical space the plane must fly through
const GRAVITY = 900; // pixels per second^2 pulling the plane down
const FLAP_STRENGTH = 320; // upward speed applied by a single flap
const MOUNTAIN_SPEED = 220; // how fast the mountains scroll toward the plane

const plane = new Actor("plane", { center: [140, HEIGHT / 2] });
plane.vy = 0; // Actor doesn't know about velocity, so we track our own.
plane.crashed = false;

let score = 0;
storage.setdefault("highscore", 0);

// The rocks are drawn hanging from the ceiling and standing on the floor,
// anchored at the point closest to the gap so their pointy tips line up.
const rockTop = new Actor("rock_top", { anchor: ["left", "bottom"] });
const rockBottom = new Actor("rock_bottom", { anchor: ["left", "top"] });

function resetMountains() {
  const gapCenter = 150 + Math.random() * (HEIGHT - 300);
  rockTop.pos = [WIDTH + 40, gapCenter - GAP / 2];
  rockBottom.pos = [WIDTH + 40, gapCenter + GAP / 2];
}
resetMountains();

function resetGame() {
  plane.center = [140, HEIGHT / 2];
  plane.vy = 0;
  plane.angle = 0;
  plane.crashed = false;
  score = 0;
  resetMountains();
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

// Each mountain has a tapered silhouette. A triangle just inside that
// silhouette leaves the transparent corners safe to fly through. The
// plane's small fuselage hitbox rotates with its sprite.
function hitsRock(rock) {
  const radians = (-plane.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const fuselage = [
    [-26, 0],
    [20, 0],
    [20, 16],
    [-18, 16],
  ].map(([x, y]) => [plane.x + x * cos - y * sin, plane.y + x * sin + y * cos]);
  const outline =
    rock === rockBottom
      ? [
          [65, 8],
          [98, 235],
          [10, 235],
        ]
      : [
          [10, 4],
          [98, 4],
          [65, 231],
        ];
  const mountain = outline.map(([x, y]) => [rock.left + x, rock.top + y]);
  return polygonsOverlap(fuselage, mountain);
}

// Two convex shapes overlap only if their projections overlap on every
// edge's perpendicular axis (the separating axis test).
function polygonsOverlap(first, second) {
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const point = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const axis = [point[1] - next[1], next[0] - point[0]];
      const a = first.map(([x, y]) => x * axis[0] + y * axis[1]);
      const b = second.map(([x, y]) => x * axis[0] + y * axis[1]);
      if (
        Math.max(...a) <= Math.min(...b) ||
        Math.max(...b) <= Math.min(...a)
      ) {
        return false;
      }
    }
  }
  return true;
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

function updateMountains(dt) {
  if (plane.crashed) return; // freeze the course while the game is over
  rockTop.left -= MOUNTAIN_SPEED * dt;
  rockBottom.left -= MOUNTAIN_SPEED * dt;
  if (rockTop.right < 0) {
    resetMountains();
    score += 1;
    sounds.score.play();
    if (score > storage.highscore) {
      storage.highscore = score; // assigning to storage saves it automatically
    }
  }
}

function update(dt) {
  updatePlane(dt);
  updateMountains(dt);
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
