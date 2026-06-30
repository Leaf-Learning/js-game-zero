WIDTH = 320;
HEIGHT = 180;
TITLE = "Storage Save";

let score = storage.get("score") ?? 0;

function update() {
  score += 1;
  storage.set("score", score);
}

function draw() {
  screen.fill("#12312b");
  screen.draw.filled_rect([68, 58, 184, 64], "#2dd4bf");
  screen.draw.text(`score ${score}`, [92, 76], {
    fontsize: 28,
    color: "#ffffff",
  });
  storage.set("drawn", true);
}
