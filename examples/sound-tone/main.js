WIDTH = 320;
HEIGHT = 180;
TITLE = "Sound And Tone";

const clickSound = createBrowserSoundAsset({
  kind: "sound",
  name: "click.wav",
  url: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
});

sounds.define("click.wav", clickSound);

let clicks = 0;

function draw() {
  screen.fill("#1f2937");
  screen.draw.filled_circle([160, 82], 28 + clicks * 4, "#38bdf8");
  screen.draw.text("click for sound + tone", [82, 134], {
    fontsize: 18,
    color: "#f8fafc",
  });
}

function on_mouse_down() {
  clicks = Math.min(6, clicks + 1);
  storage.set("clicks", clicks);
  storage.set("soundPropertyAccess", typeof sounds.click.play === "function");
  sounds.click.play();
  tone.play("C5", 0.08, { volume: 0.15 });
}
