import { expect, test } from "bun:test";
import * as core from "@js-game-zero/core";
import * as browserRuntime from "@js-game-zero/browser-runtime";

test("re-exports every named export of @js-game-zero/core by reference", () => {
  const coreExports = core as Record<string, unknown>;
  const browserRuntimeExports = browserRuntime as Record<string, unknown>;
  const coreKeys = Object.keys(coreExports).sort();

  // A real package, not a scaffold: this asserts against the actual size of
  // core's export surface, so it fails loudly if @js-game-zero/core stops
  // being re-exported wholesale.
  expect(coreKeys.length).toBeGreaterThan(20);

  for (const key of coreKeys) {
    expect(browserRuntimeExports).toHaveProperty(key);
    expect(browserRuntimeExports[key]).toBe(coreExports[key]);
  }
});

test("does not add any exports beyond core's surface", () => {
  const coreKeys = new Set(Object.keys(core as Record<string, unknown>));
  const browserRuntimeKeys = Object.keys(
    browserRuntime as Record<string, unknown>,
  );
  const extra = browserRuntimeKeys.filter((key) => !coreKeys.has(key));
  expect(extra).toEqual([]);
});

test("known core symbols (classes, functions, constants) come through intact", () => {
  expect(browserRuntime.Actor).toBe(core.Actor);
  expect(browserRuntime.Screen).toBe(core.Screen);
  expect(browserRuntime.Clock).toBe(core.Clock);
  expect(browserRuntime.Animation).toBe(core.Animation);
  expect(typeof browserRuntime.run).toBe("function");
  expect(typeof browserRuntime.createStorage).toBe("function");
});
