import { describe, expect, test } from "bun:test";
import {
  KeyboardState,
  keymods,
  keys,
  keyboard,
  mouse,
} from "@js-game-zero/core";

describe("keyboard constants and state", () => {
  test("exports key constants, lower-case keyboard attributes, and the enter alias", () => {
    const state = new KeyboardState();
    expect(keys.A).toBe(97);
    expect(keys.K_0).toBe(48);
    expect(keys.LEFT).toBeNumber();
    expect(keys.ENTER).toBe(keys.RETURN);
    expect(state.a).toBe(false);
    state.press(keys.A);
    state.press(keys.RETURN);
    expect(state.a).toBe(true);
    expect(state.enter).toBe(true);
    expect(state.return).toBe(true);
    expect(state[keys.A]).toBe(true);
  });

  test("press, release, clear, and invalid constants are deterministic", () => {
    const state = new KeyboardState();
    state.press(keys.SPACE);
    state.press(keys.LEFT);
    expect(state.pressed()).toEqual(
      [keys.SPACE, keys.LEFT].sort((a, b) => a - b),
    );
    state.release(keys.LEFT);
    expect(state.left).toBe(false);
    expect(state.space).toBe(true);
    state.clear();
    expect(state.space).toBe(false);
    expect(() => state.press(999_999)).toThrow(TypeError);
  });

  test("unknown keyboard attributes throw, matching pgzero's AttributeError, without masking methods", () => {
    const state = new KeyboardState();
    const unknown = state as unknown as Record<string, unknown>;
    expect(() => unknown.this_key_does_not_exist).toThrow(
      'The key "this_key_does_not_exist" does not exist',
    );
    expect(typeof state.clear).toBe("function");
    expect(state.a).toBe(false);
    // A misspelling names the key it's closest to.
    expect(() => unknown.rigth).toThrow(
      "keyboard.rigth doesn't exist. Did you mean keyboard.right?",
    );
  });

  test("meta-property probes (thenables, JSON, inspection) stay safe and never throw", () => {
    const state = new KeyboardState();
    const probed = state as unknown as Record<string | symbol, unknown>;
    expect(probed.then).toBeUndefined();
    expect(probed.toJSON).toBeUndefined();
    expect(probed.inspect).toBeUndefined();
    expect(typeof probed.constructor).toBe("function");
    expect(typeof probed.valueOf).toBe("function");
    expect(typeof probed.toString).toBe("function");
    expect(typeof probed.hasOwnProperty).toBe("function");
    expect(probed[Symbol.iterator]).toBeUndefined();
    expect(probed[Symbol.for("nodejs.util.inspect.custom")]).toBeUndefined();
    expect(() => JSON.stringify(state)).not.toThrow();
    expect(() => String(state)).not.toThrow();
  });

  test("exports modifier and mouse bitmask constants", () => {
    expect(keymods.NONE as number).toBe(0);
    expect(keymods.SHIFT as number).toBe(keymods.LSHIFT | keymods.RSHIFT);
    expect(keymods.CTRL as number).toBe(keymods.LCTRL | keymods.RCTRL);
    expect(keymods.ALT as number).toBe(keymods.LALT | keymods.RALT);
    expect(keymods.META as number).toBe(keymods.LMETA | keymods.RMETA);
    expect(mouse.LEFT).toBe(1);
    expect(mouse.WHEEL_DOWN).toBe(5);
  });

  test("the shared keyboard singleton can be cleared between runs", () => {
    keyboard.clear();
    keyboard.press(keys.RIGHT);
    expect(keyboard.right).toBe(true);
    keyboard.clear();
    expect(keyboard.right).toBe(false);
  });
});
