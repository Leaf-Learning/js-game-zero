import { expect, test } from "bun:test";
import { packageName, phaseOneSmoke } from "@js-game-zero/core";

test("core package scaffold exports a smoke marker", () => {
  expect(packageName).toBe("@js-game-zero/core");
  expect(phaseOneSmoke()).toBe("core package scaffold ready");
});
