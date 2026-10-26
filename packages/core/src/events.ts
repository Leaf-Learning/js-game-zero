import { type Point } from "./geometry";
import {
  assertKeyConstant,
  KeyboardState,
  keymods,
  keys,
  mouse,
  MouseState,
} from "./input";

type HookArgs = Record<string, unknown>;
/**
 * A hook a game defines. Its arguments are matched by parameter name, in
 * whatever order the game declares them (see the hooks reference), so their
 * types can't be given by position: `onKeyDown(key: number, mod: number)`
 * and `onKeyDown(mod: number)` both fit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Hook = (...args: any[]) => void;

export type InputHooks = {
  onMouseDown?: Hook;
  onMouseUp?: Hook;
  onMouseMove?: Hook;
  onKeyDown?: Hook;
  onKeyUp?: Hook;
  onMusicEnd?: Hook;
};

export type BrowserKeyboardLike = {
  code?: string;
  key?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  getModifierState?: (key: string) => boolean;
};

export type BrowserMouseLike = {
  clientX: number;
  clientY: number;
  button?: number;
  buttons?: number;
  movementX?: number;
  movementY?: number;
};

export type BrowserWheelLike = {
  clientX: number;
  clientY: number;
  deltaY: number;
  buttons?: number;
};

type TargetBounds = {
  left: number;
  top: number;
  width?: number;
  height?: number;
};

type BoundsTarget = {
  /**
   * Logical screen size (the game's WIDTH/HEIGHT; the runtime passes its
   * screen's, since pixel density multiplies `canvas.width`). When the
   * canvas is displayed at a different CSS size (e.g. the sandbox preview
   * scales it to fit its pane), positions are mapped back into game
   * coordinates so `pos` always matches what the game draws with.
   */
  width?: number;
  height?: number;
  ownerDocument?: EventTarget & {
    readonly hidden?: boolean;
    readonly visibilityState?: string;
  };
  getBoundingClientRect?: () => TargetBounds;
};

export type MappedKeyboardEvent = {
  key: number;
  mod: number;
  unicode: string;
  repeat: boolean;
};

export type MappedMouseEvent = {
  pos: Point;
  button: number | null;
  buttons: Set<number>;
  rel: Point;
};

/** Every input hook a game can define, besides `draw` and `update`. */
export const INPUT_HOOK_NAMES = [
  "onMouseDown",
  "onMouseUp",
  "onMouseMove",
  "onKeyDown",
  "onKeyUp",
  "onMusicEnd",
] as const;

export type InputHookName = (typeof INPUT_HOOK_NAMES)[number];

/**
 * The values each input hook can receive, in the order an ordinary
 * (positional) reading of its parameter list hands them out.
 */
export const HOOK_PARAMETERS: Readonly<
  Record<InputHookName, readonly string[]>
> = {
  onMouseDown: ["pos", "button", "buttons", "rel"],
  onMouseUp: ["pos", "button", "buttons", "rel"],
  onMouseMove: ["pos", "rel", "buttons", "button"],
  onKeyDown: ["key", "mod", "unicode", "repeat"],
  onKeyUp: ["key", "mod", "unicode", "repeat"],
  onMusicEnd: [],
};

const browserCodeToKey = new Map<string, number>([
  ["Backspace", keys.BACKSPACE],
  ["Tab", keys.TAB],
  ["Clear", keys.CLEAR],
  ["Enter", keys.RETURN],
  ["NumpadEnter", keys.KP_ENTER],
  ["Pause", keys.PAUSE],
  ["Escape", keys.ESCAPE],
  ["Space", keys.SPACE],
  ["Delete", keys.DELETE],
  ["NumpadDecimal", keys.KP_PERIOD],
  ["NumpadDivide", keys.KP_DIVIDE],
  ["NumpadMultiply", keys.KP_MULTIPLY],
  ["NumpadSubtract", keys.KP_MINUS],
  ["NumpadAdd", keys.KP_PLUS],
  ["NumpadEqual", keys.KP_EQUALS],
  ["ArrowUp", keys.UP],
  ["ArrowDown", keys.DOWN],
  ["ArrowRight", keys.RIGHT],
  ["ArrowLeft", keys.LEFT],
  ["Insert", keys.INSERT],
  ["Home", keys.HOME],
  ["End", keys.END],
  ["PageUp", keys.PAGEUP],
  ["PageDown", keys.PAGEDOWN],
  ["NumLock", keys.NUMLOCK],
  ["CapsLock", keys.CAPSLOCK],
  ["ScrollLock", keys.SCROLLOCK],
  ["ShiftRight", keys.RSHIFT],
  ["ShiftLeft", keys.LSHIFT],
  ["ControlRight", keys.RCTRL],
  ["ControlLeft", keys.LCTRL],
  ["AltRight", keys.RALT],
  ["AltLeft", keys.LALT],
  ["MetaRight", keys.RMETA],
  ["MetaLeft", keys.LMETA],
  ["ContextMenu", keys.MENU],
  ["PrintScreen", keys.PRINT],
  ["Minus", keys.MINUS],
  ["Equal", keys.EQUALS],
  ["BracketLeft", keys.LEFTBRACKET],
  ["BracketRight", keys.RIGHTBRACKET],
  ["Backslash", keys.BACKSLASH],
  ["Semicolon", keys.SEMICOLON],
  ["Quote", keys.QUOTE],
  ["Backquote", keys.BACKQUOTE],
  ["Comma", keys.COMMA],
  ["Period", keys.PERIOD],
  ["Slash", keys.SLASH],
]);

for (let index = 0; index <= 9; index += 1) {
  browserCodeToKey.set(
    `Digit${index}`,
    keys[`K_${index}` as keyof typeof keys],
  );
  browserCodeToKey.set(
    `Numpad${index}`,
    keys[`KP${index}` as keyof typeof keys],
  );
}

for (let index = 1; index <= 15; index += 1) {
  browserCodeToKey.set(`F${index}`, keys[`F${index}` as keyof typeof keys]);
}

for (let code = "A".charCodeAt(0); code <= "Z".charCodeAt(0); code += 1) {
  const letter = String.fromCharCode(code);
  browserCodeToKey.set(`Key${letter}`, keys[letter as keyof typeof keys]);
}

/**
 * Calls `handler` with the values from `args` its parameters ask for. A
 * parameter named like a value (`pos`, `key`, `mod`, ...) receives that
 * value wherever it sits in the list, Pygame Zero style. Any other name
 * receives the next value in `order` not already claimed by name, the way an
 * ordinary JavaScript function would — so `onKeyDown(k)` still gets the
 * key. A lone `event` parameter receives the whole `args` object.
 */
export function dispatchHook(
  handler: Hook | undefined,
  args: HookArgs,
  order: readonly string[] = Object.keys(args),
): void {
  if (!handler) return;
  if (takesWholeEvent(handler)) {
    handler(args);
    return;
  }
  const names = resolveHookParameters(getParameterNames(handler), order);
  handler(
    ...names.map((name) => (name === undefined ? undefined : args[name])),
  );
}

// Hooks that take the whole event object whatever their parameter is called:
// defineGame's, whose parameter a minifier renames in an app's bundle.
const wholeEventHooks = new WeakSet<Function>();

/** Marks `handler` to receive the whole event object, as `event` would. */
export function markWholeEventHook<T extends Function>(handler: T): T {
  wholeEventHooks.add(handler);
  return handler;
}

/** Whether `handler` receives the whole event object: it was marked, or its
 * one parameter is called `event`. */
export function takesWholeEvent(handler: Function): boolean {
  if (wholeEventHooks.has(handler)) return true;
  const parameters = getParameterNames(handler);
  return parameters.length === 1 && parameters[0] === "event";
}

/**
 * Which value each declared parameter receives: its own name when that is a
 * known value, otherwise the next known value not claimed by name.
 */
export function resolveHookParameters(
  declared: readonly string[],
  known: readonly string[],
): (string | undefined)[] {
  const claimed = new Set(declared.filter((name) => known.includes(name)));
  const unclaimed = known.filter((name) => !claimed.has(name));
  return declared.map((name) =>
    known.includes(name) ? name : unclaimed.shift(),
  );
}

export function getParameterNames(callback: Function): string[] {
  const source = Function.prototype.toString
    .call(callback)
    .replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  // Only an arrow at the start describes this callback. An arrow nested
  // inside a normal hook's body (e.g. buttons.find(button => ...)) must not
  // replace that hook's own parameter list.
  const arrow = /^(?:async\s+)?(?:\(([^)]*)\)|([\w$]+))\s*=>/.exec(
    source.trim(),
  );
  if (arrow) return splitParameterList(arrow[1] ?? arrow[2] ?? "");
  const match = /^[^(]*\(([^)]*)\)/.exec(source);
  return match ? splitParameterList(match[1] ?? "") : [];
}

export function mapBrowserKeyEvent(
  event: BrowserKeyboardLike,
): MappedKeyboardEvent | null {
  const key = keyFromBrowserEvent(event);
  if (key === null) return null;
  return {
    key,
    mod: modifiersFromKeyboardEvent(event),
    unicode: unicodeFromKeyboardEvent(event),
    repeat: event.repeat === true,
  };
}

export function mapBrowserMouseEvent(
  event: BrowserMouseLike,
  target?: BoundsTarget,
  previousPos?: Point | null,
): MappedMouseEvent {
  const scale = displayToLogicalScale(target);
  const pos = pointFromMouseEvent(event, target, scale);
  return {
    pos,
    button: mapBrowserMouseButton(event.button),
    buttons: buttonsFromBrowserButtons(event.buttons ?? 0),
    rel: relativeMotion(event, pos, previousPos, scale),
  };
}

export function mapBrowserMouseButton(
  button: number | undefined,
): number | null {
  if (button === 0) return mouse.LEFT;
  if (button === 1) return mouse.MIDDLE;
  if (button === 2) return mouse.RIGHT;
  // DOM buttons 3/4 are the browser back/forward buttons, not the scroll
  // wheel. pygame/pgzero only recognize LEFT/MIDDLE/RIGHT/WHEEL_UP/
  // WHEEL_DOWN as mouse buttons, so back/forward are intentionally
  // unmapped rather than misreported as wheel input.
  return null;
}

/**
 * Maps a native `wheel` DOM event to a mouse-down-shaped event, matching
 * pygame's convention of reporting scroll wheel motion as button 4 (up) /
 * button 5 (down) presses (see pgzero.constants.mouse.WHEEL_UP/WHEEL_DOWN).
 *
 * Returns null for a zero (or missing) deltaY, since that carries no
 * wheel-button semantics.
 */
export function mapBrowserWheelEvent(
  event: BrowserWheelLike,
  target?: BoundsTarget,
): MappedMouseEvent | null {
  if (!(event.deltaY < 0) && !(event.deltaY > 0)) return null;
  const button = event.deltaY < 0 ? mouse.WHEEL_UP : mouse.WHEEL_DOWN;
  return {
    pos: pointFromMouseEvent(event, target, displayToLogicalScale(target)),
    button,
    buttons: buttonsFromBrowserButtons(event.buttons ?? 0),
    rel: [0, 0],
  };
}

export function buttonsFromBrowserButtons(buttons: number): Set<number> {
  const pressed = new Set<number>();
  if ((buttons & 1) !== 0) pressed.add(mouse.LEFT);
  if ((buttons & 2) !== 0) pressed.add(mouse.RIGHT);
  if ((buttons & 4) !== 0) pressed.add(mouse.MIDDLE);
  return pressed;
}

export class InputDispatcher {
  readonly keyboard: KeyboardState;
  readonly mouseState: MouseState;
  hooks: InputHooks;
  private lastMousePos: Point | null = null;
  private readonly physicalKeys = new Set<number>();
  private readonly virtualKeys = new Map<unknown, number>();

  constructor(
    hooks: InputHooks = {},
    keyboard = new KeyboardState(),
    mouseState = new MouseState(),
  ) {
    this.hooks = hooks;
    this.keyboard = keyboard;
    this.mouseState = mouseState;
  }

  handleKeyDown(event: BrowserKeyboardLike): boolean {
    const browserMapped = mapBrowserKeyEvent(event);
    if (!browserMapped) return false;
    this.physicalKeys.add(browserMapped.key);
    const mapped = withHeldSides(browserMapped, this.physicalKeys);
    this.keyboard.press(mapped.key);
    if (![...this.virtualKeys.values()].includes(mapped.key) || mapped.repeat) {
      dispatchHook(this.hooks.onKeyDown, mapped, HOOK_PARAMETERS.onKeyDown);
    }
    return true;
  }

  handleKeyUp(event: BrowserKeyboardLike): boolean {
    const browserMapped = mapBrowserKeyEvent(event);
    if (!browserMapped) return false;
    this.physicalKeys.delete(browserMapped.key);
    const mapped = withHeldSides(browserMapped, this.physicalKeys);
    if ([...this.virtualKeys.values()].includes(mapped.key)) return true;
    this.keyboard.release(mapped.key);
    dispatchHook(this.hooks.onKeyUp, mapped, HOOK_PARAMETERS.onKeyUp);
    return true;
  }

  handleFocusLoss(): void {
    this.physicalKeys.clear();
    this.virtualKeys.clear();
    this.keyboard.clear();
    this.mouseState.clearButtons();
  }

  /** Each pointer owns its press, so releasing one input cannot release another. */
  handleVirtualKeyDown(key: number, source: unknown): void {
    assertKeyConstant(key);
    if (this.virtualKeys.has(source)) return;
    this.virtualKeys.set(source, key);
    const held = this.keyboard.isPressed(key);
    this.keyboard.press(key);
    if (!held) {
      dispatchHook(
        this.hooks.onKeyDown,
        { key, mod: keymods.NONE, unicode: "", repeat: false },
        HOOK_PARAMETERS.onKeyDown,
      );
    }
  }

  handleVirtualKeyUp(source: unknown): void {
    const key = this.virtualKeys.get(source);
    if (key === undefined) return;
    this.virtualKeys.delete(source);
    if (
      this.physicalKeys.has(key) ||
      [...this.virtualKeys.values()].includes(key)
    ) {
      return;
    }
    this.keyboard.release(key);
    dispatchHook(
      this.hooks.onKeyUp,
      { key, mod: keymods.NONE, unicode: "", repeat: false },
      HOOK_PARAMETERS.onKeyUp,
    );
  }

  handleMouseDown(event: BrowserMouseLike, target?: BoundsTarget): boolean {
    const mapped = mapBrowserMouseEvent(event, target, this.lastMousePos);
    this.trackMouse(mapped);
    if (mapped.button === null) return false;
    dispatchHook(this.hooks.onMouseDown, mapped, HOOK_PARAMETERS.onMouseDown);
    return true;
  }

  handleMouseUp(event: BrowserMouseLike, target?: BoundsTarget): boolean {
    const mapped = mapBrowserMouseEvent(event, target, this.lastMousePos);
    this.trackMouse(mapped);
    if (mapped.button === null) return false;
    dispatchHook(this.hooks.onMouseUp, mapped, HOOK_PARAMETERS.onMouseUp);
    return true;
  }

  handleMouseMove(event: BrowserMouseLike, target?: BoundsTarget): boolean {
    const browserMapped = mapBrowserMouseEvent(
      event,
      target,
      this.lastMousePos,
    );
    // A move's own button field is always 0, which reads as LEFT; the
    // button that matters while moving is one being held, if any.
    const mapped = {
      ...browserMapped,
      button: [...browserMapped.buttons][0] ?? null,
    };
    this.trackMouse(mapped);
    dispatchHook(this.hooks.onMouseMove, mapped, HOOK_PARAMETERS.onMouseMove);
    return true;
  }

  /**
   * Handles a native `wheel` event. pygame/pgzero report scroll wheel
   * motion through the same channel as mouse button presses (button 4/5),
   * so this dispatches `onMouseDown` just like handleMouseDown.
   */
  handleWheel(event: BrowserWheelLike, target?: BoundsTarget): boolean {
    const mapped = mapBrowserWheelEvent(event, target);
    if (!mapped) return false;
    this.lastMousePos = mapped.pos;
    this.mouseState.pos = mapped.pos;
    dispatchHook(this.hooks.onMouseDown, mapped, HOOK_PARAMETERS.onMouseDown);
    return true;
  }

  private trackMouse(mapped: MappedMouseEvent): void {
    this.lastMousePos = mapped.pos;
    this.mouseState.pos = mapped.pos;
    this.mouseState.buttons = new Set(mapped.buttons);
  }

  attach(
    mouseTarget: EventTarget & BoundsTarget,
    keyboardTarget: EventTarget = mouseTarget,
  ): () => void {
    const keyDown = (event: Event) =>
      this.handleKeyDown(event as KeyboardEvent);
    const keyUp = (event: Event) => this.handleKeyUp(event as KeyboardEvent);
    const mouseDown = (event: Event) =>
      this.handleMouseDown(event as MouseEvent, mouseTarget);
    const mouseUp = (event: Event) =>
      this.handleMouseUp(event as MouseEvent, mouseTarget);
    const mouseMove = (event: Event) =>
      this.handleMouseMove(event as MouseEvent, mouseTarget);
    const wheel = (event: Event) =>
      this.handleWheel(event as WheelEvent, mouseTarget);
    const focusLoss = () => this.handleFocusLoss();
    const visibilityTarget =
      mouseTarget.ownerDocument ??
      (typeof document === "undefined" ? keyboardTarget : document);
    const visibilityChange = () => {
      const target = visibilityTarget as EventTarget & {
        readonly hidden?: boolean;
        readonly visibilityState?: string;
      };
      if (target.hidden === false || target.visibilityState === "visible") {
        return;
      }
      this.handleFocusLoss();
    };
    // Mouseup bubbles to the keyboard/window target, which also catches a
    // release after a drag leaves the canvas. Avoid registering on both
    // targets so an in-canvas release is dispatched exactly once.
    const mouseReleaseTarget =
      keyboardTarget === mouseTarget ? mouseTarget : keyboardTarget;

    keyboardTarget.addEventListener("keydown", keyDown);
    keyboardTarget.addEventListener("keyup", keyUp);
    keyboardTarget.addEventListener("blur", focusLoss);
    visibilityTarget.addEventListener("visibilitychange", visibilityChange);
    mouseTarget.addEventListener("mousedown", mouseDown);
    mouseReleaseTarget.addEventListener("mouseup", mouseUp);
    mouseTarget.addEventListener("mousemove", mouseMove);
    mouseTarget.addEventListener("wheel", wheel, { passive: true });

    return () => {
      keyboardTarget.removeEventListener("keydown", keyDown);
      keyboardTarget.removeEventListener("keyup", keyUp);
      keyboardTarget.removeEventListener("blur", focusLoss);
      visibilityTarget.removeEventListener(
        "visibilitychange",
        visibilityChange,
      );
      mouseTarget.removeEventListener("mousedown", mouseDown);
      mouseReleaseTarget.removeEventListener("mouseup", mouseUp);
      mouseTarget.removeEventListener("mousemove", mouseMove);
      mouseTarget.removeEventListener("wheel", wheel);
    };
  }
}

export function createInputDispatcher(
  hooks: InputHooks = {},
  keyboard = new KeyboardState(),
  mouseState = new MouseState(),
): InputDispatcher {
  return new InputDispatcher(hooks, keyboard, mouseState);
}

function keyFromBrowserEvent(event: BrowserKeyboardLike): number | null {
  if (event.code && browserCodeToKey.has(event.code)) {
    return browserCodeToKey.get(event.code) ?? null;
  }
  const key = event.key;
  if (!key) return null;
  if (key.length === 1) {
    const code = key.toLowerCase().charCodeAt(0);
    if (code >= 97 && code <= 122) return code;
    if (code >= 48 && code <= 57) return code;
    const punctuation = punctuationKey(key);
    if (punctuation !== null) return punctuation;
  }
  return namedKey(key);
}

function namedKey(key: string): number | null {
  switch (key) {
    case "ArrowUp":
      return keys.UP;
    case "ArrowDown":
      return keys.DOWN;
    case "ArrowRight":
      return keys.RIGHT;
    case "ArrowLeft":
      return keys.LEFT;
    case "Enter":
      return keys.RETURN;
    case "Escape":
      return keys.ESCAPE;
    case " ":
    case "Spacebar":
      return keys.SPACE;
    case "Backspace":
      return keys.BACKSPACE;
    case "Tab":
      return keys.TAB;
    case "Delete":
      return keys.DELETE;
    default:
      return null;
  }
}

function punctuationKey(value: string): number | null {
  const code = value.charCodeAt(0);
  if (
    (code >= 33 && code <= 47) ||
    (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96)
  ) {
    return code;
  }
  return null;
}

function unicodeFromKeyboardEvent(event: BrowserKeyboardLike): string {
  return event.key && event.key.length === 1 ? event.key : "";
}

/** Each modifier's two sides: [both, left key, left bit, right key, right bit]. */
const modifierSides = [
  [keymods.SHIFT, keys.LSHIFT, keymods.LSHIFT, keys.RSHIFT, keymods.RSHIFT],
  [keymods.CTRL, keys.LCTRL, keymods.LCTRL, keys.RCTRL, keymods.RCTRL],
  [keymods.ALT, keys.LALT, keymods.LALT, keys.RALT, keymods.RALT],
  [keymods.META, keys.LMETA, keymods.LMETA, keys.RMETA, keymods.RMETA],
] as const;

/**
 * A browser event says a Shift is down, not which one, so the event's `mod`
 * has both Shift bits. The keys held say which: `mod & keymods.LSHIFT` is
 * then only true for the left one. With neither side seen pressed (it was
 * held before the page had focus), both bits stay.
 */
function withHeldSides(
  mapped: MappedKeyboardEvent,
  held: ReadonlySet<number>,
): MappedKeyboardEvent {
  let mod = mapped.mod;
  for (const [both, leftKey, left, rightKey, right] of modifierSides) {
    if ((mod & both) !== both) continue;
    const sides =
      (held.has(leftKey) ? left : 0) | (held.has(rightKey) ? right : 0);
    if (sides !== 0) mod = (mod & ~both) | sides;
  }
  return mod === mapped.mod ? mapped : { ...mapped, mod };
}

function modifiersFromKeyboardEvent(event: BrowserKeyboardLike): number {
  let mod = 0;
  if (event.shiftKey) mod |= keymods.SHIFT;
  if (event.ctrlKey) mod |= keymods.CTRL;
  if (event.altKey) mod |= keymods.ALT;
  if (event.metaKey) mod |= keymods.META;
  if (event.code === "ShiftLeft") mod |= keymods.LSHIFT;
  if (event.code === "ShiftRight") mod |= keymods.RSHIFT;
  if (event.code === "ControlLeft") mod |= keymods.LCTRL;
  if (event.code === "ControlRight") mod |= keymods.RCTRL;
  if (event.code === "AltLeft") mod |= keymods.LALT;
  if (event.code === "AltRight") mod |= keymods.RALT;
  if (event.code === "MetaLeft") mod |= keymods.LMETA;
  if (event.code === "MetaRight") mod |= keymods.RMETA;
  if (event.getModifierState?.("CapsLock")) mod |= keymods.CAPS;
  if (event.getModifierState?.("NumLock")) mod |= keymods.NUM;
  if (event.getModifierState?.("AltGraph")) mod |= keymods.MODE;
  return mod;
}

/**
 * Per-axis CSS-pixel -> game-coordinate factors. 1 when the displayed size
 * matches the logical size, or when either size is unknown (targets that
 * report no size keep the historical unscaled behavior).
 */
function displayToLogicalScale(target?: BoundsTarget): Point {
  const rect = target?.getBoundingClientRect?.();
  return [
    axisScale(target?.width, rect?.width),
    axisScale(target?.height, rect?.height),
  ];
}

function axisScale(logical: number | undefined, displayed: number | undefined) {
  if (typeof logical !== "number" || !Number.isFinite(logical) || logical <= 0)
    return 1;
  if (
    typeof displayed !== "number" ||
    !Number.isFinite(displayed) ||
    displayed <= 0
  )
    return 1;
  return logical / displayed;
}

function pointFromMouseEvent(
  event: BrowserMouseLike,
  target: BoundsTarget | undefined,
  scale: Point,
): Point {
  const rect = target?.getBoundingClientRect?.();
  const left = rect?.left ?? 0;
  const top = rect?.top ?? 0;
  return [(event.clientX - left) * scale[0], (event.clientY - top) * scale[1]];
}

function relativeMotion(
  event: BrowserMouseLike,
  pos: Point,
  previousPos: Point | null | undefined,
  scale: Point,
): Point {
  if (
    typeof event.movementX === "number" &&
    typeof event.movementY === "number"
  ) {
    return [event.movementX * scale[0], event.movementY * scale[1]];
  }
  if (previousPos) return [pos[0] - previousPos[0], pos[1] - previousPos[1]];
  return [0, 0];
}

function splitParameterList(parameters: string): string[] {
  return parameters
    .split(",")
    .map(cleanParameter)
    .filter((parameter) => parameter.length > 0);
}

function cleanParameter(parameter: string): string {
  return parameter
    .trim()
    .replace(/=.*$/, "")
    .replace(/^\.{3}/, "")
    .trim();
}
