import { run } from "@js-game-zero/core";
import { game } from "./game";

// Host setup: the shipped example page provides this canvas. For your own
// page, provide a matching canvas or pass your own element to run().
const canvas = document.querySelector("[data-jgz-example-canvas]");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing example canvas.");
}

run(game, {
  canvas,
  projectId: "sandbox-starter",
  // Any host embedding the runtime can pass a diagnostics callback like
  // this to surface friendly warnings (typo'd hook names, bad WIDTH/
  // HEIGHT values, ...) in its own console or UI.
  diagnostics(diagnostic) {
    if (diagnostic.severity === "error") console.error(diagnostic.message);
  },
});
