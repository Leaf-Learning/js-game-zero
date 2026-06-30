WIDTH = 320;
HEIGHT = 180;
TITLE = "Actor Movement";

const playerSize = images.player.get_size();
let player = new Actor("player.svg", { center: [72, 92] });

function update(dt) {
  if (keyboard.right) player.x += 130 * dt;
  if (keyboard.left) player.x -= 130 * dt;
  player.x = Math.max(18, Math.min(WIDTH - 18, player.x));
  storage.set("x", Math.round(player.x));
}

function draw() {
  screen.fill("#111827");
  screen.draw.filled_rect([0, 130, WIDTH, 50], "#334155");
  screen.draw.line([0, 130], [WIDTH, 130], "#facc15", 3);
  player.draw();
  storage.set("spriteReady", player.width > 0);
  storage.set("spriteSize", playerSize);
}
