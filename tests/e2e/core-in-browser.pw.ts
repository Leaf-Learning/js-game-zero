import { expect, test } from "@playwright/test";
import { keys, mouse } from "@js-game-zero/core";
import { collectPageErrors } from "./fixtures/harness-helpers";

/**
 * The single real-browser integration spec for js-game-zero's core runtime.
 * It consolidates what used to live across input-semantics, input-audio-parity,
 * audio-music-storage, sync-assets-storage, and text-geometry, keeping ONE
 * solid real-browser assertion per integration guarantee and reusing the same
 * `/fixtures/*` pages and `window.__jgz*` globals that
 * tests/e2e/fixtures/browser-harness.ts exposes. Pure-logic checks that the
 * packages/core unit tests already cover (exhaustive key constants, per-scalar
 * text-positioning math) are intentionally NOT re-asserted here; real canvas
 * text rendering stays covered by rendering-actor.pw.ts.
 */

type FixtureState = {
  ready: boolean;
  wheelEvents: Array<{ pos: [number, number]; button: number }>;
  soundInstanceCountAfterPlay: number;
  animatedFrames: number;
  animationX: number;
  throwingCalls: number;
};

declare global {
  interface Window {
    __jgzInputAudioParity?: FixtureState;
    __jgzSoundHandle?: {
      stopAndCount(): number;
    };
  }
}

// --- Guarantee #1 + #3: real DOM input reaches InputDispatcher/KeyboardState
// and fires the hooks, while clock.schedule and Animation.on_finished advance
// under a real requestAnimationFrame loop. ------------------------------------
test("real browser key + mouse input updates KeyboardState, fires hooks, and drives the clock and animation", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);

  await page.goto("/fixtures/core-semantics");
  await expect(page).toHaveTitle("js-game-zero Core Semantics Fixture");
  await page.waitForFunction(
    () =>
      (window as typeof window & { __jgzInputSemantics?: { ready?: boolean } })
        .__jgzInputSemantics?.ready,
  );

  const canvas = page.locator("[data-jgz-core-semantics-canvas]");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Core semantics canvas was not laid out.");

  await canvas.click({ position: { x: 20, y: 20 } });
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.press("a");
  await page.mouse.move(box.x + 30, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 95, { steps: 3 });
  await page.mouse.up();

  await page.waitForFunction(
    () => {
      const state = (
        window as typeof window & {
          __jgzInputSemantics?: {
            clockFired?: boolean;
            animationDone?: boolean;
          };
        }
      ).__jgzInputSemantics;
      return state?.clockFired && state.animationDone;
    },
    undefined,
    { timeout: 5_000 },
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzInputSemantics?: {
            events: Array<Record<string, unknown>>;
            keyboardState: Record<string, boolean>;
            clockFired: boolean;
            animatedX: number;
            animationDone: boolean;
          };
        }
      ).__jgzInputSemantics,
  );
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing core semantics fixture state.");

  const leftDown = state.events.find(
    (event) => event.type === "keyDown" && event.key === keys.LEFT,
  );
  const leftUp = state.events.find(
    (event) => event.type === "keyUp" && event.key === keys.LEFT,
  );
  const aDown = state.events.find(
    (event) => event.type === "keyDown" && event.key === keys.A,
  );
  const dragMove = state.events.find(
    (event) =>
      event.type === "mouseMove" &&
      Array.isArray(event.buttons) &&
      event.buttons.includes(mouse.LEFT),
  );
  const mouseDown = state.events.find(
    (event) => event.type === "mouseDown" && event.button === mouse.LEFT,
  );

  // Real key/mouse DOM events reached InputDispatcher, mutated KeyboardState,
  // and fired every hook.
  expect(leftDown?.keyboard).toMatchObject({ left: true });
  expect(leftUp?.keyboard).toMatchObject({ left: false });
  expect(aDown).toMatchObject({ unicode: "a" });
  expect(mouseDown).toBeTruthy();
  expect(dragMove?.rel).not.toEqual([0, 0]);
  expect(state.keyboardState).toMatchObject({ left: false, a: false });
  // clock.schedule fired and Animation.on_finished ran to completion under the
  // real rAF loop.
  expect(state.clockFired).toBe(true);
  expect(state.animationDone).toBe(true);
  expect(state.animatedX).toBe(100);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// --- Guarantee #1 (wheel) + #2 (overlapping sounds) + #3 (clock resilience) ---
// Drives packages/core directly from the served `/runtime/core.js` bundle so a
// native wheel event, overlapping sound playbacks, and a throwing each_tick are
// all exercised in one real browser context.
test("wheel input maps to WHEEL_UP/DOWN, sounds overlap, and a throwing each_tick is auto-unscheduled without stopping the loop", async ({
  page,
}) => {
  const { errors: consoleErrors, pageErrors } = collectPageErrors(page);

  await page.goto("/");

  await page.evaluate(async () => {
    // The sandbox server bundles packages/core/src/index.ts on the fly at this
    // path; it isn't statically resolvable from the test runner, so the import
    // specifier is kept in a variable and the module cast at runtime.
    const coreRuntimeUrl = "/runtime/core.js";
    const core = (await import(coreRuntimeUrl)) as {
      Clock: new () => {
        each_tick(callback: (dt: number) => void): void;
        tick(dt: number): void;
      };
      InputDispatcher: new (hooks: {
        on_mouse_down(pos: [number, number], button: number): void;
      }) => {
        attach(target: EventTarget): () => void;
      };
      createBrowserSoundAsset(asset: {
        kind: "sound";
        name: string;
        url: string;
      }): {
        play(loops?: number): void;
        stop(): void;
        debug_instance_count(): number;
      };
    };
    const { Clock, InputDispatcher, createBrowserSoundAsset } = core;

    const state = {
      ready: false,
      wheelEvents: [] as Array<{ pos: [number, number]; button: number }>,
      soundInstanceCountAfterPlay: -1,
      animatedFrames: 0,
      animationX: 0,
      throwingCalls: 0,
    };
    window.__jgzInputAudioParity = state;

    // --- 1. Mouse wheel maps to on_mouse_down with WHEEL_UP/WHEEL_DOWN ---
    const dispatcher = new InputDispatcher({
      on_mouse_down(pos, button) {
        state.wheelEvents.push({ pos, button });
      },
    });
    dispatcher.attach(window);

    // --- 2. Overlapping sound instances ---
    const sound = createBrowserSoundAsset({
      kind: "sound",
      name: "tap.wav",
      url: "/fixture-assets/rendering-fixture/sounds/tap.wav",
    });
    window.__jgzSoundHandle = {
      stopAndCount: () => {
        sound.stop();
        return sound.debug_instance_count();
      },
    };
    const button = document.createElement("button");
    button.setAttribute("data-jgz-input-audio-sound-trigger", "true");
    button.textContent = "play overlapping sounds";
    button.addEventListener("click", () => {
      // Both play() calls happen synchronously within this trusted click
      // handler, so the instance pool reflects two overlapping playbacks
      // regardless of whether the browser's autoplay policy later rejects
      // actual audible playback (which this fixture does not depend on).
      sound.play();
      sound.play();
      state.soundInstanceCountAfterPlay = sound.debug_instance_count();
    });
    document.body.appendChild(button);

    // --- 3. Clock survives a throwing callback ---
    const clock = new Clock();
    clock.each_tick(() => {
      state.throwingCalls += 1;
      if (state.throwingCalls === 3) throw new Error("e2e-clock-boom");
    });
    clock.each_tick(() => {
      state.animationX += 1;
    });

    function frame(): void {
      clock.tick(0.016);
      state.animatedFrames += 1;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    state.ready = true;
  });

  await page.waitForFunction(
    () => window.__jgzInputAudioParity?.ready === true,
  );

  // --- Exercise a real native wheel event ---
  await page.mouse.move(120, 80);
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(
    () => (window.__jgzInputAudioParity?.wheelEvents.length ?? 0) >= 2,
  );

  // --- Exercise overlapping sound playback via a real user gesture ---
  await page.click("[data-jgz-input-audio-sound-trigger]");
  const instanceCountAfterStop = await page.evaluate(
    () => window.__jgzSoundHandle?.stopAndCount() ?? -1,
  );

  // --- Let the clock/animation loop run well past the throwing callback ---
  await page.waitForFunction(
    () => (window.__jgzInputAudioParity?.animatedFrames ?? 0) > 20,
  );

  const state = await page.evaluate(() => window.__jgzInputAudioParity);
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing input/audio/clock fixture state.");

  const wheelUp = state.wheelEvents.find(
    (event) => event.button === mouse.WHEEL_UP,
  );
  const wheelDown = state.wheelEvents.find(
    (event) => event.button === mouse.WHEEL_DOWN,
  );
  expect(wheelUp).toMatchObject({ pos: [120, 80], button: mouse.WHEEL_UP });
  expect(wheelDown).toMatchObject({
    pos: [120, 80],
    button: mouse.WHEEL_DOWN,
  });

  expect(state.soundInstanceCountAfterPlay).toBe(2);
  expect(instanceCountAfterStop).toBe(0);

  // The throwing each_tick callback fires THREE times: it only throws on the
  // 3rd invocation and is auto-unscheduled afterwards, while the sibling
  // each_tick callback -- and the requestAnimationFrame loop driving
  // clock.tick() -- keep running every frame, proving the exception did not
  // abort the frame.
  expect(state.throwingCalls).toBe(3);
  expect(state.animationX).toBe(state.animatedFrames);
  expect(state.animatedFrames).toBeGreaterThan(20);

  expect(
    consoleErrors.some((message) => message.includes("e2e-clock-boom")),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});

// --- Guarantee #2: a WebAudio sound plays, loops, and stops. -------------------
test("a sound plays, loops, and stops after a real browser gesture", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/fixtures/audio/sound");
  await expect(page).toHaveTitle("js-game-zero Audio Fixture: Sound");
  await page.waitForFunction(
    () =>
      (window as typeof window & { __jgzAudioSound?: { ready?: boolean } })
        .__jgzAudioSound?.ready,
  );

  await page.getByRole("button", { name: "Play Sound" }).click();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioSound?: {
            clicked?: boolean;
            activeAfterStop?: boolean;
          };
        }
      ).__jgzAudioSound?.clicked &&
      (
        window as typeof window & {
          __jgzAudioSound?: { activeAfterStop?: boolean };
        }
      ).__jgzAudioSound?.activeAfterStop === false,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzAudioSound?: {
            clicked: boolean;
            dataUrlSound: boolean;
            activeAfterPlay: boolean;
            activeAfterStop: boolean;
            loop: boolean;
            volume: number;
            lastError: string | null;
            errors: string[];
          };
        }
      ).__jgzAudioSound,
  );
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing sound state.");
  expect(state.clicked).toBe(true);
  expect(state.dataUrlSound).toBe(true);
  expect(state.activeAfterPlay).toBe(true);
  expect(state.activeAfterStop).toBe(false);
  expect(state.loop).toBe(true);
  expect(state.volume).toBe(0.5);
  expect(state.lastError).toBe(null);
  expect(state.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// --- Guarantee #2: tone.unlock() resumes the context and tone.play() schedules. -
test("tone unlocks browser audio and schedules a tone on the resumed context", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/fixtures/audio/tone");
  await expect(page).toHaveTitle("js-game-zero Audio Fixture: Tone");
  await page.waitForFunction(
    () =>
      (window as typeof window & { __jgzAudioTone?: { ready?: boolean } })
        .__jgzAudioTone?.ready,
  );

  await page.getByRole("button", { name: "Play Tone" }).click();
  await page.waitForFunction(
    () =>
      (window as typeof window & { __jgzAudioTone?: { scheduled?: number } })
        .__jgzAudioTone?.scheduled === 1,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzAudioTone?: {
            clicked: boolean;
            scheduled: number;
            unlocked: boolean;
            contextState: string | null;
            errors: string[];
          };
        }
      ).__jgzAudioTone,
  );
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing tone state.");
  expect(state.clicked).toBe(true);
  expect(state.scheduled).toBe(1);
  expect(state.unlocked).toBe(true);
  expect(state.contextState).toBe("running");
  expect(state.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// --- Guarantee #2: music fires on_music_end when the queue drains. -------------
test("music triggers on_music_end for a generated data URL track", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/fixtures/audio/music");
  await expect(page).toHaveTitle("js-game-zero Audio Fixture: Music");
  await page.waitForFunction(
    () =>
      (window as typeof window & { __jgzAudioMusic?: { ready?: boolean } })
        .__jgzAudioMusic?.ready,
  );

  await page.getByRole("button", { name: "Play Music" }).click();
  await page.waitForFunction(
    () =>
      (window as typeof window & { __jgzAudioMusic?: { endedCount?: number } })
        .__jgzAudioMusic?.endedCount === 1,
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzAudioMusic?: {
            clicked: boolean;
            current: string | null;
            endedCount: number;
            dataUrlTrack: boolean;
            errors: string[];
          };
        }
      ).__jgzAudioMusic,
  );
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing music state.");
  expect(state.clicked).toBe(true);
  expect(state.dataUrlTrack).toBe(true);
  expect(state.current).toBe(null);
  expect(state.endedCount).toBe(1);
  expect(state.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// --- Guarantee #4: localStorage persists a mutation across a real reload. -------
test("storage persists a high score across reloads", async ({ page }) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/fixtures/audio/storage");
  await page.waitForFunction(
    () =>
      (window as typeof window & { __jgzAudioStorage?: { ready?: boolean } })
        .__jgzAudioStorage?.ready,
  );
  await page.evaluate(() => {
    localStorage.removeItem("js-game-zero:audio_fixture_e2e:save/high_score");
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      (window as typeof window & { __jgzAudioStorage?: { ready?: boolean } })
        .__jgzAudioStorage?.ready,
  );

  const initial = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzAudioStorage?: { loadedScore: unknown; errors: string[] };
        }
      ).__jgzAudioStorage,
  );
  expect(initial?.loadedScore).toBe(null);
  expect(initial?.errors).toEqual([]);

  await page.getByRole("button", { name: "Save Score" }).click();
  await page.waitForFunction(
    () =>
      (window as typeof window & { __jgzAudioStorage?: { wrote?: boolean } })
        .__jgzAudioStorage?.wrote,
  );

  await page.reload();
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __jgzAudioStorage?: { loadedScore?: unknown };
        }
      ).__jgzAudioStorage?.loadedScore === 4242,
  );
  const persisted = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzAudioStorage?: {
            loadedScore: unknown;
            path: string;
            errors: string[];
          };
        }
      ).__jgzAudioStorage,
  );
  expect(persisted).toBeTruthy();
  if (!persisted) throw new Error("Missing storage state.");
  expect(persisted.loadedScore).toBe(4242);
  expect(persisted.path).toBe("js-game-zero:audio_fixture_e2e:save/high_score");
  expect(persisted.errors).toEqual([]);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// --- Guarantee #4: the preload gate makes an Actor + blit correct on the FIRST
// presented frame. -------------------------------------------------------------
type FirstFrameResult = {
  drawInvocationsAtCapture: unknown;
  firstFrameHeroWidth: unknown;
  firstFrameHeroHeight: unknown;
  firstFramePos: unknown;
  firstFrameHeroPixel: number[];
  firstFrameBlitPixel: number[];
  firstFrameBackgroundPixel: number[];
};

function colorDistance(a: readonly number[], b: readonly number[]): number {
  return (
    Math.abs((a[0] ?? 0) - (b[0] ?? 0)) +
    Math.abs((a[1] ?? 0) - (b[1] ?? 0)) +
    Math.abs((a[2] ?? 0) - (b[2] ?? 0))
  );
}

test("an Actor + blit game renders correct data on its first presented frame", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);

  // A neutral page: it has no canvas and runs no game of its own, so it cannot
  // interfere with the game this test injects and drives itself.
  await page.goto("/examples");

  const result = await page.evaluate<FirstFrameResult>(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 150;
    document.body.append(canvas);

    const coreRuntimeUrl = "/runtime/core.js";
    const { run } = await import(coreRuntimeUrl);

    const source = `
let hero = new Actor("player.svg", { center: [40, 75] });

function draw() {
  screen.fill("#101010");
  screen.blit("player.svg", [120, 10]);
  hero.draw();

  const draws = (storage.get("drawInvocations") ?? 0) + 1;
  storage.set("drawInvocations", draws);
  if (draws === 1) {
    storage.set("firstFrameHeroWidth", hero.width);
    storage.set("firstFrameHeroHeight", hero.height);
    storage.set("firstFramePos", hero.pos);
    storage.set(
      "firstFrameHeroPixel",
      Array.from(screen.context.getImageData(hero.pos[0], hero.pos[1], 1, 1).data),
    );
    storage.set(
      "firstFrameBlitPixel",
      Array.from(screen.context.getImageData(138, 24, 1, 1).data),
    );
    storage.set(
      "firstFrameBackgroundPixel",
      Array.from(screen.context.getImageData(5, 5, 1, 1).data),
    );
  }
}
`;

    const handle = run(source, {
      canvas,
      projectId: "asset-sync-fixture",
      assetBaseUrl: "/fixture-assets",
    });

    const deadline = Date.now() + 8000;
    while ((handle.storage.get("drawInvocations") ?? 0) < 1) {
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for the first draw() call.");
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const captured = {
      drawInvocationsAtCapture: handle.storage.get("drawInvocations"),
      firstFrameHeroWidth: handle.storage.get("firstFrameHeroWidth"),
      firstFrameHeroHeight: handle.storage.get("firstFrameHeroHeight"),
      firstFramePos: handle.storage.get("firstFramePos"),
      firstFrameHeroPixel: handle.storage.get("firstFrameHeroPixel"),
      firstFrameBlitPixel: handle.storage.get("firstFrameBlitPixel"),
      firstFrameBackgroundPixel: handle.storage.get(
        "firstFrameBackgroundPixel",
      ),
    };
    handle.stop();
    return captured as FirstFrameResult;
  });

  // The very first executed draw() already had the fully loaded sprite:
  // correct dimensions and a center position matching the constructor.
  expect(result.drawInvocationsAtCapture).toBe(1);
  expect(result.firstFrameHeroWidth).toBe(36);
  expect(result.firstFrameHeroHeight).toBe(28);
  expect(result.firstFramePos).toEqual([40, 75]);

  // Both the Actor and the blit painted real, opaque pixels distinct from the
  // background fill on that same first frame -- nothing was silently skipped
  // while the asset was still loading.
  expect(result.firstFrameHeroPixel[3]).toBe(255);
  expect(result.firstFrameBlitPixel[3]).toBe(255);
  expect(
    colorDistance(result.firstFrameHeroPixel, result.firstFrameBackgroundPixel),
  ).toBeGreaterThan(20);
  expect(
    colorDistance(result.firstFrameBlitPixel, result.firstFrameBackgroundPixel),
  ).toBeGreaterThan(20);

  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// --- Guarantee #4: a storage mutation with no explicit save() survives a real
// reload (auto-load before the first frame, auto-save via pagehide). ------------
test("a storage mutation with no explicit save() persists across a page reload", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  const projectId = "sync_assets_storage_e2e";
  const storageKey = `js-game-zero:${projectId}:storage`;

  await page.goto("/examples");
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);

  async function runGameAndReadScore(): Promise<unknown> {
    return page.evaluate(async (pid) => {
      const canvas = document.createElement("canvas");
      document.body.append(canvas);
      const coreRuntimeUrl = "/runtime/core.js";
      const { run } = await import(coreRuntimeUrl);

      // No call to storage.save() anywhere in this game or this harness.
      const source = `
storage.score = (storage.get("score") ?? 0) + 1;

function update() {}
function draw() {}
`;
      const handle = run(source, { canvas, projectId: pid });
      await handle.ready;
      return handle.storage.get("score");
    }, projectId);
  }

  const firstScore = await runGameAndReadScore();
  expect(firstScore).toBe(1);

  // A real navigation: the outgoing document fires `pagehide`, which the
  // runtime's auto-save wiring uses to flush any unsaved mutation before the
  // page is torn down.
  await page.reload();

  const secondScore = await runGameAndReadScore();
  expect(secondScore).toBe(2);

  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// --- Guarantee #5: a loaded WOFF font (resolved via fontname) renders different
// pixels than the generic fallback. Driven inline through the served
// `/runtime/core.js` bundle, reusing the rendering-fixture WOFF asset. ----------
test("a loaded custom font renders different pixels than the fallback", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/");

  const result = await page.evaluate(async () => {
    const coreRuntimeUrl = "/runtime/core.js";
    const core = (await import(coreRuntimeUrl)) as {
      Screen: new (
        canvas: HTMLCanvasElement,
        context: CanvasRenderingContext2D | null,
      ) => {
        fill(color: string): void;
        draw: {
          text(
            text: string,
            pos: [number, number],
            options: Record<string, unknown>,
          ): void;
        };
      };
      fonts: { define(name: string, asset: Record<string, unknown>): void };
      layoutText: (
        context: CanvasRenderingContext2D,
        text: string,
        pos: [number, number] | undefined,
        options: Record<string, unknown>,
      ) => { font: string };
    };
    const { Screen, fonts, layoutText } = core;

    const readback = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Missing 2d context");
      return context;
    };
    const makeCanvas = (width: number, height: number): HTMLCanvasElement => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.appendChild(canvas);
      return canvas;
    };

    // Load the WOFF, register it with the fonts loader under its asset name,
    // and confirm the browser actually accepted the FontFace.
    const fontUrl = "/fixture-assets/rendering-fixture/fonts/ui.woff";
    const bytes = await (await fetch(fontUrl)).arrayBuffer();
    const family = "jgz-core-in-browser-ui";
    const face = new FontFace(family, bytes);
    await face.load();
    document.fonts.add(face);
    fonts.define("ui.woff", {
      kind: "font",
      name: "ui.woff",
      url: fontUrl,
      bytes,
      family,
    });
    const documentFontLoaded = [...document.fonts].some(
      (loadedFace) =>
        loadedFace.family === family && loadedFace.status === "loaded",
    );

    // Draw the same string with the loaded font (via fontname) ...
    const custom = makeCanvas(160, 80);
    const customScreen = new Screen(custom, readback(custom));
    customScreen.fill("#000000");
    customScreen.draw.text("Fonts 0123", [8, 8], {
      fontsize: 32,
      color: "#ffffff",
      fontname: "ui.woff",
    });
    const layout = layoutText(readback(custom), "Fonts 0123", [8, 8], {
      fontsize: 32,
      fontname: "ui.woff",
    });
    const layoutFontContainsFamily = layout.font.includes(family);

    // ... and with a generic system fallback.
    const fallback = makeCanvas(160, 80);
    const fallbackScreen = new Screen(fallback, readback(fallback));
    fallbackScreen.fill("#000000");
    fallbackScreen.draw.text("Fonts 0123", [8, 8], {
      fontsize: 32,
      color: "#ffffff",
      sysfontname: "monospace",
    });

    const customData = readback(custom).getImageData(0, 0, 160, 80).data;
    const fallbackData = readback(fallback).getImageData(0, 0, 160, 80).data;
    let differingPixels = 0;
    for (let index = 0; index < customData.length; index += 4) {
      if (
        Math.abs((customData[index] ?? 0) - (fallbackData[index] ?? 0)) > 40
      ) {
        differingPixels += 1;
      }
    }

    return {
      documentFontLoaded,
      layoutFontContainsFamily,
      pixelsDifferFromFallback: differingPixels > 20,
    };
  });

  // The browser loaded the FontFace, the layout resolved fontname through the
  // fonts loader to the loaded family, and the glyph pixels differ from the
  // generic fallback -- proving the shapes came from the loaded font file.
  expect(result.documentFontLoaded).toBe(true);
  expect(result.layoutFontContainsFamily).toBe(true);
  expect(result.pixelsDifferFromFallback).toBe(true);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
