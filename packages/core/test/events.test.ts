import { describe, expect, test } from "bun:test";
import { keymods, keys, mouse } from "@js-game-zero/core";
import {
  InputDispatcher,
  buttonsFromBrowserButtons,
  dispatchHook,
  getParameterNames,
  mapBrowserKeyEvent,
  mapBrowserMouseButton,
  mapBrowserMouseEvent,
  mapBrowserWheelEvent,
} from "@js-game-zero/core/host";
import { createLiveMouse, MouseState } from "../src/input";

// The `BoundsTarget` type that `attach()`'s first parameter is intersected
// with is not exported from events.ts, so derive the parameter type
// structurally instead of importing it directly.
type AttachMouseTarget = Parameters<InputDispatcher["attach"]>[0];

/**
 * A minimal EventTarget-like test double used to verify `attach()` wires up
 * (and `detach()` tears down) DOM listeners, without depending on any
 * particular DOM implementation being globally available.
 */
function createFakeEventTarget() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const addCalls: string[] = [];
  const removeCalls: string[] = [];
  const target = {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) {
      addCalls.push(type);
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(listener as (event: unknown) => void);
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) {
      removeCalls.push(type);
      listeners.get(type)?.delete(listener as (event: unknown) => void);
    },
    dispatch(type: string, event: unknown) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
  return { target, addCalls, removeCalls };
}

describe("hook dispatch", () => {
  test("calls hooks by parameter name or event object", () => {
    const calls: unknown[][] = [];
    function onMouseDown(button: unknown, pos: unknown) {
      calls.push([button, pos]);
    }
    dispatchHook(onMouseDown, { pos: [1, 2], button: mouse.LEFT });
    dispatchHook((event) => calls.push([event]), { key: keys.A });
    expect(calls).toEqual([[mouse.LEFT, [1, 2]], [{ key: keys.A }]]);
  });

  test("unfamiliar parameter names receive values by their place in the list", () => {
    const calls: unknown[][] = [];
    const order = ["pos", "button", "buttons", "rel"];
    const args = { pos: [1, 2], button: mouse.LEFT, buttons: new Set() };
    dispatchHook((position: unknown) => calls.push([position]), args, order);
    dispatchHook((p: unknown, b: unknown) => calls.push([p, b]), args, order);
    // Known names keep their value wherever they sit; others take the rest.
    dispatchHook(
      (button: unknown, where: unknown) => calls.push([button, where]),
      args,
      order,
    );
    expect(calls).toEqual([
      [[1, 2]],
      [[1, 2], mouse.LEFT],
      [mouse.LEFT, [1, 2]],
    ]);
  });

  test("InputDispatcher hands a positional parameter the documented value", () => {
    const received: unknown[] = [];
    const dispatcher = new InputDispatcher({
      onKeyDown(k: unknown) {
        received.push(k);
      },
      onMouseMove(where: unknown, moved: unknown) {
        received.push(where, moved);
      },
    });
    dispatcher.handleKeyDown({ code: "Space", key: " " });
    dispatcher.handleMouseMove({
      clientX: 5,
      clientY: 6,
      movementX: 1,
      movementY: 2,
    });
    expect(received).toEqual([keys.SPACE, [5, 6], [1, 2]]);
  });

  test("extracts parameter names from function and arrow forms", () => {
    expect(
      getParameterNames(function onKeyDown(
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

  test("nested arrows in function and method hooks preserve the outer parameters", () => {
    const received: unknown[] = [];
    function onMouseDown(pos: unknown) {
      received.push([pos].find((value) => value !== undefined));
    }
    const hooks = {
      onMouseMove(pos: unknown, rel: unknown) {
        [pos, rel].forEach((value) => received.push(value));
      },
    };
    expect(getParameterNames(onMouseDown)).toEqual(["pos"]);
    expect(getParameterNames(hooks.onMouseMove)).toEqual(["pos", "rel"]);
    dispatchHook(onMouseDown, { pos: [12, 34] });
    dispatchHook(hooks.onMouseMove, { pos: [20, 40], rel: [8, 6] });
    expect(received).toEqual([
      [12, 34],
      [20, 40],
      [8, 6],
    ]);
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

  test("maps positions into game coordinates when the canvas is CSS-scaled", () => {
    // An 800x600 game displayed at 400x300 (half size): clicking the
    // displayed center must report the game's center, and movement deltas
    // must scale the same way.
    const target = {
      width: 800,
      height: 600,
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 400,
        height: 300,
      }),
    };
    expect(
      mapBrowserMouseEvent(
        { clientX: 210, clientY: 170, button: 0, buttons: 1 },
        target,
      ),
    ).toMatchObject({ pos: [400, 300] });
    expect(
      mapBrowserMouseEvent(
        { clientX: 210, clientY: 170, movementX: 5, movementY: -2, buttons: 0 },
        target,
      ).rel,
    ).toEqual([10, -4]);
    expect(
      mapBrowserWheelEvent({ clientX: 210, clientY: 170, deltaY: 100 }, target)
        ?.pos,
    ).toEqual([400, 300]);
    // A zero-sized display rect (hidden canvas) must not divide by zero.
    expect(
      mapBrowserMouseEvent(
        { clientX: 15, clientY: 25 },
        {
          width: 800,
          height: 600,
          getBoundingClientRect: () => ({
            left: 10,
            top: 20,
            width: 0,
            height: 0,
          }),
        },
      ).pos,
    ).toEqual([5, 5]);
  });

  test("DOM back/forward buttons (3/4) are not reported as wheel input", () => {
    // Real wheel input arrives through the separate `wheel` DOM event, not
    // through button indices 3/4 on mousedown/mouseup -- those are the
    // browser's back/forward buttons.
    expect(mapBrowserMouseButton(3)).toBeNull();
    expect(mapBrowserMouseButton(4)).toBeNull();
    expect(mapBrowserMouseButton(undefined)).toBeNull();
  });

  test("maps wheel events to mouse.WHEEL_UP/WHEEL_DOWN at the pointer position", () => {
    const target = { getBoundingClientRect: () => ({ left: 10, top: 20 }) };
    expect(
      mapBrowserWheelEvent({ clientX: 30, clientY: 50, deltaY: -100 }, target),
    ).toEqual({
      pos: [20, 30],
      button: mouse.WHEEL_UP,
      buttons: new Set(),
      rel: [0, 0],
    });
    expect(
      mapBrowserWheelEvent({ clientX: 30, clientY: 50, deltaY: 100 }, target),
    ).toMatchObject({ button: mouse.WHEEL_DOWN });
    expect(
      mapBrowserWheelEvent({ clientX: 30, clientY: 50, deltaY: 0 }, target),
    ).toBeNull();
    expect(
      mapBrowserWheelEvent({
        clientX: 30,
        clientY: 50,
        deltaY: -1,
        buttons: 1,
      })?.buttons,
    ).toEqual(new Set([mouse.LEFT]));
  });
});

describe("live mouse state", () => {
  test("follows the pointer and the held buttons", () => {
    const state = new MouseState();
    const live = createLiveMouse(state, () => [160, 90]);
    const dispatcher = new InputDispatcher({}, undefined, state);
    expect(live.pos).toEqual([160, 90]);
    expect(live.LEFT).toBe(mouse.LEFT);

    dispatcher.handleMouseMove({ clientX: 30, clientY: 40, buttons: 0 });
    expect(live.pos).toEqual([30, 40]);
    expect([live.x, live.y]).toEqual([30, 40]);
    expect(live.buttons.size).toBe(0);

    dispatcher.handleMouseDown({
      clientX: 31,
      clientY: 41,
      button: 0,
      buttons: 1,
    });
    expect(live.buttons.has(mouse.LEFT)).toBe(true);
    dispatcher.handleMouseUp({
      clientX: 31,
      clientY: 41,
      button: 0,
      buttons: 0,
    });
    expect(live.buttons.has(mouse.LEFT)).toBe(false);

    dispatcher.handleMouseDown({
      clientX: 31,
      clientY: 41,
      button: 2,
      buttons: 2,
    });
    dispatcher.handleFocusLoss();
    expect(live.buttons.size).toBe(0);
    expect(live.pos).toEqual([31, 41]);
  });

  test("hands out copies, so changing them can't move the mouse", () => {
    const state = new MouseState();
    const live = createLiveMouse(state, () => [0, 0]);
    live.pos[0] = 99;
    live.buttons.add(mouse.LEFT);
    expect(live.pos).toEqual([0, 0]);
    expect(live.buttons.size).toBe(0);
  });
});

describe("InputDispatcher", () => {
  test("updates keyboard before calling the input hooks", () => {
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

  test("handleWheel dispatches onMouseDown with WHEEL_UP/WHEEL_DOWN and ignores zero-delta scroll", () => {
    const events: unknown[] = [];
    const dispatcher = new InputDispatcher({
      onMouseDown(pos: unknown, button: unknown) {
        events.push({ pos, button });
      },
    });

    expect(
      dispatcher.handleWheel({ clientX: 5, clientY: 5, deltaY: -50 }),
    ).toBe(true);
    expect(dispatcher.handleWheel({ clientX: 5, clientY: 5, deltaY: 50 })).toBe(
      true,
    );
    expect(dispatcher.handleWheel({ clientX: 5, clientY: 5, deltaY: 0 })).toBe(
      false,
    );

    expect(events).toEqual([
      { pos: [5, 5], button: mouse.WHEEL_UP },
      { pos: [5, 5], button: mouse.WHEEL_DOWN },
    ]);
  });

  test("handleMouseUp dispatches onMouseUp with pos/button and tracks lastMousePos", () => {
    const events: unknown[] = [];
    const dispatcher = new InputDispatcher({
      onMouseUp(pos: unknown, button: unknown) {
        events.push({ pos, button });
      },
    });
    const target = { getBoundingClientRect: () => ({ left: 10, top: 20 }) };

    expect(
      dispatcher.handleMouseUp(
        { clientX: 15, clientY: 25, button: 0, buttons: 0 },
        target,
      ),
    ).toBe(true);
    expect(events).toEqual([{ pos: [5, 5], button: mouse.LEFT }]);
  });

  test("handleMouseUp returns false and skips the hook for an unresolvable button", () => {
    const events: unknown[] = [];
    const dispatcher = new InputDispatcher({
      onMouseUp(pos: unknown, button: unknown) {
        events.push({ pos, button });
      },
    });

    expect(
      dispatcher.handleMouseUp({ clientX: 1, clientY: 1, button: 3 }),
    ).toBe(false);
    expect(events).toEqual([]);
  });

  test("attach() wires up mouse/keyboard/wheel DOM listeners and detach() removes them", () => {
    const { target, addCalls, removeCalls } = createFakeEventTarget();
    const downEvents: unknown[] = [];
    const dispatcher = new InputDispatcher({
      onMouseDown(pos: unknown, button: unknown) {
        downEvents.push({ pos, button });
      },
    });

    const detach = dispatcher.attach(target as unknown as AttachMouseTarget);

    expect(addCalls.sort()).toEqual(
      [
        "blur",
        "keydown",
        "keyup",
        "mousedown",
        "mouseup",
        "mousemove",
        "visibilitychange",
        "wheel",
      ].sort(),
    );

    target.dispatch("mousedown", {
      clientX: 1,
      clientY: 2,
      button: 0,
      buttons: 1,
    });
    expect(downEvents).toEqual([{ pos: [1, 2], button: mouse.LEFT }]);

    detach();

    expect(removeCalls.sort()).toEqual(addCalls.sort());

    downEvents.length = 0;
    target.dispatch("mousedown", {
      clientX: 1,
      clientY: 2,
      button: 0,
      buttons: 1,
    });
    expect(downEvents).toEqual([]);
  });

  test("attach clears held keys on blur and when the page becomes hidden", () => {
    const { target } = createFakeEventTarget();
    const dispatcher = new InputDispatcher();
    const detach = dispatcher.attach(target as unknown as AttachMouseTarget);
    try {
      target.dispatch("keydown", { code: "KeyA", key: "a" });
      expect(dispatcher.keyboard.a).toBe(true);
      target.dispatch("blur", {});
      expect(dispatcher.keyboard.a).toBe(false);

      target.dispatch("keydown", { code: "KeyA", key: "a" });
      expect(dispatcher.keyboard.a).toBe(true);
      target.dispatch("visibilitychange", {});
      expect(dispatcher.keyboard.a).toBe(false);
    } finally {
      detach();
    }
  });

  test("attach captures mouse release on the keyboard/window target after a drag leaves the canvas", () => {
    const canvas = createFakeEventTarget();
    const browserWindow = createFakeEventTarget();
    const events: unknown[] = [];
    const dispatcher = new InputDispatcher({
      onMouseUp(pos: unknown, button: unknown) {
        events.push({ pos, button });
      },
    });

    const detach = dispatcher.attach(
      canvas.target as unknown as AttachMouseTarget,
      browserWindow.target as unknown as EventTarget,
    );
    try {
      expect(canvas.addCalls).not.toContain("mouseup");
      expect(browserWindow.addCalls).toContain("mouseup");
      canvas.target.dispatch("mousedown", {
        clientX: 4,
        clientY: 5,
        button: 0,
        buttons: 1,
      });
      browserWindow.target.dispatch("mouseup", {
        clientX: 40,
        clientY: 50,
        button: 0,
        buttons: 0,
      });
      expect(events).toEqual([{ pos: [40, 50], button: mouse.LEFT }]);
    } finally {
      detach();
    }
  });

  test("drag-release sequence: mousedown -> mousemove -> mouseup produces a coherent event sequence", () => {
    const events: unknown[] = [];
    const dispatcher = new InputDispatcher({
      onMouseDown(pos: unknown, button: unknown) {
        events.push({ type: "down", pos, button });
      },
      onMouseMove(pos: unknown, rel: unknown, buttons: unknown) {
        events.push({
          type: "move",
          pos,
          rel,
          buttons: [...(buttons as Set<number>)],
        });
      },
      onMouseUp(pos: unknown, button: unknown, buttons: unknown) {
        events.push({
          type: "up",
          pos,
          button,
          buttons: [...(buttons as Set<number>)],
        });
      },
    });

    expect(
      dispatcher.handleMouseDown({
        clientX: 10,
        clientY: 10,
        button: 0,
        buttons: 1,
      }),
    ).toBe(true);
    expect(
      dispatcher.handleMouseMove({ clientX: 15, clientY: 12, buttons: 1 }),
    ).toBe(true);
    expect(
      dispatcher.handleMouseUp({
        clientX: 15,
        clientY: 12,
        button: 0,
        buttons: 0,
      }),
    ).toBe(true);

    expect(events).toEqual([
      { type: "down", pos: [10, 10], button: mouse.LEFT },
      { type: "move", pos: [15, 12], rel: [5, 2], buttons: [mouse.LEFT] },
      { type: "up", pos: [15, 12], button: mouse.LEFT, buttons: [] },
    ]);
  });

  test("resolves .code-absent .key fallbacks for named keys, lowercase letters, and punctuation", () => {
    const events: unknown[] = [];
    const dispatcher = new InputDispatcher({
      onKeyDown(key: unknown) {
        events.push(key);
      },
    });

    expect(dispatcher.handleKeyDown({ key: "ArrowLeft" })).toBe(true);
    expect(dispatcher.handleKeyDown({ key: "a" })).toBe(true);
    expect(dispatcher.handleKeyDown({ key: "!" })).toBe(true);

    expect(events).toEqual([keys.LEFT, keys.A, keys.EXCLAIM]);
  });
});
