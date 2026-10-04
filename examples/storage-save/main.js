WIDTH = 640;
HEIGHT = 360;
TITLE = "Storage Save";

// The runtime loads storage before this file runs. Editing the current
// score doesn't change storage until you click Save current.
let score = storage.get("score", 0);
let message = storage.has("score")
  ? `Loaded saved score ${score} when the example opened.`
  : "No score saved yet. Add some points, then save.";
let busy = false;

const buttons = [
  {
    rect: new Rect(32, 210, 128, 52),
    label: "- 1",
    action: () => changeScore(-1),
  },
  {
    rect: new Rect(180, 210, 128, 52),
    label: "+ 1",
    action: () => changeScore(1),
  },
  {
    rect: new Rect(332, 210, 128, 52),
    label: "Save current",
    action: saveScore,
  },
  { rect: new Rect(480, 210, 128, 52), label: "Load saved", action: loadScore },
];

function changeScore(amount) {
  score = Math.max(0, score + amount);
  message = "Current score changed. Click Save current to keep it.";
}

function saveScore() {
  busy = true;
  const savedScore = score;
  storage.set("score", savedScore);
  message = "Saving...";
  // Assignments also auto-save; save() flushes this change immediately.
  storage.save().then(
    () => {
      busy = false;
      message = `Saved score ${savedScore}. Change the current score, then load it back.`;
    },
    () => {
      busy = false;
      message = "Couldn't save. Check that browser storage is available.";
    },
  );
}

function loadScore() {
  if (!storage.has("score")) {
    message = "No saved score yet. Click Save current first.";
    return;
  }
  score = storage.get("score");
  message = `Loaded saved score ${score}.`;
}

function on_mouse_down(pos) {
  if (busy) return;
  const button = buttons.find((candidate) => candidate.rect.collidepoint(pos));
  if (button) button.action();
}

function draw() {
  screen.fill("#12312b");
  screen.draw.text("Try saving a score", [32, 24], {
    fontsize: 30,
    color: "white",
  });
  screen.draw.text(
    "Edit it, save it, change it again, then load it back.",
    [32, 64],
    {
      fontsize: 19,
      color: "#a7f3d0",
    },
  );

  drawScoreCard(32, "Current score", score);
  drawScoreCard(332, "Saved score", storage.get("score", "None yet"));
  for (const button of buttons) {
    screen.draw.filled_rect(button.rect, busy ? "#475569" : "#0f766e");
    screen.draw.text(button.label, undefined, {
      center: button.rect.center,
      fontsize: 19,
      color: "white",
    });
  }
  screen.draw.text(message, [32, 290], {
    fontsize: 17,
    width: WIDTH - 64,
    color: "#d1fae5",
  });
  screen.draw.text(
    "Reload the page: your saved score will still be here.",
    [32, 332],
    {
      fontsize: 17,
      color: "#a7f3d0",
    },
  );
}

function drawScoreCard(x, label, value) {
  screen.draw.filled_rect([x, 104, 276, 86], "#164e43");
  screen.draw.text(label, [x + 16, 114], { fontsize: 18, color: "#a7f3d0" });
  screen.draw.text(`${value}`, [x + 16, 142], { fontsize: 32, color: "white" });
}
