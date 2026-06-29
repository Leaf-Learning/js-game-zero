import {
  Animation,
  Actor,
  Clock,
  InputDispatcher,
  KeyboardState,
  Screen,
  createAssetLoaders,
  fitTextboxFontSize,
  keys,
  layoutText,
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

  interface Window {
    __jgzPhase3Drawing?: {
      ready: boolean;
      gradientTop: number[];
      gradientBottom: number[];
      clearedAlpha: number;
      rectPixel: number[];
      linePixel: number[];
      circlePixel: number[];
      polygonPixel: number[];
    };
    __jgzPhase3Text?: {
      ready: boolean;
      headingLayout: {
        lineCount: number;
        align: string;
        anchorOffset: [number, number];
        topLeft: [number, number];
      };
      symbolicLayout: {
        anchorOffset: [number, number];
        actualCenter: [number, number];
        topLeft: [number, number];
        changed: boolean;
      };
      textboxFitFontSize: number;
      headingChanged: boolean;
      textboxChanged: boolean;
      alphaPixel: number[];
      rotatedChanged: boolean;
    };
    __jgzPhase3Loader?: {
      ready: boolean;
      cacheHit: boolean;
      dimensions: [number, number];
      imagePixel: number[];
      soundName: string;
      musicName: string;
      fontFamily: string;
      fontLoaded: boolean;
      unloaded: boolean;
    };
    __jgzPhase3Actor?: {
      ready: boolean;
      moved: boolean;
      spritePixel: number[];
      pos: [number, number];
      opacity: number;
      rect: { left: number; top: number; width: number; height: number };
      rotatedRect: { left: number; top: number; width: number; height: number };
      anchorRect: { left: number; top: number; width: number; height: number };
      colliding: boolean;
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

const drawingCanvas = document.querySelector<HTMLCanvasElement>(
  "[data-jgz-phase-three-drawing]",
);

if (drawingCanvas) {
  const screen = createReadbackScreen(drawingCanvas);
  screen.clear();
  const clearedAlpha = samplePixel(drawingCanvas, 4, 4)[3] ?? 0;
  screen.fill("#10243d", "#8fd0ff");
  screen.draw.filled_rect([16, 18, 48, 34], "#e84855");
  screen.draw.line([0, 0], [120, 90], "#f6c85f", 4);
  screen.draw.filled_circle([126, 42], 18, "#34d399");
  screen.draw.filled_polygon(
    [
      [150, 82],
      [190, 40],
      [226, 82],
    ],
    "#ffffff",
  );
  window.__jgzPhase3Drawing = {
    ready: true,
    gradientTop: samplePixel(drawingCanvas, 4, 4),
    gradientBottom: samplePixel(drawingCanvas, 4, drawingCanvas.height - 4),
    clearedAlpha,
    rectPixel: samplePixel(drawingCanvas, 28, 28),
    linePixel: samplePixel(drawingCanvas, 20, 15),
    circlePixel: samplePixel(drawingCanvas, 126, 42),
    polygonPixel: samplePixel(drawingCanvas, 190, 68),
  };
}

const textCanvas = document.querySelector<HTMLCanvasElement>(
  "[data-jgz-phase-three-text]",
);

if (textCanvas) {
  const screen = createReadbackScreen(textCanvas);
  screen.fill("#17212b");
  const headingOptions = {
    fontsize: 24,
    color: "#ffffff",
    gcolor: "#f6c85f",
    shadow: [2, 2] as [number, number],
    scolor: "#000000",
    owidth: 1,
    ocolor: "#1c6dd0",
    width: 190,
    align: "center" as const,
    anchor: "center" as const,
  };
  const headingLayout = layoutText(
    screen.context,
    "Phase Three wraps",
    [120, 34],
    headingOptions,
  );
  screen.draw.text("Phase Three wraps", [120, 34], headingOptions);
  const textboxFit = fitTextboxFontSize(
    screen.context,
    "wrapped canvas text fits here",
    [18, 72, 190, 54],
    {
      fontsize: 24,
      min_fontsize: 8,
      color: "#f8fafc",
      background: "#243447",
      align: "center",
    },
  );
  screen.draw.textbox("wrapped canvas text fits here", [18, 72, 190, 54], {
    fontsize: 24,
    min_fontsize: 8,
    color: "#f8fafc",
    background: "#243447",
    align: "center",
  });
  screen.draw.text("A", [220, 28], {
    fontsize: 24,
    color: "#ffffff",
    background: "#ffffff",
    alpha: 0.5,
    anchor: "center",
  });
  screen.draw.text("A", [218, 112], {
    fontsize: 24,
    color: "#f6c85f",
    angle: 20,
    anchor: "center",
  });
  const symbolicOptions = {
    fontsize: 20,
    lineheight: 24,
    width: 32,
    center: [222, 64] as [number, number],
    anchor: "center" as const,
    align: "center" as const,
    color: "#f6c85f",
    background: "#314155",
  };
  const symbolicLayout = layoutText(
    screen.context,
    "C",
    undefined,
    symbolicOptions,
  );
  screen.draw.text("C", undefined, symbolicOptions);
  window.__jgzPhase3Text = {
    ready: true,
    headingLayout: {
      lineCount: headingLayout.lines.length,
      align: headingLayout.align,
      anchorOffset: headingLayout.anchorOffset,
      topLeft: headingLayout.topLeft,
    },
    symbolicLayout: {
      anchorOffset: symbolicLayout.anchorOffset,
      actualCenter: [
        symbolicLayout.topLeft[0] + symbolicLayout.boxWidth / 2,
        symbolicLayout.topLeft[1] + symbolicLayout.boxHeight / 2,
      ],
      topLeft: symbolicLayout.topLeft,
      changed: regionDiffers(textCanvas, 206, 52, 32, 24, [23, 33, 43]),
    },
    textboxFitFontSize: textboxFit.fontSize,
    headingChanged: regionDiffers(textCanvas, 16, 16, 170, 34, [23, 33, 43]),
    textboxChanged: regionDiffers(textCanvas, 18, 72, 190, 54, [36, 52, 71]),
    alphaPixel: samplePixel(textCanvas, 216, 16),
    rotatedChanged: regionDiffers(textCanvas, 198, 92, 40, 42, [23, 33, 43]),
  };
}

const loaderCanvas = document.querySelector<HTMLCanvasElement>(
  "[data-jgz-phase-three-loader]",
);

if (loaderCanvas) {
  const loaders = createPhaseThreeLoaders();
  const screen = createReadbackScreen(loaderCanvas, {
    imageLoader: loaders.images,
  });
  const state = {
    ready: false,
    cacheHit: false,
    dimensions: [0, 0] as [number, number],
    imagePixel: [0, 0, 0, 0],
    soundName: "",
    musicName: "",
    fontFamily: "",
    fontLoaded: false,
    unloaded: false,
  };
  window.__jgzPhase3Loader = state;

  void (async () => {
    const first = await loaders.images.load("player.svg");
    const second = await loaders.images.load("player.svg");
    const sound = await loaders.sounds.load("tap.wav");
    const music = await loaders.music.load("theme.ogg");
    const font = await loaders.fonts.load("ui.woff");
    screen.fill("#0f172a");
    screen.blit(first, [20, 20]);
    screen.blit("player.svg", [76, 20]);
    state.cacheHit = first === second;
    state.dimensions = first.get_size();
    state.imagePixel = samplePixel(loaderCanvas, 36, 36);
    state.soundName = sound.name;
    state.musicName = music.name;
    state.fontFamily = font.family;
    state.fontLoaded = [...document.fonts].some(
      (face) => face.family === font.family && face.status === "loaded",
    );
    state.unloaded = loaders.images.unload("player.svg");
    state.ready = true;
  })();
}

const actorCanvas = document.querySelector<HTMLCanvasElement>(
  "[data-jgz-phase-three-actor]",
);

if (actorCanvas) {
  actorCanvas.tabIndex = 0;
  const loaders = createPhaseThreeLoaders();
  const screen = createReadbackScreen(actorCanvas, {
    imageLoader: loaders.images,
  });
  const state = {
    ready: false,
    moved: false,
    spritePixel: [0, 0, 0, 0],
    pos: [0, 0] as [number, number],
    opacity: 1,
    rect: { left: 0, top: 0, width: 0, height: 0 },
    rotatedRect: { left: 0, top: 0, width: 0, height: 0 },
    anchorRect: { left: 0, top: 0, width: 0, height: 0 },
    colliding: false,
  };
  window.__jgzPhase3Actor = state;

  void (async () => {
    await loaders.images.load("player.svg");
    const actor = new Actor("player.svg", {
      center: [60, 52],
      loader: loaders.images,
      screen,
    });
    const anchored = new Actor("player.svg", [18, 112], {
      anchor: ["left", "top"],
      loader: loaders.images,
      screen,
    });
    const obstacle = new Actor("player.svg", {
      center: [112, 52],
      loader: loaders.images,
      screen,
      opacity: 0.35,
    });

    const render = () => {
      screen.fill("#0f172a");
      obstacle.draw();
      anchored.draw();
      actor.draw();
      state.spritePixel = samplePixel(
        actorCanvas,
        Math.round(actor.x),
        Math.round(actor.y),
      );
      state.pos = actor.pos;
      state.opacity = actor.opacity;
      state.rect = rectState(actor.rect());
      state.rotatedRect = rectState(actor.rect());
      state.anchorRect = rectState(anchored.rect());
      state.colliding = actor.colliderect(obstacle);
    };

    window.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight") return;
      actor.x += 52;
      actor.opacity = 0.55;
      actor.angle = 45;
      state.moved = true;
      render();
    });

    render();
    state.ready = true;
  })();
}

function createPhaseThreeLoaders() {
  return createAssetLoaders({
    projectId: "phase_three",
    assetBaseUrl: "/assets",
  });
}

function createReadbackScreen(
  canvas: HTMLCanvasElement,
  options?: ConstructorParameters<typeof Screen>[2],
): Screen {
  return new Screen(
    canvas,
    canvas.getContext("2d", { willReadFrequently: true }),
    options,
  );
}

function samplePixel(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): number[] {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [0, 0, 0, 0];
  return [...context.getImageData(x, y, 1, 1).data];
}

function regionDiffers(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  background: [number, number, number],
): boolean {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  const data = context.getImageData(x, y, width, height).data;
  const [red, green, blue] = background;
  for (let index = 0; index < data.length; index += 4) {
    const pixelRed = data[index] ?? 0;
    const pixelGreen = data[index + 1] ?? 0;
    const pixelBlue = data[index + 2] ?? 0;
    if (
      Math.abs(pixelRed - red) > 8 ||
      Math.abs(pixelGreen - green) > 8 ||
      Math.abs(pixelBlue - blue) > 8
    ) {
      return true;
    }
  }
  return false;
}

function rectState(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): { left: number; top: number; width: number; height: number } {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}
