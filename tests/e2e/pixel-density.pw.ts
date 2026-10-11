import { expect, test, type Page } from "@playwright/test";
import type { GameHandle } from "@js-game-zero/core";
import { collectPageErrors } from "./fixtures/harness-helpers";

declare global {
  interface Window {
    __jgzDensity?: { handle: GameHandle; diagnostics: string[] };
  }
}

type StartOptions = {
  /** CSS for the host page, which holds the game in `<main id="game">`. */
  readonly css?: string;
  readonly runOptions?: Record<string, unknown>;
};

/** Starts a game on a page with no styles of its own, one frame drawn. */
async function startGame(
  page: Page,
  source: string,
  { css = "", runOptions = {} }: StartOptions = {},
): Promise<void> {
  await page.goto("/examples");
  await page.evaluate(
    async ({ source, css, runOptions }) => {
      for (const sheet of document.querySelectorAll(
        'style, link[rel="stylesheet"]',
      ))
        sheet.remove();
      const style = document.createElement("style");
      style.textContent = `html, body { margin: 0; background: #101820; } ${css}`;
      document.head.append(style);
      document.body.innerHTML = '<main id="game"></main>';
      const url = "/runtime/core.js";
      const core = (await import(url)) as typeof import("@js-game-zero/core");
      const diagnostics: string[] = [];
      const handle = core.run(source, {
        container: document.getElementById("game")!,
        autostart: false,
        projectId: "rendering-fixture",
        assetBaseUrl: "/fixture-assets",
        diagnostics: (diagnostic) => diagnostics.push(diagnostic.message),
        ...runOptions,
      });
      window.__jgzDensity = { handle, diagnostics };
      await handle.ready;
      handle.step(0);
    },
    { source, css, runOptions },
  );
}

/** The canvas's pixel size, its CSS box, and the logical screen. */
function sizes(page: Page) {
  return page.evaluate(() => {
    const { handle } = window.__jgzDensity!;
    const box = handle.canvas.getBoundingClientRect();
    const bounds = handle.screen.bounds();
    return {
      canvas: [handle.canvas.width, handle.canvas.height],
      box: [box.width, box.height],
      screen: [handle.screen.width, handle.screen.height],
      density: handle.screen.density,
      bounds: [bounds.left, bounds.top, bounds.width, bounds.height],
    };
  });
}

/** RGBA at canvas pixel `x, y` (not logical units). */
function canvasPixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) => {
      const canvas = window.__jgzDensity!.handle.canvas;
      return [...canvas.getContext("2d")!.getImageData(x!, y!, 1, 1).data];
    },
    [x, y],
  );
}

function step(page: Page): Promise<void> {
  return page.evaluate(() => window.__jgzDensity!.handle.step(1 / 60));
}

const markerGame = `
WIDTH = 200;
HEIGHT = 120;
let clicks = [];
const badge = new Actor("player.svg", { topleft: [150, 80] });
function draw() {
  screen.fill("black");
  screen.rect(10, 20, 30, 40, "red");
  screen.draw.text("Hi", { topleft: [60, 20], size: 20 });
  badge.draw();
}
function on_mouse_down(pos) {
  clicks.push([pos[0], pos[1], badge.collidepoint(pos)]);
  storage.clicks = clicks;
}
`;

test.describe("on a 2x screen", () => {
  test.use({ deviceScaleFactor: 2, viewport: { width: 480, height: 400 } });

  test("draws at density 2 while drawing, bounds and the mouse stay in logical pixels", async ({
    page,
  }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await startGame(page, markerGame);

    expect(await sizes(page)).toEqual({
      canvas: [400, 240],
      box: [200, 120],
      screen: [200, 120],
      density: 2,
      bounds: [0, 0, 200, 120],
    });
    // screen.rect(10, 20, 30, 40) covers canvas pixels 20..79 by 40..119.
    expect(await canvasPixel(page, 20, 40)).toEqual([255, 0, 0, 255]);
    expect(await canvasPixel(page, 79, 119)).toEqual([255, 0, 0, 255]);
    expect(await canvasPixel(page, 80, 60)).toEqual([0, 0, 0, 255]);
    expect(await canvasPixel(page, 19, 60)).toEqual([0, 0, 0, 255]);
    // The far corner of the canvas is drawn too: fill covers it all.
    expect(await canvasPixel(page, 399, 239)).toEqual([0, 0, 0, 255]);

    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.click(box.x + 25, box.y + 30);
    await page.mouse.click(box.x + 160, box.y + 90);
    const clicks = await page.evaluate(() =>
      window.__jgzDensity!.handle.storage.get("clicks"),
    );
    expect(clicks).toEqual([
      [25, 30, false],
      [160, 90, true],
    ]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("PIXEL_DENSITY and the run option override the device's ratio", async ({
    page,
  }) => {
    await startGame(page, `PIXEL_DENSITY = 1;\n${markerGame}`);
    expect(await sizes(page)).toMatchObject({
      canvas: [200, 120],
      box: [200, 120],
      density: 1,
    });
    expect(await canvasPixel(page, 10, 20)).toEqual([255, 0, 0, 255]);

    await startGame(page, markerGame, { runOptions: { PIXEL_DENSITY: 3 } });
    expect(await sizes(page)).toMatchObject({
      canvas: [600, 360],
      box: [200, 120],
      screen: [200, 120],
      density: 3,
    });
    expect(await canvasPixel(page, 30, 60)).toEqual([255, 0, 0, 255]);
  });

  test("an SVG Actor is drawn from the vector, as sharp as the browser draws the SVG itself", async ({
    page,
  }) => {
    const svgGame = (density: number) => `
      WIDTH = 160;
      HEIGHT = 140;
      PIXEL_DENSITY = ${density};
      const big = new Actor("player.svg", { topleft: [0, 0], width: 128 });
      function draw() {
        screen.fill("#101820");
        big.draw();
      }
    `;
    // Compares the canvas to an <img> of the same SVG at the same CSS size.
    const differenceFromBrowser = async (density: number) => {
      await startGame(page, svgGame(density), {
        css: "#game, img { position: absolute; left: 0; } #game { top: 0; } img { top: 200px; width: 128px; height: 96px; }",
      });
      await page.evaluate(async () => {
        const image = document.createElement("img");
        image.src = "/fixture-assets/rendering-fixture/images/player.svg";
        document.body.append(image);
        await image.decode();
      });
      const canvasShot = await page.screenshot({
        clip: { x: 0, y: 0, width: 128, height: 96 },
      });
      const imageShot = await page.screenshot({
        clip: { x: 0, y: 200, width: 128, height: 96 },
      });
      return page.evaluate(
        async ([a, b]) => {
          const decode = async (base64: string) => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d")!;
            context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, image.width, image.height).data;
          };
          const [left, right] = [await decode(a!), await decode(b!)];
          let total = 0;
          for (let index = 0; index < left.length; index += 4) {
            for (let channel = 0; channel < 3; channel += 1) {
              total += Math.abs(
                left[index + channel]! - right[index + channel]!,
              );
            }
          }
          return total / ((left.length / 4) * 3);
        },
        [canvasShot.toString("base64"), imageShot.toString("base64")],
      );
    };

    const sharp = await differenceFromBrowser(2);
    const soft = await differenceFromBrowser(1);
    expect(sharp).toBeLessThan(0.25);
    expect(soft).toBeGreaterThan(sharp * 4);
  });

  test("CSS on the page sizes the canvas, and the mouse follows it", async ({
    page,
  }) => {
    await startGame(page, markerGame, {
      css: "#game { width: 300px; } #game canvas { display: block; width: 100%; }",
    });
    expect(await sizes(page)).toMatchObject({
      canvas: [400, 240],
      box: [300, 180],
      screen: [200, 120],
    });
    const box = (await page.locator("canvas").boundingBox())!;
    await page.mouse.click(box.x + 150, box.y + 90);
    expect(
      await page.evaluate(() =>
        window.__jgzDensity!.handle.storage.get("clicks"),
      ),
    ).toEqual([[100, 60, false]]);
  });

  test("follows a change in the device's ratio and keeps what's drawn", async ({
    page,
  }) => {
    // Paints once, like a drawing game that never clears the screen.
    await startGame(
      page,
      `
      WIDTH = 200;
      HEIGHT = 120;
      let painted = false;
      function draw() {
        if (painted) return;
        screen.fill("black");
        screen.rect(10, 20, 30, 40, "red");
        painted = true;
      }
      `,
    );
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 480,
      height: 400,
      deviceScaleFactor: 3,
      mobile: false,
    });
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(3);
    await step(page);
    expect(await sizes(page)).toMatchObject({
      canvas: [600, 360],
      box: [200, 120],
      screen: [200, 120],
      density: 3,
    });
    // The painting was kept, rescaled to the new density.
    expect(await canvasPixel(page, 36, 66)).toEqual([255, 0, 0, 255]);
    expect(await canvasPixel(page, 114, 174)).toEqual([255, 0, 0, 255]);
    expect(await canvasPixel(page, 126, 90)).toEqual([0, 0, 0, 255]);

    // New drawing lands on the 3x canvas pixels exactly.
    await page.evaluate(() => {
      window.__jgzDensity!.handle.screen.rect(100, 0, 10, 10, "lime");
    });
    expect(await canvasPixel(page, 300, 0)).toEqual([0, 255, 0, 255]);
    expect(await canvasPixel(page, 329, 29)).toEqual([0, 255, 0, 255]);
    expect(await canvasPixel(page, 330, 30)).toEqual([0, 0, 0, 255]);
  });

  test("a host that resizes the canvas sets the logical size", async ({
    page,
  }) => {
    await startGame(page, markerGame);
    await page.evaluate(() => {
      const { canvas } = window.__jgzDensity!.handle;
      canvas.width = 300;
    });
    await step(page);
    expect(await sizes(page)).toMatchObject({
      canvas: [600, 240],
      box: [300, 120],
      screen: [300, 120],
      bounds: [0, 0, 300, 120],
    });
    expect(await canvasPixel(page, 20, 40)).toEqual([255, 0, 0, 255]);
    expect(await canvasPixel(page, 599, 239)).toEqual([0, 0, 0, 255]);

    // Setting a size to what it already is resets the canvas's scale.
    await page.evaluate(() => {
      const { canvas } = window.__jgzDensity!.handle;
      canvas.height = canvas.height;
    });
    await step(page);
    expect(await canvasPixel(page, 79, 119)).toEqual([255, 0, 0, 255]);
  });
});

test.describe("on a 2x phone with the touch dock", () => {
  test.use({
    deviceScaleFactor: 2,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("the dock fits the logical screen, and taps land in logical pixels", async ({
    page,
  }) => {
    await startGame(
      page,
      `
      WIDTH = 360;
      HEIGHT = 640;
      TOUCH_CONTROLS = { left: keys.LEFT, right: keys.RIGHT };
      function draw() { screen.fill("navy"); screen.rect(0, 0, 36, 64, "red"); }
      function on_mouse_down(pos) { storage.tap = pos; }
      `,
      {
        css: "#game { height: 100dvh; display: flex; flex-direction: column; align-items: center; }",
      },
    );
    const measured = await sizes(page);
    expect(measured.canvas).toEqual([720, 1280]);
    expect(measured.screen).toEqual([360, 640]);
    const [width, height] = measured.box as [number, number];
    expect(width).toBeLessThanOrEqual(390);
    expect(width / height).toBeCloseTo(360 / 640, 2);
    // The dock scaled the canvas, so a tap at its center is the screen's center.
    const box = (await page.locator("canvas").boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    const tap = (await page.evaluate(() =>
      window.__jgzDensity!.handle.storage.get("tap"),
    )) as [number, number];
    expect(tap[0]).toBeCloseTo(180, 0);
    expect(tap[1]).toBeCloseTo(320, 0);
    expect(await canvasPixel(page, 71, 127)).toEqual([255, 0, 0, 255]);
  });
});
