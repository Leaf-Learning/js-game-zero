import {
  Animation,
  Clock,
  InputDispatcher,
  KeyboardState,
  keys,
  mouse,
} from "@js-game-zero/core";

declare global {
  interface Window {
    __jgzTest?: {
      ready: boolean;
      events: Array<Record<string, unknown>>;
      keyboardState: Record<string, boolean>;
      clockFired: boolean;
      animatedX: number;
      animationDone: boolean;
      constants: {
        keys: {
          A: number;
          LEFT: number;
          RIGHT: number;
        };
        mouse: {
          LEFT: number;
        };
      };
    };
  }
}

const target = document.querySelector<HTMLCanvasElement>(
  "[data-jgz-phase-one-canvas]",
);

if (target) {
  const ctx = target.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#123a5a";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.fillStyle = "#f6c85f";
    ctx.beginPath();
    ctx.arc(target.width / 2, target.height / 2, 36, 0, Math.PI * 2);
    ctx.fill();
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    target.dataset.jgzPixel = Array.from(pixel).join(",");
    target.dataset.jgzNonblank = "true";
  }
}

const phaseTwoCanvas = document.querySelector<HTMLCanvasElement>(
  "[data-jgz-phase-two-canvas]",
);

if (phaseTwoCanvas) {
  phaseTwoCanvas.tabIndex = 0;
  const fixtureClock = new Clock();
  const fixtureKeyboard = new KeyboardState();
  const animationTarget = { x: 0 };
  const state = {
    ready: false,
    events: [] as Array<Record<string, unknown>>,
    keyboardState: {
      left: false,
      right: false,
      a: false,
    },
    clockFired: false,
    animatedX: 0,
    animationDone: false,
    constants: {
      keys: {
        A: keys.A,
        LEFT: keys.LEFT,
        RIGHT: keys.RIGHT,
      },
      mouse: {
        LEFT: mouse.LEFT,
      },
    },
  };
  window.__jgzTest = state;

  const snapshotKeyboard = () => {
    state.keyboardState = {
      left: Boolean(fixtureKeyboard.left),
      right: Boolean(fixtureKeyboard.right),
      a: Boolean(fixtureKeyboard.a),
    };
    return { ...state.keyboardState };
  };

  const dispatcher = new InputDispatcher(
    {
      onKeyDown(key: unknown, mod: unknown, unicode: unknown) {
        state.events.push({
          type: "keyDown",
          key,
          mod,
          unicode,
          keyboard: snapshotKeyboard(),
        });
      },
      onKeyUp(key: unknown, mod: unknown) {
        state.events.push({
          type: "keyUp",
          key,
          mod,
          keyboard: snapshotKeyboard(),
        });
      },
      onMouseDown(pos: unknown, button: unknown) {
        state.events.push({ type: "mouseDown", pos, button });
      },
      onMouseUp(pos: unknown, button: unknown) {
        state.events.push({ type: "mouseUp", pos, button });
      },
      onMouseMove(pos: unknown, rel: unknown, buttons: unknown) {
        state.events.push({
          type: "mouseMove",
          pos,
          rel,
          buttons: [...(buttons as Set<number>)],
        });
      },
    },
    fixtureKeyboard,
  );

  dispatcher.attach(phaseTwoCanvas, window);
  fixtureClock.schedule(() => {
    state.clockFired = true;
  }, 0.05);
  new Animation(
    animationTarget,
    {
      x: 100,
      duration: 0.12,
      on_finished: () => {
        state.animationDone = true;
      },
    },
    fixtureClock,
  );

  let lastFrame = performance.now();
  const step = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    fixtureClock.tick(dt);
    state.animatedX = animationTarget.x;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);

  state.ready = true;
}
