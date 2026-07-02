WIDTH = 320;
HEIGHT = 180;
TITLE = "Animation Basics";

let orb = { x: 48, y: 90 };
animate(orb, { x: 260, duration: 1, tween: "decelerate" });

function draw() {
  screen.fill("#18212f");
  screen.draw.line([48, 112], [260, 112], "#94a3b8", 3);
  screen.draw.filled_circle([orb.x, orb.y], 18, "#facc15");
  screen.draw.circle([260, 90], 22, "#38bdf8", 3);
}
