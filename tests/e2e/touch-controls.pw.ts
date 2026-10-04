import { expect, test, type Locator, type Page } from "@playwright/test";
import type { GameHandle } from "@js-game-zero/core";
import {
  collectPageErrors,
  waitForExampleStatus,
} from "./fixtures/harness-helpers";

declare global {
  interface Window {
    __jgzTouchGame?: { handle: GameHandle; source: string };
  }
}

async function startGame(page: Page, config = "true"): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (config) => {
    const url = "/runtime/core.js";
    const core = (await import(url)) as typeof import("@js-game-zero/core");
    document.body.innerHTML = '<canvas tabindex="0"></canvas>';
    document.body.style.cssText =
      "margin:0;height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#150f1c;overflow:hidden";
    const canvas = document.querySelector("canvas")!;
    const source = `
      WIDTH = 640; HEIGHT = 480;
      TOUCH_CONTROLS = ${config};
      storage.x = 100; storage.actions = 0; storage.downs = []; storage.ups = []; storage.mouse = [];
      function update(dt) { if (keyboard.right) storage.x += 120 * dt; }
      function draw() { screen.fill("#152638"); screen.draw.filled_circle([storage.x, 240], 20, keyboard.space ? "gold" : "white"); }
      function on_key_down(key, mod, unicode, repeat) { storage.downs.push({key, mod, unicode, repeat}); if (key === keys.SPACE) storage.actions += 1; }
      function on_key_up(key) { storage.ups.push(key); }
      function on_mouse_down(pos, button) { storage.mouse.push({type:"down", pos, button}); }
      function on_mouse_move(pos, rel, buttons) { storage.mouse.push({type:"move", pos, rel, buttons:[...buttons]}); }
      function on_mouse_up(pos, button) { storage.mouse.push({type:"up", pos, button}); }
    `;
    const handle = core.run(source, {
      canvas,
      autostart: false,
      projectId: "touch-e2e",
    });
    window.__jgzTouchGame = { handle, source };
    await handle.ready;
    handle.step(0);
  }, config);
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Missing control bounds.");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const { handle } = window.__jgzTouchGame!;
    return {
      right: handle.keyboard.right,
      space: handle.keyboard.space,
      pressed: handle.keyboard.pressed(),
      x: handle.storage.get("x"),
      actions: handle.storage.get("actions"),
      downs: handle.storage.get("downs"),
      ups: handle.storage.get("ups"),
      mouse: handle.storage.get("mouse"),
      state: handle.state,
    };
  });
}

test.describe("mobile touch input", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("real simultaneous touches move and fire, preserve keyboard ownership, and clean up on cancellation and reload", async ({
    page,
  }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await startGame(
      page,
      "{ up: keys.UP, down: keys.DOWN, left: keys.LEFT, right: keys.RIGHT, a: keys.SPACE, b: keys.SPACE, start: keys.RETURN, select: keys.ESCAPE }",
    );
    const controls = page.locator("[data-jgz-touch-controls]");
    await expect(controls).toBeVisible();
    const right = await center(
      controls.getByRole("button", { name: "Right", exact: true }),
    );
    const a = await center(
      controls.getByRole("button", { name: "A", exact: true }),
    );
    const b = await center(
      controls.getByRole("button", { name: "B", exact: true }),
    );
    const session = await page.context().newCDPSession(page);
    const points = [
      { ...right, id: 1 },
      { ...a, id: 2 },
      { ...b, id: 3 },
    ];
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points,
    });
    await expect
      .poll(() => snapshot(page))
      .toMatchObject({ right: true, space: true, actions: 1 });
    await page.evaluate(() => window.__jgzTouchGame!.handle.step(0.25));
    expect(await snapshot(page)).toMatchObject({
      x: 130,
      mouse: [],
      downs: [
        { key: 1073741903, mod: 0, unicode: "", repeat: false },
        { key: 32, mod: 0, unicode: "", repeat: false },
      ],
    });
    await page.keyboard.down("ArrowRight");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [points[0]!, points[1]!],
    });
    expect(await snapshot(page)).toMatchObject({
      right: true,
      space: true,
      ups: [],
    });
    await page.keyboard.up("ArrowRight");
    expect(await snapshot(page)).toMatchObject({ right: false, space: true });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect.poll(() => snapshot(page)).toMatchObject({ pressed: [] });
    await expect(
      controls.getByRole("button", { name: "B", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");

    await page.touchscreen.tap(a.x, a.y);
    expect(await snapshot(page)).toMatchObject({ actions: 2, mouse: [] });
    await page.evaluate(() => {
      const game = window.__jgzTouchGame!;
      game.handle = game.handle.reload(game.source);
    });
    await expect(controls).toHaveCount(1);
    await page.touchscreen.tap(a.x, a.y);
    expect(await snapshot(page)).toMatchObject({ actions: 1 });
    await page.evaluate(() => window.__jgzTouchGame!.handle.stop());
    await expect(controls).toHaveCount(0);
    await expect(page.locator("[data-jgz-touch-surface]")).toHaveCount(0);
    await page.touchscreen.tap(100, 100);
    expect(await snapshot(page)).toMatchObject({
      pressed: [],
      mouse: [],
      state: "stopped",
    });
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("touch canvas drags map once to scaled mouse coordinates and remain captured outside the canvas", async ({
    page,
  }) => {
    const { pageErrors } = collectPageErrors(page);
    await startGame(page, "false");
    // CSS scale is independent of logical drawing dimensions.
    await page.locator("canvas").evaluate((canvas) => {
      canvas.style.width = "320px";
      canvas.style.height = "240px";
    });
    const box = (await page.locator("canvas").boundingBox())!;
    const session = await page.context().newCDPSession(page);
    const first = { x: box.x + 80, y: box.y + 60, id: 1 };
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [first],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...first, x: box.x + 120, y: box.y + 90 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...first, x: box.x + 340, y: box.y + 260 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () => (await snapshot(page)).mouse)
      .toEqual([
        { type: "down", pos: [160, 120], button: 1 },
        { type: "move", pos: [240, 180], rel: [80, 60], buttons: [1] },
        { type: "move", pos: [680, 520], rel: [440, 340], buttons: [1] },
        { type: "up", pos: [680, 520], button: 1 },
      ]);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [first],
    });
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect((await snapshot(page)).mouse).toEqual([
      { type: "down", pos: [160, 120], button: 1 },
      { type: "move", pos: [240, 180], rel: [80, 60], buttons: [1] },
      { type: "move", pos: [680, 520], rel: [440, 340], buttons: [1] },
      { type: "up", pos: [680, 520], button: 1 },
      { type: "down", pos: [160, 120], button: 1 },
      { type: "up", pos: [160, 120], button: 1 },
    ]);
    await expect(page.locator("[data-jgz-touch-controls]")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("a finger can slide between D-pad directions while an action remains held", async ({
    page,
  }) => {
    await startGame(page);
    const controls = page.locator("[data-jgz-touch-controls]");
    const right = await center(
      controls.getByRole("button", { name: "Right", exact: true }),
    );
    const up = await center(
      controls.getByRole("button", { name: "Up", exact: true }),
    );
    const a = await center(
      controls.getByRole("button", { name: "A", exact: true }),
    );
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { ...right, id: 1 },
        { ...a, id: 2 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { ...up, id: 1 },
        { ...a, id: 2 },
      ],
    });
    await expect
      .poll(() => snapshot(page))
      .toMatchObject({ right: false, space: true, pressed: [32, 1073741906] });
    await expect(
      controls.getByRole("button", { name: "Up", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      controls.getByRole("button", { name: "Right", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect.poll(() => snapshot(page)).toMatchObject({ pressed: [] });
  });

  test("portrait and landscape layouts keep the game and eight buttons in the viewport", async ({
    page,
  }) => {
    const { pageErrors } = collectPageErrors(page);
    await startGame(page);
    // Match the example pages' host sizing rules, which constrain only width.
    await page.locator("canvas").evaluate((canvas) => {
      canvas.style.maxWidth = "calc(100vw - 32px)";
      canvas.style.border = "1px solid #718096";
    });
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(async () => {
          const canvas = (await page.locator("canvas").boundingBox())!;
          const controls = (await page
            .locator("[data-jgz-touch-controls]")
            .boundingBox())!;
          return (
            canvas.y >= 0 &&
            canvas.width > 0 &&
            Math.abs((canvas.width - 2) / (canvas.height - 2) - 4 / 3) < 0.01 &&
            canvas.y + canvas.height <= controls.y + 1 &&
            controls.y - (canvas.y + canvas.height) >= 15 &&
            controls.y - (canvas.y + canvas.height) <= 25 &&
            controls.y + controls.height <= viewport.height + 1 &&
            controls.y + controls.height >= viewport.height - 1 &&
            controls.x >= 0 &&
            controls.x + controls.width <= viewport.width + 1
          );
        })
        .toBe(true);
      await expect(
        page.locator("[data-jgz-touch-controls] button"),
      ).toHaveCount(8);
      const controls = page.locator("[data-jgz-touch-controls]");
      const a = await center(
        controls.getByRole("button", { name: "A", exact: true }),
      );
      const b = await center(
        controls.getByRole("button", { name: "B", exact: true }),
      );
      expect(a.x).toBeGreaterThan(b.x);
      expect(a.y).toBeLessThan(b.y);
      for (const button of await controls.getByRole("button").all()) {
        const box = (await button.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
      if (viewport.height > viewport.width) {
        const dpad = (await controls.locator(".jgz-dpad").boundingBox())!;
        const actions = (await controls.locator(".jgz-actions").boundingBox())!;
        const system = (await controls.locator(".jgz-system").boundingBox())!;
        expect(system.y).toBeGreaterThanOrEqual(
          Math.max(dpad.y + dpad.height, actions.y + actions.height),
        );
        expect(
          viewport.height - (system.y + system.height),
        ).toBeGreaterThanOrEqual(11);
        expect(
          viewport.height - (system.y + system.height),
        ).toBeLessThanOrEqual(13);
        await page.screenshot({
          path: `test-results/touch-controls-portrait-${viewport.width}.png`,
        });
      }
    }
    await page.screenshot({
      path: "test-results/touch-controls-landscape.png",
    });
    expect(pageErrors).toEqual([]);
  });

  test("a simple action button remains close to the bottom with a comfortable screen gap", async ({
    page,
  }) => {
    await startGame(page, "{ a: keys.SPACE }");
    await expect
      .poll(async () => {
        const canvas = (await page.locator("canvas").boundingBox())!;
        const a = (await page
          .getByRole("button", { name: "A", exact: true })
          .boundingBox())!;
        return {
          bottomInset: 844 - (a.y + a.height),
          screenGap: a.y - (canvas.y + canvas.height),
        };
      })
      .toEqual({ bottomInset: 12, screenGap: 32 });
    await page.getByRole("button", { name: "A", exact: true }).tap();
    expect(await snapshot(page)).toMatchObject({ actions: 1, pressed: [] });
  });

  test("the platformer example supports touch movement and jumping", async ({
    page,
  }) => {
    const { pageErrors } = collectPageErrors(page);
    await page.goto("/examples/platformer");
    await waitForExampleStatus(page, "platformer");
    await expect
      .poll(() =>
        page.locator("canvas").evaluate((canvas) => {
          const rect = canvas.getBoundingClientRect();
          const game = canvas as HTMLCanvasElement;
          return Math.abs(
            (rect.width - 2) / (rect.height - 2) - game.width / game.height,
          );
        }),
      )
      .toBeLessThan(0.01);
    const right = await center(
      page.getByRole("button", { name: "Right", exact: true }),
    );
    const a = await center(
      page.getByRole("button", { name: "A", exact: true }),
    );
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { ...right, id: 1 },
        { ...a, id: 2 },
      ],
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const handle = (
            window as typeof window & { __jgzExampleHandle: GameHandle }
          ).__jgzExampleHandle;
          return {
            right: handle.keyboard.right,
            space: handle.keyboard.space,
            failed: handle.state === "failed",
          };
        }),
      )
      .toEqual({ right: true, space: true, failed: false });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect(pageErrors).toEqual([]);
  });

  test("sandbox previews fit their touch dock and receive mapped actions inside the iframe", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await page.locator("[data-jgz-new-project]").click();
    await page.locator("[data-jgz-choose-blank]").click();
    const name = `touch_${Date.now().toString(36)}`;
    await page.locator("[data-jgz-dialog-input]").fill(name);
    await page.locator("[data-jgz-dialog-submit]").click();
    await expect(
      page.getByText(`Created "${name}".`, { exact: true }),
    ).toBeVisible();
    const editor = page.locator("[data-jgz-editor-mount] .cm-content");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await editor.fill(`
      WIDTH = 640; HEIGHT = 480;
      TOUCH_CONTROLS = { left: keys.LEFT, right: keys.RIGHT, a: keys.SPACE };
      let activated = false;
      function on_key_down(key) { if (key === keys.SPACE) activated = true; }
      function draw() { screen.fill(activated ? "gold" : "navy"); }
    `);
    await page.locator("[data-jgz-play]").click();
    const frame = page.frameLocator("[data-jgz-preview]");
    const canvas = frame.locator("canvas");
    const controls = frame.locator("[data-jgz-touch-controls]");
    await expect(controls).toBeVisible();
    // The preview's own fitter and the runtime must agree on the space reserved.
    await expect
      .poll(() =>
        canvas.evaluate((canvas) => {
          const root = canvas.parentElement!.querySelector(
            "[data-jgz-touch-controls]",
          )!;
          const rect = canvas.getBoundingClientRect();
          const dock = root.getBoundingClientRect();
          return (
            rect.height > 0 &&
            rect.bottom <= dock.top + 1 &&
            dock.top - rect.bottom >= 15 &&
            dock.top - rect.bottom <= 25 &&
            dock.bottom <=
              canvas.ownerDocument.documentElement.clientHeight + 1 &&
            dock.bottom >=
              canvas.ownerDocument.documentElement.clientHeight - 1 &&
            Math.abs(rect.width / rect.height - 4 / 3) < 0.01
          );
        }),
      )
      .toBe(true);
    const overlay = page.locator("[data-jgz-focus-overlay]");
    if (await overlay.isVisible()) await overlay.tap();
    await controls.getByRole("button", { name: "A", exact: true }).tap();
    await expect
      .poll(() =>
        canvas.evaluate((canvas) => [
          ...(canvas as HTMLCanvasElement)
            .getContext("2d")!
            .getImageData(10, 10, 1, 1).data,
        ]),
      )
      .toEqual([255, 215, 0, 255]);
    await page.locator("[data-jgz-stop]").click();
    await expect(page.locator("[data-jgz-preview-status]")).toHaveText(
      "Stopped",
    );
  });
});

test("desktop controls are opt-in and support mouse and accessible keyboard activation", async ({
  page,
}) => {
  await startGame(page);
  await expect(page.locator("[data-jgz-touch-controls]")).toBeHidden();
  await startGame(page, '{ a: keys.SPACE, show: "always" }');
  const a = page.getByRole("button", { name: "A", exact: true });
  await a.click();
  expect(await snapshot(page)).toMatchObject({
    actions: 1,
    pressed: [],
    mouse: [],
  });
  await a.focus();
  await page.keyboard.down("Enter");
  expect(await snapshot(page)).toMatchObject({ actions: 2, space: true });
  await page.keyboard.up("Enter");
  expect(await snapshot(page)).toMatchObject({ pressed: [] });
  const position = await center(a);
  await page.mouse.move(position.x, position.y);
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  expect(await snapshot(page)).toMatchObject({ pressed: [] });
  await expect(a).toHaveAttribute("aria-pressed", "false");
  await page.mouse.up();
  await a.click();
  expect(await snapshot(page)).toMatchObject({ actions: 4, pressed: [] });
});

test("a throwing touch hook fails and disposes its runtime", async ({
  page,
}) => {
  await startGame(page, '{ a: keys.SPACE, show: "always" }');
  await page.evaluate(() => {
    const game = window.__jgzTouchGame!;
    game.handle = game.handle.reload(`
      TOUCH_CONTROLS = { a: keys.SPACE, show: "always" };
      function on_key_down() { throw new Error("touch hook failed"); }
      function draw() { screen.fill("navy"); }
    `);
  });
  await page.getByRole("button", { name: "A", exact: true }).click();
  await expect(page.locator("[data-jgz-touch-controls]")).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const { handle } = window.__jgzTouchGame!;
      return {
        state: handle.state,
        failure: handle.failure?.phase,
        pressed: handle.keyboard.pressed(),
      };
    }),
  ).toEqual({ state: "failed", failure: "input", pressed: [] });
});
