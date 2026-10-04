WIDTH = 320;
HEIGHT = 180;
TITLE = "Actor Movement";

const MOVE_SPEED = 130; // pixels per second
const player = new Actor("player.svg", { center: [72, 92] });

function update(dt) {
  if (keyboard.right) player.x += MOVE_SPEED * dt;
  if (keyboard.left) player.x -= MOVE_SPEED * dt;
  // Use the Actor's bounds so this still works if you resize the sprite.
  player.left = Math.max(0, Math.min(WIDTH - player.width, player.left));
}

function draw() {
  screen.fill("#111827");
  screen.draw.filled_rect([0, 130, WIDTH, 50], "#334155");
  screen.draw.line([0, 130], [WIDTH, 130], "#facc15", 3);
  player.draw();
}
