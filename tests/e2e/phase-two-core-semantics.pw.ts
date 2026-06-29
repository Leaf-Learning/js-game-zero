import { expect, test } from "@playwright/test";
import { keys, mouse } from "@js-game-zero/core";

test("phase 2 fixture maps real browser input, clock, and animation state", async ({
  page,
}) => {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/phase-two");
  await expect(page).toHaveTitle("js-game-zero Phase 2 Semantics");
  await expect(
    page.getByRole("heading", { name: "js-game-zero core semantics fixture" }),
  ).toBeVisible();
  await page.waitForFunction(
    () => (window as typeof window & { __jgzTest?: unknown }).__jgzTest,
  );
  await page.waitForFunction(
    () =>
      (window as typeof window & { __jgzTest?: { ready?: boolean } }).__jgzTest
        ?.ready,
  );

  const canvas = page.locator("[data-jgz-phase-two-canvas]");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error("Phase 2 canvas was not laid out.");

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
          __jgzTest?: { clockFired?: boolean; animationDone?: boolean };
        }
      ).__jgzTest;
      return state?.clockFired && state.animationDone;
    },
    undefined,
    { timeout: 5_000 },
  );

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __jgzTest?: {
            events: Array<Record<string, unknown>>;
            keyboardState: Record<string, boolean>;
            clockFired: boolean;
            animatedX: number;
            animationDone: boolean;
          };
        }
      ).__jgzTest,
  );
  expect(state).toBeTruthy();
  if (!state) throw new Error("Missing phase 2 fixture state.");

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

  expect(leftDown?.keyboard).toMatchObject({ left: true });
  expect(leftUp?.keyboard).toMatchObject({ left: false });
  expect(aDown).toMatchObject({ unicode: "a" });
  expect(mouseDown).toBeTruthy();
  expect(dragMove?.rel).not.toEqual([0, 0]);
  expect(state.keyboardState).toMatchObject({ left: false, a: false });
  expect(state.clockFired).toBe(true);
  expect(state.animationDone).toBe(true);
  expect(state.animatedX).toBe(100);
  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
