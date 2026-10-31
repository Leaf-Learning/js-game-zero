import { createActiveServiceProxy } from "./active-service";
import { closestName } from "./util";

const baseKeys = {
  BACKSPACE: 8,
  TAB: 9,
  CLEAR: 12,
  RETURN: 13,
  PAUSE: 19,
  ESCAPE: 27,
  SPACE: 32,
  EXCLAIM: 33,
  QUOTEDBL: 34,
  HASH: 35,
  DOLLAR: 36,
  AMPERSAND: 38,
  QUOTE: 39,
  LEFTPAREN: 40,
  RIGHTPAREN: 41,
  ASTERISK: 42,
  PLUS: 43,
  COMMA: 44,
  MINUS: 45,
  PERIOD: 46,
  SLASH: 47,
  K_0: 48,
  K_1: 49,
  K_2: 50,
  K_3: 51,
  K_4: 52,
  K_5: 53,
  K_6: 54,
  K_7: 55,
  K_8: 56,
  K_9: 57,
  COLON: 58,
  SEMICOLON: 59,
  LESS: 60,
  EQUALS: 61,
  GREATER: 62,
  QUESTION: 63,
  AT: 64,
  LEFTBRACKET: 91,
  BACKSLASH: 92,
  RIGHTBRACKET: 93,
  CARET: 94,
  UNDERSCORE: 95,
  BACKQUOTE: 96,
  A: 97,
  B: 98,
  C: 99,
  D: 100,
  E: 101,
  F: 102,
  G: 103,
  H: 104,
  I: 105,
  J: 106,
  K: 107,
  L: 108,
  M: 109,
  N: 110,
  O: 111,
  P: 112,
  Q: 113,
  R: 114,
  S: 115,
  T: 116,
  U: 117,
  V: 118,
  W: 119,
  X: 120,
  Y: 121,
  Z: 122,
  DELETE: 127,
  KP0: 1073741922,
  KP1: 1073741913,
  KP2: 1073741914,
  KP3: 1073741915,
  KP4: 1073741916,
  KP5: 1073741917,
  KP6: 1073741918,
  KP7: 1073741919,
  KP8: 1073741920,
  KP9: 1073741921,
  KP_PERIOD: 1073741923,
  KP_DIVIDE: 1073741908,
  KP_MULTIPLY: 1073741909,
  KP_MINUS: 1073741910,
  KP_PLUS: 1073741911,
  KP_ENTER: 1073741912,
  KP_EQUALS: 1073741927,
  UP: 1073741906,
  DOWN: 1073741905,
  RIGHT: 1073741903,
  LEFT: 1073741904,
  INSERT: 1073741897,
  HOME: 1073741898,
  END: 1073741901,
  PAGEUP: 1073741899,
  PAGEDOWN: 1073741902,
  F1: 1073741882,
  F2: 1073741883,
  F3: 1073741884,
  F4: 1073741885,
  F5: 1073741886,
  F6: 1073741887,
  F7: 1073741888,
  F8: 1073741889,
  F9: 1073741890,
  F10: 1073741891,
  F11: 1073741892,
  F12: 1073741893,
  F13: 1073741928,
  F14: 1073741929,
  F15: 1073741930,
  NUMLOCK: 1073741907,
  CAPSLOCK: 1073741881,
  SCROLLOCK: 1073741895,
  RSHIFT: 1073742053,
  LSHIFT: 1073742049,
  RCTRL: 1073742052,
  LCTRL: 1073742048,
  RALT: 1073742054,
  LALT: 1073742050,
  RMETA: 1073742055,
  LMETA: 1073742051,
  LSUPER: 1073742051,
  RSUPER: 1073742055,
  MODE: 1073742081,
  HELP: 1073741941,
  PRINT: 1073741894,
  SYSREQ: 1073741978,
  BREAK: 1073741896,
  MENU: 1073741942,
  POWER: 1073741926,
  EURO: 1073742004,
  LAST: 1073742106,
} as const;

export const keys = Object.freeze({
  ...baseKeys,
  ENTER: baseKeys.RETURN,
});

export const keymods = Object.freeze({
  NONE: 0x0000,
  LSHIFT: 0x0001,
  RSHIFT: 0x0002,
  SHIFT: 0x0003,
  LCTRL: 0x0040,
  RCTRL: 0x0080,
  CTRL: 0x00c0,
  LALT: 0x0100,
  RALT: 0x0200,
  ALT: 0x0300,
  LMETA: 0x0400,
  RMETA: 0x0800,
  META: 0x0c00,
  NUM: 0x1000,
  CAPS: 0x2000,
  MODE: 0x4000,
});

export const mouse = Object.freeze({
  LEFT: 1,
  MIDDLE: 2,
  RIGHT: 3,
  WHEEL_UP: 4,
  WHEEL_DOWN: 5,
});

/** Where the mouse (or a touch) last was over the canvas, and what's held. */
export class MouseState {
  pos: readonly [number, number] | null = null;
  buttons: ReadonlySet<number> = new Set();

  clearButtons(): void {
    this.buttons = new Set();
  }
}

/**
 * The `mouse` a game sees: the button constants, plus where the mouse is now
 * and which buttons are held, for code in `update()` that follows or aims at
 * the mouse. Before the mouse first moves over the game, `pos` is the center
 * of the screen. `down` is true while any button or a finger is down, for
 * code that acts as long as the learner holds on.
 */
export type LiveMouse = typeof mouse & {
  readonly pos: [number, number];
  readonly x: number;
  readonly y: number;
  readonly buttons: Set<number>;
  readonly down: boolean;
};

export function createLiveMouse(
  state: MouseState,
  center: () => readonly [number, number],
): LiveMouse {
  const current = () => state.pos ?? center();
  const live = { ...mouse };
  Object.defineProperties(live, {
    pos: {
      get: () => [current()[0], current()[1]],
      enumerable: true,
      configurable: true,
    },
    x: { get: () => current()[0], enumerable: true, configurable: true },
    y: { get: () => current()[1], enumerable: true, configurable: true },
    buttons: {
      get: () => new Set(state.buttons),
      enumerable: true,
      configurable: true,
    },
    down: {
      get: () => state.buttons.size > 0,
      enumerable: true,
      configurable: true,
    },
  });
  return live as LiveMouse;
}

const keyValues = new Set<number>(Object.values(keys));
const keyCodesByAttribute = new Map<string, number>();
for (const [name, value] of Object.entries(keys)) {
  keyCodesByAttribute.set(keyAttributeName(name), value);
}
keyCodesByAttribute.set("enter", keys.RETURN);
keyCodesByAttribute.set("return", keys.RETURN);

// Property names that JS runtimes/tooling probe on arbitrary objects (thenable
// checks, JSON serialization, console/util inspection, ...). These must never
// throw, even though they aren't real pgzero key names, or the keyboard
// object becomes unusable outside of direct key lookups.
const safeUnknownKeyboardProperties = new Set<string>([
  "then",
  "toJSON",
  "constructor",
  "valueOf",
  "toString",
  "inspect",
  "asymmetricMatch",
]);

function isSafeUnknownKeyboardProperty(property: string): boolean {
  return (
    safeUnknownKeyboardProperties.has(property) || property in Object.prototype
  );
}

export class KeyboardState {
  [key: string]: unknown;
  [key: number]: unknown;

  readonly _pressed = new Set<number>();

  constructor() {
    return new Proxy(this, {
      get(target, property, receiver) {
        if (typeof property !== "string")
          return Reflect.get(target, property, receiver);
        if (property in target) {
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        }
        if (/^\d+$/.test(property)) {
          const key = Number(property);
          return isKeyConstant(key) ? target.isPressed(key) : false;
        }
        const key = keyCodesByAttribute.get(property.toLowerCase());
        if (key !== undefined) return target.isPressed(key);
        if (isSafeUnknownKeyboardProperty(property)) return undefined;
        // A misspelled key names the one it's closest to, in the words the
        // other misspelled names use, so the sandbox can offer the fix.
        const meant = closestName(
          property.toLowerCase(),
          keyCodesByAttribute.keys(),
        );
        if (meant !== undefined) {
          throw new Error(
            `keyboard.${property} doesn't exist. Did you mean keyboard.${meant}?`,
          );
        }
        // Matches pgzero's Keyboard.__getattr__, which raises
        // AttributeError('The key "%s" does not exist') for unknown
        // attributes (see pgzero/keyboard.py).
        throw new Error(`The key "${property}" does not exist`);
      },
      has(target, property) {
        return (
          property in target ||
          (typeof property === "string" &&
            keyCodesByAttribute.has(property.toLowerCase()))
        );
      },
    });
  }

  press(key: number): void {
    assertKeyConstant(key);
    this._pressed.add(key);
  }

  release(key: number): void {
    assertKeyConstant(key);
    this._pressed.delete(key);
  }

  clear(): void {
    this._pressed.clear();
  }

  isPressed(key: number): boolean {
    assertKeyConstant(key);
    return this._pressed.has(key);
  }

  pressed(): number[] {
    return [...this._pressed].sort((a, b) => a - b);
  }
}

const defaultKeyboard = new KeyboardState();
let activeKeyboard: KeyboardState | null = null;

export function setActiveKeyboard(
  nextKeyboard: KeyboardState | null,
): KeyboardState | null {
  const previous = activeKeyboard;
  activeKeyboard = nextKeyboard;
  return previous;
}

export function getActiveKeyboard(): KeyboardState {
  return activeKeyboard ?? defaultKeyboard;
}

export const keyboard = createActiveServiceProxy(getActiveKeyboard);

export function isKeyConstant(value: unknown): value is number {
  return typeof value === "number" && keyValues.has(value);
}

export function assertKeyConstant(value: unknown): asserts value is number {
  if (!isKeyConstant(value)) {
    throw new TypeError(`Invalid key constant: ${String(value)}`);
  }
}

export function keyAttributeName(name: string): string {
  if (name.startsWith("K_")) return `k_${name.slice(2).toLowerCase()}`;
  if (/^KP\d$/.test(name)) return name.toLowerCase();
  return name.toLowerCase();
}
