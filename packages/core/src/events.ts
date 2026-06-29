import { type Point } from "./geometry";
import { KeyboardState, keymods, keys, mouse } from "./input";

export type HookArgs = Record<string, unknown>;
export type Hook = (...args: unknown[]) => void;

export type InputHooks = {
  on_mouse_down?: Hook;
  onMouseDown?: Hook;
  on_mouse_up?: Hook;
  onMouseUp?: Hook;
  on_mouse_move?: Hook;
  onMouseMove?: Hook;
  on_key_down?: Hook;
  onKeyDown?: Hook;
  on_key_up?: Hook;
  onKeyUp?: Hook;
  on_music_end?: Hook;
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

type BoundsTarget = {
  getBoundingClientRect?: () => {
    left: number;
    top: number;
  };
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

const hookNames = {
  on_mouse_down: ["on_mouse_down", "onMouseDown"],
  on_mouse_up: ["on_mouse_up", "onMouseUp"],
  on_mouse_move: ["on_mouse_move", "onMouseMove"],
  on_key_down: ["on_key_down", "onKeyDown"],
  on_key_up: ["on_key_up", "onKeyUp"],
  on_music_end: ["on_music_end", "onMusicEnd"],
} as const;

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

export function dispatchHook(handler: Hook | undefined, args: HookArgs): void {
  if (!handler) return;
  const parameters = getParameterNames(handler);
  if (parameters.length === 1 && parameters[0] === "event") {
    handler(args);
    return;
  }
  handler(...parameters.map((name) => args[name]));
}

export function getHook(
  hooks: InputHooks,
  name: keyof typeof hookNames,
): Hook | undefined {
  const [snakeName, camelName] = hookNames[name];
  return hooks[snakeName] ?? hooks[camelName];
}

export function getParameterNames(callback: Function): string[] {
  const source = Function.prototype.toString
    .call(callback)
    .replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const arrowIndex = source.indexOf("=>");
  if (arrowIndex !== -1) {
    const left = source
      .slice(0, arrowIndex)
      .trim()
      .replace(/^async\s+/, "");
    if (left.startsWith("("))
      return splitParameterList(left.slice(1, left.lastIndexOf(")")));
    return left ? [cleanParameter(left)] : [];
  }
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
  const pos = pointFromMouseEvent(event, target);
  return {
    pos,
    button: mapBrowserMouseButton(event.button),
    buttons: buttonsFromBrowserButtons(event.buttons ?? 0),
    rel: relativeMotion(event, pos, previousPos),
  };
}

export function mapBrowserMouseButton(
  button: number | undefined,
): number | null {
  if (button === 0) return mouse.LEFT;
  if (button === 1) return mouse.MIDDLE;
  if (button === 2) return mouse.RIGHT;
  if (button === 3) return mouse.WHEEL_UP;
  if (button === 4) return mouse.WHEEL_DOWN;
  return null;
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
  hooks: InputHooks;
  private lastMousePos: Point | null = null;

  constructor(hooks: InputHooks = {}, keyboard = new KeyboardState()) {
    this.hooks = hooks;
    this.keyboard = keyboard;
  }

  handleKeyDown(event: BrowserKeyboardLike): boolean {
    const mapped = mapBrowserKeyEvent(event);
    if (!mapped) return false;
    this.keyboard.press(mapped.key);
    dispatchHook(getHook(this.hooks, "on_key_down"), mapped);
    return true;
  }

  handleKeyUp(event: BrowserKeyboardLike): boolean {
    const mapped = mapBrowserKeyEvent(event);
    if (!mapped) return false;
    this.keyboard.release(mapped.key);
    dispatchHook(getHook(this.hooks, "on_key_up"), mapped);
    return true;
  }

  handleMouseDown(event: BrowserMouseLike, target?: BoundsTarget): boolean {
    const mapped = mapBrowserMouseEvent(event, target, this.lastMousePos);
    this.lastMousePos = mapped.pos;
    if (mapped.button === null) return false;
    dispatchHook(getHook(this.hooks, "on_mouse_down"), mapped);
    return true;
  }

  handleMouseUp(event: BrowserMouseLike, target?: BoundsTarget): boolean {
    const mapped = mapBrowserMouseEvent(event, target, this.lastMousePos);
    this.lastMousePos = mapped.pos;
    if (mapped.button === null) return false;
    dispatchHook(getHook(this.hooks, "on_mouse_up"), mapped);
    return true;
  }

  handleMouseMove(event: BrowserMouseLike, target?: BoundsTarget): boolean {
    const mapped = mapBrowserMouseEvent(event, target, this.lastMousePos);
    this.lastMousePos = mapped.pos;
    dispatchHook(getHook(this.hooks, "on_mouse_move"), mapped);
    return true;
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

    keyboardTarget.addEventListener("keydown", keyDown);
    keyboardTarget.addEventListener("keyup", keyUp);
    mouseTarget.addEventListener("mousedown", mouseDown);
    mouseTarget.addEventListener("mouseup", mouseUp);
    mouseTarget.addEventListener("mousemove", mouseMove);

    return () => {
      keyboardTarget.removeEventListener("keydown", keyDown);
      keyboardTarget.removeEventListener("keyup", keyUp);
      mouseTarget.removeEventListener("mousedown", mouseDown);
      mouseTarget.removeEventListener("mouseup", mouseUp);
      mouseTarget.removeEventListener("mousemove", mouseMove);
    };
  }
}

export function createInputDispatcher(
  hooks: InputHooks = {},
  keyboard = new KeyboardState(),
): InputDispatcher {
  return new InputDispatcher(hooks, keyboard);
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

function modifiersFromKeyboardEvent(event: BrowserKeyboardLike): number {
  let mod = 0;
  if (event.shiftKey) mod |= keymods.SHIFT;
  if (event.ctrlKey) mod |= keymods.CTRL;
  if (event.altKey) mod |= keymods.ALT;
  if (event.metaKey) mod |= keymods.META;
  if (event.code === "ShiftLeft") mod |= keymods.LSHIFT | keymods.SHIFT;
  if (event.code === "ShiftRight") mod |= keymods.RSHIFT | keymods.SHIFT;
  if (event.code === "ControlLeft") mod |= keymods.LCTRL | keymods.CTRL;
  if (event.code === "ControlRight") mod |= keymods.RCTRL | keymods.CTRL;
  if (event.code === "AltLeft") mod |= keymods.LALT | keymods.ALT;
  if (event.code === "AltRight") mod |= keymods.RALT | keymods.ALT;
  if (event.code === "MetaLeft") mod |= keymods.LMETA | keymods.META;
  if (event.code === "MetaRight") mod |= keymods.RMETA | keymods.META;
  if (event.getModifierState?.("CapsLock")) mod |= keymods.CAPS;
  if (event.getModifierState?.("NumLock")) mod |= keymods.NUM;
  if (event.getModifierState?.("AltGraph")) mod |= keymods.MODE;
  return mod;
}

function pointFromMouseEvent(
  event: BrowserMouseLike,
  target?: BoundsTarget,
): Point {
  const rect = target?.getBoundingClientRect?.();
  const left = rect?.left ?? 0;
  const top = rect?.top ?? 0;
  return [event.clientX - left, event.clientY - top];
}

function relativeMotion(
  event: BrowserMouseLike,
  pos: Point,
  previousPos: Point | null | undefined,
): Point {
  if (
    typeof event.movementX === "number" &&
    typeof event.movementY === "number"
  ) {
    return [event.movementX, event.movementY];
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
