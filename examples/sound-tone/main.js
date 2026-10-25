WIDTH = 320;
HEIGHT = 180;
TITLE = "Sound and Tone";

// Files under assets/sounds/ are played through the `sounds` loader.
// `sounds.click` matches assets/sounds/click.ogg — no setup needed beyond
// naming the file.
let clicks = 0;

function draw() {
  screen.fill("#1f2937");
  screen.draw.filledCircle([160, 82], 28 + clicks * 4, "#38bdf8");
  screen.draw.text("click for sound + tone", [82, 134], {
    size: 18,
    color: "#f8fafc",
  });
}

function onMouseDown() {
  clicks = Math.min(6, clicks + 1);
  sounds.click.play();
  // tone.play() synthesizes a short note without needing an asset file.
  tone.play("C5", 0.08, { volume: 0.15 });
}
