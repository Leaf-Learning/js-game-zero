import { describe, expect, test } from "bun:test";
import { keys } from "@js-game-zero/core";
import { InputDispatcher } from "@js-game-zero/core/host";
import { normalizeTouchControls } from "../src/touch-controls";

describe("touch control configuration", () => {
  test("is opt-in, with a full preset or only explicitly mapped buttons", () => {
    expect(normalizeTouchControls(undefined)).toBeNull();
    expect(normalizeTouchControls(false)).toBeNull();
    expect(normalizeTouchControls(true)).toEqual({
      show: "auto",
      buttons: [
        ["up", keys.UP],
        ["down", keys.DOWN],
        ["left", keys.LEFT],
        ["right", keys.RIGHT],
        ["a", keys.SPACE],
        ["b", keys.X],
        ["start", keys.RETURN],
        ["select", keys.ESCAPE],
      ],
    });
    expect(
      normalizeTouchControls({
        left: keys.A,
        right: keys.D,
        a: keys.UP,
        show: "always",
      }),
    ).toEqual({
      show: "always",
      buttons: [
        ["left", keys.A],
        ["right", keys.D],
        ["a", keys.UP],
      ],
    });
  });

  test("rejects misspelled buttons and invalid mappings before startup", () => {
    for (const value of [
      null,
      3,
      [],
      "auto",
      { jump: keys.SPACE },
      { a: "Space" },
      { a: 999_999 },
      { show: "never" },
    ]) {
      expect(() => normalizeTouchControls(value)).toThrow(TypeError);
    }
  });
});

describe("combined touch and keyboard input", () => {
  test("multiple fingers and the physical keyboard share key ownership and transition hooks", () => {
    const transitions: Array<[string, unknown, boolean]> = [];
    const input = new InputDispatcher({
      on_key_down(key) {
        transitions.push(["down", key, input.keyboard.space as boolean]);
      },
      on_key_up(key) {
        transitions.push(["up", key, input.keyboard.space as boolean]);
      },
    });
    const fingerOne = {};
    const fingerTwo = {};
    input.handleVirtualKeyDown(keys.SPACE, fingerOne);
    input.handleVirtualKeyDown(keys.SPACE, fingerOne);
    input.handleVirtualKeyDown(keys.SPACE, fingerTwo);
    input.handleKeyDown({ code: "Space", key: " " });
    input.handleVirtualKeyUp(fingerOne);
    input.handleKeyUp({ code: "Space", key: " " });
    expect(input.keyboard.space).toBe(true);
    expect(transitions).toEqual([["down", keys.SPACE, true]]);
    input.handleVirtualKeyUp(fingerTwo);
    input.handleVirtualKeyUp(fingerTwo);
    expect(transitions).toEqual([
      ["down", keys.SPACE, true],
      ["up", keys.SPACE, false],
    ]);

    input.handleKeyDown({ code: "Space", key: " " });
    input.handleVirtualKeyDown(keys.SPACE, fingerOne);
    input.handleVirtualKeyUp(fingerOne);
    expect(input.keyboard.space).toBe(true);
    input.handleKeyDown({ code: "Space", key: " ", repeat: true });
    input.handleKeyUp({ code: "Space", key: " " });
    expect(input.keyboard.space).toBe(false);
    expect(transitions.slice(2)).toEqual([
      ["down", keys.SPACE, true],
      ["down", keys.SPACE, true],
      ["up", keys.SPACE, false],
    ]);
  });

  test("focus loss clears ownership so the next touch can press again", () => {
    const input = new InputDispatcher();
    const source = {};
    input.handleVirtualKeyDown(keys.RIGHT, source);
    input.handleKeyDown({ code: "KeyA", key: "a" });
    input.handleFocusLoss();
    expect(input.keyboard.pressed()).toEqual([]);
    input.handleVirtualKeyUp(source);
    input.handleVirtualKeyDown(keys.RIGHT, source);
    expect(input.keyboard.right).toBe(true);
    input.handleVirtualKeyUp(source);
    expect(input.keyboard.pressed()).toEqual([]);
    expect(() => input.handleVirtualKeyDown(999_999, source)).toThrow(
      TypeError,
    );
  });
});
