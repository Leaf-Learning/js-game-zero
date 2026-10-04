import type { InputDispatcher } from "./events";
import { isKeyConstant, keys } from "./input";

export type TouchButton =
  "up" | "down" | "left" | "right" | "a" | "b" | "start" | "select";
export type TouchControlsOptions = Partial<Record<TouchButton, number>> & {
  /** Auto shows controls on devices with touch input; always also shows them on desktop. */
  readonly show?: "auto" | "always";
};
export type TouchControlsConfig = boolean | TouchControlsOptions;

const defaults = {
  up: keys.UP,
  down: keys.DOWN,
  left: keys.LEFT,
  right: keys.RIGHT,
  a: keys.SPACE,
  b: keys.X,
  start: keys.RETURN,
  select: keys.ESCAPE,
} as const;
const labels: Record<TouchButton, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  a: "A",
  b: "B",
  start: "Start",
  select: "Select",
};
export type TouchControlsSettings = {
  readonly show: "auto" | "always";
  readonly buttons: ReadonlyArray<readonly [TouchButton, number]>;
};

export function normalizeTouchControls(
  value: unknown,
): TouchControlsSettings | null {
  if (value === undefined || value === false) return null;
  const config = value === true ? defaults : value;
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new TypeError(
      "TOUCH_CONTROLS must be true, false, or a button mapping object.",
    );
  }
  const mapping = config as Record<string, unknown>;
  for (const name of Object.keys(mapping)) {
    if (name !== "show" && !Object.hasOwn(defaults, name)) {
      throw new TypeError(`Unknown TOUCH_CONTROLS button: ${name}`);
    }
  }
  const show = mapping.show ?? "auto";
  if (show !== "auto" && show !== "always") {
    throw new TypeError('TOUCH_CONTROLS.show must be "auto" or "always".');
  }
  const buttons: Array<readonly [TouchButton, number]> = [];
  for (const name of Object.keys(defaults) as TouchButton[]) {
    if (!Object.hasOwn(mapping, name)) continue;
    const key = mapping[name];
    if (!isKeyConstant(key)) {
      throw new TypeError(`TOUCH_CONTROLS.${name} must be a keys constant.`);
    }
    buttons.push([name, key]);
  }
  return { show, buttons };
}

const controlStyles = `
[data-jgz-touch-surface] { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 16px; width: 100%; min-width: 0; min-height: 0; flex-shrink: 0; }
[data-jgz-touch-surface] > canvas { flex-shrink: 0; }
[data-jgz-touch-controls] { box-sizing: border-box; width: 100%; max-width: 680px; flex-shrink: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); grid-template-areas: "dpad system actions"; align-items: center; gap: 12px 8px; padding: 8px max(8px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); user-select: none; -webkit-user-select: none; }
[data-jgz-touch-controls][hidden] { display: none; }
[data-jgz-touch-controls] .jgz-dpad { grid-area: dpad; justify-self: start; display: grid; grid-template: repeat(3, var(--jgz-button-size)) / repeat(3, var(--jgz-button-size)); gap: 3px; }
[data-jgz-touch-controls] { --jgz-button-size: clamp(40px, 10vw, 52px); }
[data-jgz-touch-controls] .jgz-actions { grid-area: actions; justify-self: end; display: grid; grid-template: repeat(3, calc(var(--jgz-button-size) / 2)) / repeat(2, var(--jgz-button-size)); column-gap: 8px; }
[data-jgz-touch-controls] .jgz-system { grid-area: system; justify-self: center; display: flex; flex-direction: column; gap: 8px; }
[data-jgz-touch-controls] button { box-sizing: border-box; min-width: var(--jgz-button-size); height: var(--jgz-button-size); padding: 0 8px; border: 2px solid #718096; border-radius: 12px; color: #fff; background: #263244; font: bold 16px system-ui, sans-serif; touch-action: none; -webkit-tap-highlight-color: transparent; cursor: pointer; }
[data-jgz-touch-controls] button[aria-pressed="true"] { background: #4267a0; border-color: #b9d5ff; }
[data-jgz-touch-controls] button:focus-visible { outline: 3px solid #facc15; outline-offset: 2px; }
[data-jgz-touch-controls] [data-jgz-touch-button="up"] { grid-area: 1 / 2; }
[data-jgz-touch-controls] [data-jgz-touch-button="left"] { grid-area: 2 / 1; }
[data-jgz-touch-controls] [data-jgz-touch-button="right"] { grid-area: 2 / 3; }
[data-jgz-touch-controls] [data-jgz-touch-button="down"] { grid-area: 3 / 2; }
[data-jgz-touch-controls] .jgz-actions button { border-radius: 50%; }
[data-jgz-touch-controls] [data-jgz-touch-button="a"] { grid-area: 1 / 2 / span 2; }
[data-jgz-touch-controls] [data-jgz-touch-button="b"] { grid-area: 2 / 1 / span 2; }
[data-jgz-touch-controls] .jgz-actions.jgz-single { grid-template: var(--jgz-button-size) / var(--jgz-button-size); }
[data-jgz-touch-controls] .jgz-actions.jgz-single button { grid-area: 1 / 1; }
[data-jgz-touch-controls] .jgz-system button { height: 40px; font-size: 13px; }
@media (orientation: portrait) {
  [data-jgz-touch-surface] { gap: 24px; }
  [data-jgz-touch-controls] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "dpad actions"; }
  [data-jgz-touch-controls].jgz-has-system { grid-template-areas: "dpad actions" "system system"; }
  [data-jgz-touch-controls] .jgz-system { flex-direction: row; }
}
`;

/** Mount a responsive control dock at the bottom of the game's available space. */
export function mountTouchControls(
  canvas: HTMLCanvasElement,
  settings: TouchControlsSettings | null,
  dispatcher: InputDispatcher,
  invoke: (callback: () => void) => void,
): { reset(): void; detach(): void } {
  const noop = { reset() {}, detach() {} };
  const parent = canvas.parentElement;
  if (!settings || !settings.buttons.length || !parent) return noop;
  const doc = canvas.ownerDocument;
  const view = doc.defaultView;
  if (!view) return noop;
  const surface = doc.createElement("div");
  surface.dataset.jgzTouchSurface = "";
  const root = doc.createElement("div");
  root.dataset.jgzTouchControls = "";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Game touch controls");
  const style = doc.createElement("style");
  style.textContent = controlStyles;
  root.append(style);
  const dpad = doc.createElement("div");
  dpad.className = "jgz-dpad";
  const system = doc.createElement("div");
  system.className = "jgz-system";
  const actions = doc.createElement("div");
  actions.className = "jgz-actions";
  root.append(dpad, system, actions);
  const held = new Map<
    number,
    { button: HTMLButtonElement; capture: HTMLButtonElement; source: object }
  >();
  const bindings = new Map<HTMLButtonElement, number>();
  const keyboardSources = new Map<HTMLButtonElement, object>();
  const cleanups: Array<() => void> = [];
  const listen = (
    target: EventTarget,
    type: string,
    callback: EventListener,
  ): void => {
    target.addEventListener(type, callback);
    cleanups.push(() => target.removeEventListener(type, callback));
  };
  const updateButton = (button: HTMLButtonElement): void => {
    button.setAttribute(
      "aria-pressed",
      String(
        keyboardSources.has(button) ||
          [...held.values()].some((press) => press.button === button),
      ),
    );
  };
  const release = (id: number): void => {
    const press = held.get(id);
    if (!press) return;
    held.delete(id);
    updateButton(press.button);
    if (press.capture.hasPointerCapture(id))
      press.capture.releasePointerCapture(id);
    invoke(() => dispatcher.handleVirtualKeyUp(press.source));
  };
  for (const [name, key] of settings.buttons) {
    const button = doc.createElement("button");
    bindings.set(button, key);
    button.type = "button";
    button.dataset.jgzTouchButton = name;
    button.textContent = labels[name];
    button.setAttribute(
      "aria-label",
      name.length > 1
        ? name[0]!.toUpperCase() + name.slice(1)
        : name.toUpperCase(),
    );
    button.setAttribute("aria-pressed", "false");
    const group = ["up", "down", "left", "right"].includes(name)
      ? dpad
      : ["start", "select"].includes(name)
        ? system
        : actions;
    group.append(button);
    listen(button, "pointerdown", (raw) => {
      const event = raw as PointerEvent;
      if (event.button !== 0 || held.has(event.pointerId)) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      button.setPointerCapture(event.pointerId);
      const source = {};
      held.set(event.pointerId, { button, capture: button, source });
      updateButton(button);
      invoke(() => dispatcher.handleVirtualKeyDown(key, source));
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      listen(button, type, (event) =>
        release((event as PointerEvent).pointerId),
      );
    }
    // Native buttons remain usable with Tab, Space, and Enter as well.
    listen(button, "keydown", (raw) => {
      const event = raw as KeyboardEvent;
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      if (keyboardSources.has(button)) return;
      const source = {};
      keyboardSources.set(button, source);
      updateButton(button);
      invoke(() => dispatcher.handleVirtualKeyDown(key, source));
    });
    const releaseKeyboard = (): void => {
      const source = keyboardSources.get(button);
      if (!source) return;
      keyboardSources.delete(button);
      updateButton(button);
      invoke(() => dispatcher.handleVirtualKeyUp(source));
    };
    listen(button, "keyup", (raw) => {
      const event = raw as KeyboardEvent;
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      releaseKeyboard();
    });
    listen(button, "blur", releaseKeyboard);
  }
  // Capture keeps the finger's release reliable while hit testing lets it slide
  // between directions without lifting. Action buttons retain their own press.
  listen(root, "pointermove", (raw) => {
    const event = raw as PointerEvent;
    const press = held.get(event.pointerId);
    if (!press || !dpad.contains(press.button)) return;
    const next = doc.elementFromPoint(
      event.clientX,
      event.clientY,
    ) as HTMLButtonElement | null;
    if (!next || !dpad.contains(next) || next === press.button) return;
    const key = bindings.get(next);
    if (key === undefined) return;
    const previous = press.button;
    press.button = next;
    updateButton(previous);
    updateButton(next);
    invoke(() => {
      dispatcher.handleVirtualKeyUp(press.source);
      if (root.isConnected) dispatcher.handleVirtualKeyDown(key, press.source);
    });
  });
  if (!dpad.children.length) dpad.remove();
  root.classList.toggle("jgz-has-system", system.children.length > 0);
  if (!system.children.length) system.remove();
  actions.classList.toggle("jgz-single", actions.children.length === 1);
  if (!actions.children.length) actions.remove();
  canvas.after(root);
  const initialWidth = canvas.style.width;
  const initialHeight = canvas.style.height;
  let fitted = false;
  const restoreSize = (): void => {
    if (fitted) {
      canvas.style.width = initialWidth;
      canvas.style.height = initialHeight;
      fitted = false;
    }
    if (surface.parentElement) {
      surface.before(canvas, root);
      surface.remove();
    }
  };
  const fit = (): void => {
    if (root.hidden) return;
    if (!surface.parentElement) {
      canvas.before(surface);
      surface.append(canvas, root);
    }
    const parentStyle = view.getComputedStyle(parent);
    const pixels = (value: string): number => parseFloat(value) || 0;
    const siblings = [...parent.children].filter(
      (element) =>
        element !== canvas &&
        element !== root &&
        element !== surface &&
        element.tagName !== "SCRIPT" &&
        element.tagName !== "STYLE" &&
        view.getComputedStyle(element).display !== "none",
    );
    const siblingHeight = siblings.reduce((total, element) => {
      const style = view.getComputedStyle(element);
      return (
        total +
        element.getBoundingClientRect().height +
        pixels(style.marginTop) +
        pixels(style.marginBottom)
      );
    }, 0);
    const canvasStyle = view.getComputedStyle(canvas);
    const horizontalEdges =
      pixels(canvasStyle.borderLeftWidth) +
      pixels(canvasStyle.borderRightWidth) +
      pixels(canvasStyle.paddingLeft) +
      pixels(canvasStyle.paddingRight);
    const verticalEdges =
      pixels(canvasStyle.borderTopWidth) +
      pixels(canvasStyle.borderBottomWidth) +
      pixels(canvasStyle.paddingTop) +
      pixels(canvasStyle.paddingBottom);
    const width =
      Math.min(parent.clientWidth || view.innerWidth, view.innerWidth) -
      pixels(parentStyle.paddingLeft) -
      pixels(parentStyle.paddingRight) -
      horizontalEdges;
    const surfaceHeight = Math.max(
      0,
      Math.min(
        parent === doc.body
          ? view.innerHeight -
              pixels(parentStyle.marginTop) -
              pixels(parentStyle.marginBottom)
          : parent.clientHeight || view.innerHeight,
        view.innerHeight,
      ) -
        siblingHeight -
        pixels(parentStyle.rowGap) * siblings.length -
        pixels(parentStyle.paddingTop) -
        pixels(parentStyle.paddingBottom),
    );
    surface.style.height = `${surfaceHeight}px`;
    const height =
      surfaceHeight -
      root.getBoundingClientRect().height -
      pixels(view.getComputedStyle(surface).rowGap) -
      verticalEdges;
    const scale = Math.max(
      0,
      Math.min(width / (canvas.width || 1), height / (canvas.height || 1)),
    );
    const setScale = (value: number): void => {
      const borderBox = canvasStyle.boxSizing === "border-box";
      canvas.style.width = `${canvas.width * value + (borderBox ? horizontalEdges : 0)}px`;
      canvas.style.height = `${canvas.height * value + (borderBox ? verticalEdges : 0)}px`;
    };
    setScale(scale);
    // A host's max-width/max-height can constrain only one CSS dimension.
    // Fit both dimensions to the resulting content box so portrait screens
    // preserve the logical aspect ratio as well as leaving room for the dock.
    const rect = canvas.getBoundingClientRect();
    const contentWidth = rect.width - horizontalEdges;
    const contentHeight = rect.height - verticalEdges;
    const constrainedScale = Math.max(
      0,
      Math.min(
        scale,
        contentWidth / (canvas.width || 1),
        contentHeight / (canvas.height || 1),
      ),
    );
    if (constrainedScale < scale) {
      setScale(constrainedScale);
    }
    fitted = true;
  };
  const reset = (): void => {
    const presses = [...held.entries()];
    held.clear();
    keyboardSources.clear();
    for (const [id, press] of presses) {
      if (press.capture.hasPointerCapture(id))
        press.capture.releasePointerCapture(id);
      updateButton(press.button);
    }
    for (const button of root.querySelectorAll("button")) updateButton(button);
  };
  const media = view.matchMedia("(any-pointer: coarse)");
  const updateVisibility = (): void => {
    const wasVisible = !root.hidden;
    root.hidden =
      settings.show !== "always" &&
      !media.matches &&
      view.navigator.maxTouchPoints === 0;
    if (root.hidden && wasVisible) {
      reset();
      dispatcher.handleFocusLoss();
      restoreSize();
    } else fit();
  };
  listen(media, "change", updateVisibility);
  listen(view, "resize", fit);
  const observer = new ResizeObserver(fit);
  observer.observe(root);
  observer.observe(parent);
  observer.observe(canvas);
  const dimensions = new MutationObserver(fit);
  dimensions.observe(canvas, {
    attributes: true,
    attributeFilter: ["width", "height"],
  });
  updateVisibility();
  return {
    reset,
    detach() {
      reset();
      observer.disconnect();
      dimensions.disconnect();
      for (const cleanup of cleanups) cleanup();
      restoreSize();
      root.remove();
    },
  };
}
