import { describe, expect, test } from "bun:test";
import {
  InputDispatcher,
  buttonsFromBrowserButtons,
  dispatchHook,
  getParameterNames,
  keymods,
  keys,
  mapBrowserKeyEvent,
  mapBrowserMouseButton,
  mapBrowserMouseEvent,
  mouse,
} from "@js-game-zero/core";

describe("hook dispatch", () => {
  test("calls hooks by parameter name or event object", () => {
    const calls: unknown[][] = [];
    function on_mouse_down(button: unknown, pos: unknown) {
      calls.push([button, pos]);
    }
    dispatchHook(on_mouse_down, { pos: [1, 2], button: mouse.LEFT });
    dispatchHook((event) => calls.push([event]), { key: keys.A });
    expect(calls).toEqual([[mouse.LEFT, [1, 2]], [{ key: keys.A }]]);
  });

  test("extracts parameter names from function and arrow forms", () => {
    expect(
      getParameterNames(function on_key_down(
        key: unknown,
        mod: unknown,
        unicode: unknown,
      ) {}),
    ).toEqual(["key", "mod", "unicode"]);
    expect(
      getParameterNames((pos: unknown, rel: unknown, buttons: unknown) => [
        pos,
        rel,
        buttons,
      ]),
    ).toEqual(["pos", "rel", "buttons"]);
    expect(getParameterNames((event: unknown) => event)).toEqual(["event"]);
  });
});

describe("browser event mapping", () => {
  test("maps key down/up data including unicode and modifier flags", () => {
    expect(
      mapBrowserKeyEvent({ code: "KeyA", key: "a", shiftKey: true }),
    ).toEqual({
      key: keys.A,
      mod: keymods.SHIFT,
      unicode: "a",
      repeat: false,
    });
    expect(
      mapBrowserKeyEvent({
        code: "ShiftLeft",
        key: "Shift",
        shiftKey: true,
        getModifierState: (name) => name === "CapsLock",
      })?.mod,
    ).toBe(keymods.SHIFT | keymods.LSHIFT | keymods.CAPS);
    expect(
      mapBrowserKeyEvent({ code: "Unidentified", key: "Unidentified" }),
    ).toBeNull();
  });

  test("maps mouse buttons, pressed sets, positions, and relative movement", () => {
    expect(mapBrowserMouseButton(0)).toBe(mouse.LEFT);
    expect(mapBrowserMouseButton(2)).toBe(mouse.RIGHT);
    expect([...buttonsFromBrowserButtons(1 | 2 | 4)].sort()).toEqual([
      mouse.LEFT,
      mouse.MIDDLE,
      mouse.RIGHT,
    ]);
    const target = { getBoundingClientRect: () => ({ left: 10, top: 20 }) };
    expect(
      mapBrowserMouseEvent(
        { clientX: 15, clientY: 25, button: 0, buttons: 1 },
        target,
        [1, 2],
      ),
    ).toEqual({
      pos: [5, 5],
      button: mouse.LEFT,
      buttons: new Set([mouse.LEFT]),
      rel: [4, 3],
    });
    expect(
      mapBrowserMouseEvent({
        clientX: 15,
        clientY: 25,
        movementX: 7,
        movementY: -3,
        buttons: 0,
      }).rel,
    ).toEqual([7, -3]);
  });
});

describe("InputDispatcher", () => {
  test("updates keyboard before hooks and supports camelCase import-mode aliases", () => {
    const events: unknown[] = [];
    const dispatcher = new InputDispatcher({
      onKeyDown(key: unknown, mod: unknown, unicode: unknown) {
        events.push({
          type: "down",
          key,
          mod,
          unicode,
          a: dispatcher.keyboard.a,
        });
      },
      onKeyUp(key: unknown, mod: unknown) {
        events.push({ type: "up", key, mod, a: dispatcher.keyboard.a });
      },
      onMouseDown(pos: unknown, button: unknown) {
        events.push({ type: "mouseDown", pos, button });
      },
      onMouseMove(pos: unknown, rel: unknown, buttons: unknown) {
        events.push({
          type: "mouseMove",
          pos,
          rel,
          buttons: [...(buttons as Set<number>)],
        });
      },
    });

    expect(dispatcher.handleKeyDown({ code: "KeyA", key: "a" })).toBe(true);
    expect(dispatcher.handleKeyUp({ code: "KeyA", key: "a" })).toBe(true);
    expect(
      dispatcher.handleKeyDown({ code: "AudioVolumeUp", key: "AudioVolumeUp" }),
    ).toBe(false);
    dispatcher.handleMouseDown({
      clientX: 10,
      clientY: 20,
      button: 0,
      buttons: 1,
    });
    dispatcher.handleMouseMove({ clientX: 13, clientY: 25, buttons: 1 });

    expect(events).toEqual([
      { type: "down", key: keys.A, mod: 0, unicode: "a", a: true },
      { type: "up", key: keys.A, mod: 0, a: false },
      { type: "mouseDown", pos: [10, 20], button: mouse.LEFT },
      { type: "mouseMove", pos: [13, 25], rel: [3, 5], buttons: [mouse.LEFT] },
    ]);
  });
});
