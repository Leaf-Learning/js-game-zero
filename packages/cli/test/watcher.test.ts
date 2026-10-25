import { expect, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";
import { createDebouncedCallback, isGamePath } from "../src/watcher";

test("debounces a burst of project changes", async () => {
  let changes = 0;
  const debounced = createDebouncedCallback(() => {
    changes += 1;
  }, 20);
  try {
    debounced.trigger();
    debounced.trigger();
    debounced.trigger();
    await delay(80);
    expect(changes).toBe(1);
  } finally {
    debounced.close();
  }
});

test("restarts for main.js and the asset folders the game loads from", () => {
  for (const path of [
    "main.js",
    "images/hero.png",
    "images/nested/enemy.svg",
    "sounds/hit.wav",
    "music/theme.ogg",
    "fonts/pixel.woff2",
    "images",
  ]) {
    expect(isGamePath(path), path).toBe(true);
  }
  for (const path of [
    "screenshot-0001.png",
    "capture.png",
    "notes/plan.md",
    "assets/images/hero.png",
    "images/.hero.png.swp",
    "images/hero.png~",
    "node_modules/x/main.js",
    ".git/index",
  ]) {
    expect(isGamePath(path), path).toBe(false);
  }
});

test("follows the assets/ layout when the project uses it", () => {
  for (const path of [
    "main.js",
    "assets/images/hero.png",
    "assets/sounds/hit.wav",
    "assets",
  ]) {
    expect(isGamePath(path, "assets"), path).toBe(true);
  }
  for (const path of ["images/hero.png", "assets/notes.md", "shot.png"]) {
    expect(isGamePath(path, "assets"), path).toBe(false);
  }
});
