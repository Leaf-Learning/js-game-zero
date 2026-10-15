import { expect, test } from "@playwright/test";
import { createSeededRandom } from "@js-game-zero/core/host";
import { collectPageErrors } from "./fixtures/harness-helpers";

/**
 * A host page drives a game through the script-tag build alone: it runs a
 * seeded copy off-screen beside a visible game, steps its frames, sends it
 * keys and clicks at logical coordinates, and reads its state, the way the
 * CLI's `play` does. Nothing it does reaches the visible game.
 */

const GAME = `
WIDTH = 200;
HEIGHT = 100;
let cat = { x: 10 };
let fish = [{ y: Math.random() }, { y: randomInt(1, 1000) }];
let taps = 0, lastClick = null, lastMove = null, released = 0;
function update(dt) {
  if (keyboard.right) cat.x += 60 * dt;
}
function onKeyDown(key) {
  if (key === keys.SPACE) taps += 1;
}
function onMouseMove(pos) {
  lastMove = pos;
}
function onMouseDown(pos) {
  lastClick = pos;
}
function onMouseUp() {
  released += 1;
}
function draw() {
  screen.fill("navy");
}
`;

type HostResult = {
  readonly api: Record<string, string>;
  readonly sameCanvas: boolean;
  readonly before: unknown;
  readonly after: unknown;
  readonly snapshot: Record<string, unknown>;
  readonly visible: unknown;
  readonly pageRandomUntouched: boolean;
};

test("a host page runs a seeded game off-screen, drives it and reads its state", async ({
  page,
}) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/fixtures/browser-host");
  await page.waitForFunction(() => Boolean(window.JGZ?.getGameInspector));

  const result = await page.evaluate(async (source): Promise<HostResult> => {
    const JGZ = window.JGZ!;
    const pageRandom = Math.random;
    const api = Object.fromEntries(
      [
        "run",
        "getGameInspector",
        "serializeGameValue",
        "parseStatePath",
        "createSeededRandom",
      ].map((name) => [name, typeof (JGZ as Record<string, unknown>)[name]]),
    );

    // The visible game: started as any page would, on window's input.
    const container = document.querySelector<HTMLElement>("[data-jgz-host]")!;
    const visible = JGZ.run(source, { container });

    // The driven copy: a canvas never added to the page, its own input
    // targets, frames stepped from outside, and a seed.
    const canvas = document.createElement("canvas");
    const handle = JGZ.run(source, {
      canvas,
      autostart: false,
      seed: "host",
      keyboardTarget: canvas,
      mouseReleaseTarget: canvas,
      PIXEL_DENSITY: 1,
    });
    await Promise.all([handle.ready, visible.ready]);
    handle.step(0);
    const inspector = JGZ.getGameInspector(handle)!;
    const before = inspector.inspect();

    const key = (type: "keydown" | "keyup", key: string, code: string) =>
      canvas.dispatchEvent(new KeyboardEvent(type, { key, code }));
    // Off the page, client coordinates are the game's logical coordinates.
    const mouse = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(
        new MouseEvent(type, {
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === "mousedown" ? 1 : 0,
        }),
      );
    key("keydown", "ArrowRight", "ArrowRight");
    for (let frame = 0; frame < 30; frame += 1) handle.step(1 / 60);
    key("keyup", "ArrowRight", "ArrowRight");
    key("keydown", " ", "Space");
    key("keyup", " ", "Space");
    mouse("mousemove", 15, 12);
    mouse("mousedown", 25, 30);
    mouse("mouseup", 25, 30);
    handle.step(1 / 60);

    const after = {
      catX: inspector.inspect("cat.x"),
      taps: inspector.inspect("taps"),
      lastMove: inspector.inspect("lastMove"),
      lastClick: inspector.inspect("lastClick"),
      released: inspector.inspect("released"),
      fish: inspector.inspect("fish"),
    };
    const visibleInspector = JGZ.getGameInspector(visible)!;
    const result = {
      api,
      sameCanvas: handle.canvas === canvas,
      before,
      after,
      snapshot: JGZ.serializeGameValue({
        path: JGZ.parseStatePath("fish[0].y"),
      }) as Record<string, unknown>,
      visible: {
        catX: visibleInspector.read("cat.x"),
        taps: visibleInspector.read("taps"),
        lastClick: visibleInspector.read("lastClick"),
        released: visibleInspector.read("released"),
      },
      pageRandomUntouched: Math.random === pageRandom,
    };
    handle.stop();
    visible.stop();
    return result;
  }, GAME);

  expect(result.api).toEqual({
    run: "function",
    getGameInspector: "function",
    serializeGameValue: "function",
    parseStatePath: "function",
    createSeededRandom: "function",
  });
  expect(result.sameCanvas).toBe(true);

  // The seed gives the sequence the CLI's --seed gives (createSeededRandom is
  // the CLI's own seeding).
  const random = createSeededRandom("host");
  const fish = [{ y: random() }, { y: 1 + Math.floor(random() * 1000) }];
  expect(result.before).toEqual({
    WIDTH: 200,
    HEIGHT: 100,
    cat: { x: 10 },
    fish,
    taps: 0,
    lastClick: null,
    lastMove: null,
    released: 0,
  });

  expect(result.after).toMatchObject({
    taps: 1,
    lastMove: [15, 12],
    lastClick: [25, 30],
    released: 1,
    fish,
  });
  expect((result.after as { catX: number }).catX).toBeCloseTo(40, 6);
  expect(result.snapshot).toEqual({
    path: { source: "fish[0].y", binding: "fish", segments: [0, "y"] },
  });

  // Nothing sent to the driven copy reached the visible game.
  expect(result.visible).toEqual({
    catX: 10,
    taps: 0,
    lastClick: null,
    released: 0,
  });
  expect(result.pageRandomUntouched).toBe(true);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
