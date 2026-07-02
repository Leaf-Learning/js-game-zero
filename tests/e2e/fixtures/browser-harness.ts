// e2e fixture-page harness: NOT part of any shipped package. This drives
// the legacy `/phase-one` .. `/phase-four/*` fixture pages that
// apps/sandbox/src/server.ts serves only when started with
// `--test-fixtures` / `JGZ_TEST_FIXTURES=1` (see playwright.config.ts's
// webServer command). It exists purely so tests/e2e specs can observe real
// browser behavior (input events, canvas pixels, WebAudio, storage) through
// `window.__jgz*` globals that no shipped example or package exposes.
import {
  Animation,
  Actor,
  Clock,
  InputDispatcher,
  KeyboardState,
  Screen,
  createAssetLoaders,
  createBrowserSoundAsset,
  createLocalStorageAdapter,
  createMusicLoader,
  createMusicPlayer,
  createStorage,
  fitTextboxFontSize,
  keys,
  layoutText,
  mouse,
  tone,
  type MusicAsset,
} from "@js-game-zero/core";

declare global {
  interface Window {
    __jgzInputSemantics?: {
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
    __jgzRenderingDrawing?: {
      ready: boolean;
      gradientTop: number[];
      gradientBottom: number[];
      clearedAlpha: number;
      clearPixel: number[];
      rectPixel: number[];
      linePixel: number[];
      circlePixel: number[];
      polygonPixel: number[];
    };
    __jgzRenderingText?: {
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
    __jgzRenderingLoader?: {
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
    __jgzRenderingActor?: {
      ready: boolean;
      moved: boolean;
      spritePixel: number[];
      pos: [number, number];
      opacity: number;
      rect: { left: number; top: number; width: number; height: number };
      rotatedRect: { left: number; top: number; width: number; height: number };
      publicSize: [number, number];
      anchorRect: { left: number; top: number; width: number; height: number };
      colliding: boolean;
    };
    __jgzAudioSound?: {
      ready: boolean;
      clicked: boolean;
      dataUrlSound: boolean;
      activeAfterPlay: boolean;
      activeAfterStop: boolean;
      loop: boolean;
      volume: number;
      unlocked: boolean;
      lastError: string | null;
      errors: string[];
    };
    __jgzAudioTone?: {
      ready: boolean;
      clicked: boolean;
      scheduled: number;
      unlocked: boolean;
      contextState: string | null;
      errors: string[];
    };
    __jgzAudioMusic?: {
      ready: boolean;
      clicked: boolean;
      current: string | null;
      endedCount: number;
      dataUrlTrack: boolean;
      errors: string[];
    };
    __jgzAudioStorage?: {
      ready: boolean;
      wrote: boolean;
      loadedScore: unknown;
      path: string;
      errors: string[];
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
  window.__jgzInputSemantics = state;

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
  const clearPixel = samplePixel(drawingCanvas, 4, 4);
  const clearedAlpha = clearPixel[3] ?? 0;
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
  window.__jgzRenderingDrawing = {
    ready: true,
    gradientTop: samplePixel(drawingCanvas, 4, 4),
    gradientBottom: samplePixel(drawingCanvas, 4, drawingCanvas.height - 4),
    clearedAlpha,
    clearPixel,
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
  window.__jgzRenderingText = {
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
  const loaders = createRenderingFixtureLoaders();
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
  window.__jgzRenderingLoader = state;

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
  const loaders = createRenderingFixtureLoaders();
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
    publicSize: [0, 0] as [number, number],
    anchorRect: { left: 0, top: 0, width: 0, height: 0 },
    colliding: false,
  };
  window.__jgzRenderingActor = state;

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
      state.publicSize = [actor.width, actor.height];
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

const soundButton = document.querySelector<HTMLButtonElement>(
  "[data-jgz-phase-four-sound]",
);

if (soundButton) {
  const state = {
    ready: false,
    clicked: false,
    dataUrlSound: false,
    activeAfterPlay: false,
    activeAfterStop: true,
    loop: false,
    volume: 0,
    unlocked: false,
    lastError: null as string | null,
    errors: [] as string[],
  };
  window.__jgzAudioSound = state;
  const sound = createBrowserSoundAsset({
    kind: "sound",
    name: "beep.wav",
    url: silentWavDataUrl(0.2),
  });

  soundButton.addEventListener("click", () => {
    void (async () => {
      state.clicked = true;
      try {
        sound.set_volume(0.5);
        sound.play(-1);
        await delay(100);
        const afterPlay = sound.debug_state();
        state.dataUrlSound = sound.url.startsWith("data:audio/wav");
        state.activeAfterPlay = afterPlay.active;
        state.loop = afterPlay.loop;
        state.volume = afterPlay.volume;
        state.unlocked = afterPlay.unlocked;
        state.lastError = afterPlay.lastError;
        sound.stop();
        state.activeAfterStop = sound.debug_state().active;
      } catch (error) {
        state.errors.push(errorMessage(error));
      }
    })();
  });
  state.ready = true;
}

const toneButton = document.querySelector<HTMLButtonElement>(
  "[data-jgz-phase-four-tone]",
);

if (toneButton) {
  const state = {
    ready: false,
    clicked: false,
    scheduled: 0,
    unlocked: false,
    contextState: null as string | null,
    errors: [] as string[],
  };
  window.__jgzAudioTone = state;
  toneButton.addEventListener("click", () => {
    void (async () => {
      state.clicked = true;
      try {
        await tone.unlock();
        await tone.play("A4", 0.05, { volume: 0.2 });
        const debug = tone.debug_state();
        state.scheduled = debug.scheduled.length;
        state.unlocked = debug.unlocked;
        state.contextState = debug.contextState;
      } catch (error) {
        state.errors.push(errorMessage(error));
      }
    })();
  });
  state.ready = true;
}

const musicButton = document.querySelector<HTMLButtonElement>(
  "[data-jgz-phase-four-music]",
);

if (musicButton) {
  const state = {
    ready: false,
    clicked: false,
    current: null as string | null,
    endedCount: 0,
    dataUrlTrack: false,
    errors: [] as string[],
  };
  window.__jgzAudioMusic = state;
  const dataUrl = silentWavDataUrl(0.08);
  const loader = createMusicLoader({
    projectId: "phase_four",
    loadAsset: async (_url, name): Promise<MusicAsset> => {
      if (name !== "short.wav") throw new Error("missing music fixture");
      return {
        kind: "music",
        name,
        url: dataUrl,
      };
    },
  });
  const player = createMusicPlayer({
    loader,
    onMusicEnd: () => {
      state.endedCount += 1;
      state.current = player.debug_state().current;
    },
  });

  musicButton.addEventListener("click", () => {
    void (async () => {
      state.clicked = true;
      try {
        await player.play_once("short.wav");
        state.current = player.debug_state().current;
        const element = player.debug_current_element();
        state.dataUrlTrack = Boolean(element?.src.startsWith("data:audio/wav"));
      } catch (error) {
        state.errors.push(errorMessage(error));
      }
    })();
  });
  state.ready = true;
}

const storageButton = document.querySelector<HTMLButtonElement>(
  "[data-jgz-phase-four-storage]",
);

if (storageButton) {
  const state = {
    ready: false,
    wrote: false,
    loadedScore: null as unknown,
    path: "",
    errors: [] as string[],
  };
  window.__jgzAudioStorage = state;
  const store = createStorage({
    adapter: createLocalStorageAdapter({
      projectId: "phase_four_e2e",
      path: "save/high_score",
    }),
  });

  void (async () => {
    try {
      await store.load();
      state.loadedScore = store.get("high_score") ?? null;
      state.path = store.path;
    } catch (error) {
      state.errors.push(errorMessage(error));
    } finally {
      state.ready = true;
    }
  })();

  storageButton.addEventListener("click", () => {
    void (async () => {
      try {
        store.set("high_score", 4242);
        await store.save();
        state.wrote = true;
        state.loadedScore = store.get("high_score");
      } catch (error) {
        state.errors.push(errorMessage(error));
      }
    })();
  });
}

function createRenderingFixtureLoaders() {
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

function silentWavDataUrl(durationSeconds = 0.03): string {
  const sampleRate = 8000;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(bytes, 8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, sampleCount * 2, true);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
