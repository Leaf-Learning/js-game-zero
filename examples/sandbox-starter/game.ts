import { defineGame } from "@js-game-zero/core";

// Keep game state inside the factory. Each run gets its own state and
// services, even when a host embeds several games on the same page.
export const game = defineGame(({ screen, keyboard, keys }) => {
  const WIDTH = 320;
  const RADIUS = 24;
  const MOVE_SPEED = 140; // pixels per second
  let x = 64;

  return {
    WIDTH,
    HEIGHT: 180,
    TITLE: "Sandbox Starter",
    update(dt) {
      if (keyboard.right) x += MOVE_SPEED * dt;
      if (keyboard.left) x -= MOVE_SPEED * dt;
      x = Math.max(RADIUS, Math.min(WIDTH - RADIUS, x));
    },
    onKeyDown(event) {
      if (event.key === keys.SPACE && !event.repeat) x = 64;
    },
    draw() {
      screen.fill("#10243d");
      screen.draw.filled_rect([28, 128, 264, 16], "#f59e0b");
      screen.draw.filled_circle([x, 92], RADIUS, "#e0f2fe");
      screen.draw.text("import mode", [112, 28], {
        size: 20,
        color: "#ffffff",
      });
    },
  };
});
