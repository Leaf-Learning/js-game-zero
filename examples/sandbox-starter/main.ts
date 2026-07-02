import { run, screen, keyboard } from "@js-game-zero/core";

// Every other example uses the "zero-boilerplate" style: WIDTH/HEIGHT/TITLE
// and update()/draw() as bare top-level globals. That's convenient, but it
// only works because the sandbox evaluates your file for you. If you embed
// js-game-zero inside your own page or build, import the pieces you need
// and call run() yourself, like this.

const canvas = document.querySelector("[data-jgz-example-canvas]");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing example canvas.");
}

let x = 64;

run(
  {
    WIDTH: 320,
    HEIGHT: 180,
    TITLE: "Sandbox Starter",
    update(dt) {
      if (keyboard.right) x = Math.min(268, x + 140 * dt);
      if (keyboard.left) x = Math.max(32, x - 140 * dt);
    },
    draw() {
      screen.fill("#10243d");
      screen.draw.filled_rect([28, 128, 264, 16], "#f59e0b");
      screen.draw.filled_circle([x, 92], 24, "#e0f2fe");
      screen.draw.text("import mode", [112, 28], {
        fontsize: 20,
        color: "#ffffff",
      });
    },
  },
  {
    canvas,
    projectId: "sandbox-starter",
    // Any host embedding the runtime can pass a diagnostics callback like
    // this to surface friendly warnings (typo'd hook names, bad WIDTH/
    // HEIGHT values, ...) in its own console or UI.
    diagnostics(diagnostic) {
      if (diagnostic.severity === "error") console.error(diagnostic.message);
    },
  },
);
