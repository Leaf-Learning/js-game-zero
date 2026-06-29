import { expect, test } from "bun:test";
import { packageName, phaseOneSmoke } from "../src/index";

test("browser runtime scaffold exports a smoke marker", () => {
  expect(packageName).toBe("@js-game-zero/browser-runtime");
  expect(phaseOneSmoke()).toBe("browser runtime scaffold ready");
});
