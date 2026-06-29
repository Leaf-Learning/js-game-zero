import { describe, expect, test } from "bun:test";
import {
  KeyboardState,
  keyName,
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
    expect(keyName(keys.LEFT)).toBe("LEFT");
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
    expect(() => keyName(999_999)).toThrow(TypeError);
  });

  test("unknown keyboard attributes return false without masking methods", () => {
    const state = new KeyboardState();
    expect(state.this_key_does_not_exist).toBe(false);
    expect(typeof state.clear).toBe("function");
  });

  test("exports modifier and mouse bitmask constants", () => {
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
