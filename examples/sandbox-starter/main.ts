import { keyboard, keys, run, screen } from "@js-game-zero/core";

declare global {
  interface Window {
    __jgzExampleStatus?: {
      slug: string;
      mode: string;
      ready: boolean;
      nonblank: boolean;
      frames: number;
      interactions: {
        keyboard: boolean;
        mouse: boolean;
      };
      x: number;
      errors: string[];
      diagnostics: unknown[];
    };
  }
}

const status = {
  slug: "sandbox-starter",
  mode: "import",
  ready: false,
  nonblank: false,
  frames: 0,
  interactions: {
    keyboard: false,
    mouse: false,
  },
  x: 64,
  errors: [] as string[],
  diagnostics: [] as unknown[],
};

window.__jgzExampleStatus = status;

const canvas = document.querySelector<HTMLCanvasElement>(
  "[data-jgz-example-canvas]",
);
if (!canvas) throw new Error("Missing example canvas.");
const context = canvas.getContext("2d", { willReadFrequently: true });
if (!context) throw new Error("Missing example canvas context.");

function canvasIsNonblank(): boolean {
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 0) return true;
  }
  return false;
}

run(
  {
    WIDTH: 320,
    HEIGHT: 180,
    TITLE: "Sandbox Starter",
    update(dt) {
      status.frames += 1;
      if (keyboard.right) {
        status.x = Math.min(268, status.x + 140 * (dt as number));
        status.interactions.keyboard = true;
      }
      if (keyboard.left) {
        status.x = Math.max(32, status.x - 140 * (dt as number));
        status.interactions.keyboard = true;
      }
    },
    draw() {
      screen.fill("#10243d");
      screen.draw.filled_rect([28, 128, 264, 16], "#f59e0b");
      screen.draw.filled_circle([status.x, 92], 24, "#e0f2fe");
      screen.draw.text("import mode", [112, 28], {
        fontsize: 20,
        color: "#ffffff",
      });
      status.nonblank = canvasIsNonblank();
      status.ready = status.nonblank;
    },
    onKeyDown(key) {
      if (key === keys.LEFT || key === keys.RIGHT) {
        status.interactions.keyboard = true;
      }
    },
  },
  {
    canvas,
    diagnostics(diagnostic) {
      status.diagnostics.push(diagnostic);
    },
    projectId: "phase_five",
  },
);
