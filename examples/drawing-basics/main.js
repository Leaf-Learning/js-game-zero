WIDTH = 320;
HEIGHT = 180;
TITLE = "Drawing Basics";

let pulse = 0;

function update(dt) {
  pulse = (pulse + dt) % 1;
}

function draw() {
  screen.fill("#0f172a", "#164e63");
  screen.draw.filled_rect([18, 22, 84, 52], "#f97316");
  screen.draw.line([0, 176], [320, 112], "#fde68a", 4);
  screen.draw.filled_circle([168, 72], 28 + Math.round(pulse * 3), "#22c55e");
  screen.draw.polygon(
    [
      [238, 40],
      [292, 64],
      [270, 126],
      [214, 118],
    ],
    "#f8fafc",
    3,
  );
  storage.set("drawn", true);
  storage.set("pulse", Math.round(pulse * 100));
}
