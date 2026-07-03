import { expect, test } from "@playwright/test";
import { mouse } from "@js-game-zero/core";

type WheelEventRecord = { pos: [number, number]; button: number };

type FixtureState = {
  ready: boolean;
  wheelEvents: WheelEventRecord[];
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

/**
 * Exercises the input/audio/clock parity fixes end-to-end in a real browser:
 *
 * 1. A native `wheel` DOM event (not a synthetic mousedown with button 3/4)
 *    dispatches `on_mouse_down` with `mouse.WHEEL_UP` / `mouse.WHEEL_DOWN`.
 * 2. Two `sound.play()` calls overlap instead of the second cutting off the
 *    first (pygame Sounds mix on channels).
 * 3. A throwing `clock.each_tick` callback is logged and auto-unscheduled
 *    without aborting the frame -- the game (represented here by the
 *    surrounding requestAnimationFrame loop and a second, non-throwing
 *    each_tick callback) keeps animating.
 */
test("wheel input, overlapping sounds, and clock error resilience hold up in a real browser", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await page.evaluate(async () => {
    // The sandbox server bundles packages/core/src/index.ts on the fly at
    // this path; it isn't a resolvable module from the test runner's
    // perspective, so its type can't be statically checked here.
    // @ts-expect-error -- runtime-only bundle path served by the sandbox
    const core = (await import("/runtime/core.js")) as {
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
      url: "/assets/rendering-fixture/sounds/tap.wav",
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

  // The throwing each_tick callback fired exactly once before being
  // auto-unscheduled, while the sibling each_tick callback -- and the
  // requestAnimationFrame game loop driving clock.tick() -- kept running
  // every frame afterwards, proving the exception did not abort the frame.
  expect(state.throwingCalls).toBe(3);
  expect(state.animationX).toBe(state.animatedFrames);
  expect(state.animatedFrames).toBeGreaterThan(20);

  expect(
    consoleErrors.some((message) => message.includes("e2e-clock-boom")),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
