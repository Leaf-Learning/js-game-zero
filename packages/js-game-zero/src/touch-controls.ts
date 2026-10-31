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
const labels: Record<Exclude<TouchButton, Direction>, string> = {
  a: "A",
  b: "B",
  start: "Start",
  select: "Select",
};
type Direction = "up" | "down" | "left" | "right";
const directions: readonly Direction[] = ["up", "down", "left", "right"];
/** Each direction's chevron, drawn in a 24-unit box. */
const arrows: Record<Direction, string> = {
  up: "M6 14.5 12 8.5 18 14.5",
  down: "M6 9.5 12 15.5 18 9.5",
  left: "M14.5 6 8.5 12 14.5 18",
  right: "M9.5 6 15.5 12 9.5 18",
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

// A host page styles the dock with the --jgz-* custom properties (see hooks.md); each
// private --_ property below reads one, with the default look as its fallback.
const controlStyles = `
[data-jgz-touch-surface] { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: var(--jgz-dock-gap, 16px); width: 100%; min-width: 0; min-height: 0; flex-shrink: 0; }
[data-jgz-touch-surface] > canvas { flex-shrink: 0; }
[data-jgz-touch-controls] {
  --_size: var(--jgz-key-size, clamp(40px, 10vw, 52px));
  --_fill: var(--jgz-key-fill, #263244);
  --_ink: var(--jgz-key-ink, #fff);
  --_line: var(--jgz-key-line, #718096);
  --_line-width: var(--jgz-key-line-width, 2px);
  --_pressed: var(--jgz-key-pressed-fill, #4267a0);
  --_pressed-line: var(--jgz-key-pressed-line, #b9d5ff);
  --_dx: var(--jgz-key-shadow-x, 0px);
  --_dy: var(--jgz-key-shadow-y, 0px);
  --_shadow: var(--jgz-key-shadow-color, transparent);
  --_radius: var(--jgz-key-radius, 12px);
  --_dpad-radius: var(--jgz-dpad-radius, 10px);
  --_dot: var(--jgz-dpad-dot, rgba(255, 255, 255, 0.16));
  --_font: var(--jgz-key-font, bold 13px system-ui, sans-serif);
  --_action-font: var(--jgz-action-font, bold 18px system-ui, sans-serif);
  --_action-line-width: var(--jgz-action-line-width, var(--_line-width));
  --_system-height: var(--jgz-system-height, 40px);
  --_system-radius: var(--jgz-system-radius, 12px);
  --_focus: var(--jgz-focus-ring, #facc15);
  box-sizing: border-box; width: 100%; max-width: 680px; flex-shrink: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); grid-template-areas: "dpad system actions"; align-items: center; gap: 12px 8px; padding: 8px max(8px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); user-select: none; -webkit-user-select: none;
}
[data-jgz-touch-controls][hidden] { display: none; }
[data-jgz-touch-controls] button { box-sizing: border-box; display: flex; align-items: center; justify-content: center; min-width: var(--_size); height: var(--_size); margin: 0; padding: 0 8px; border: var(--_line-width) solid var(--_line); border-radius: var(--_radius); color: var(--_ink); background: var(--_fill); box-shadow: var(--_dx) var(--_dy) 0 var(--_shadow); font: var(--_font); touch-action: none; -webkit-tap-highlight-color: transparent; cursor: pointer; transition: transform 60ms ease-out, box-shadow 60ms ease-out, background-color 60ms ease-out; }
[data-jgz-touch-controls] button svg { width: 46%; height: 46%; flex-shrink: 0; pointer-events: none; }
[data-jgz-touch-controls] button[aria-pressed="true"] { background: var(--_pressed); border-color: var(--_pressed-line); transform: translate(var(--_dx), var(--_dy)); box-shadow: 0 0 0 var(--_shadow); }
[data-jgz-touch-controls] button:focus-visible { outline: 3px solid var(--_focus); outline-offset: 2px; }
[data-jgz-touch-controls] .jgz-dpad { grid-area: dpad; justify-self: start; display: grid; }
[data-jgz-touch-controls] .jgz-cross { grid-template: repeat(3, var(--_size)) / repeat(3, var(--_size)); filter: drop-shadow(var(--_dx) var(--_dy) 0 var(--_shadow)); }
[data-jgz-touch-controls] .jgz-cross button { position: relative; z-index: 1; min-width: 0; height: auto; padding: 0; border-radius: 0; box-shadow: none; }
[data-jgz-touch-controls] .jgz-cross button[aria-pressed="true"] { transform: none; box-shadow: none; }
[data-jgz-touch-controls] .jgz-cross [data-jgz-touch-button="up"] { grid-area: 1 / 2; border-bottom: 0; margin-bottom: calc(-1 * var(--_line-width)); border-radius: var(--_dpad-radius) var(--_dpad-radius) 0 0; }
[data-jgz-touch-controls] .jgz-cross [data-jgz-touch-button="down"] { grid-area: 3 / 2; border-top: 0; margin-top: calc(-1 * var(--_line-width)); border-radius: 0 0 var(--_dpad-radius) var(--_dpad-radius); }
[data-jgz-touch-controls] .jgz-cross [data-jgz-touch-button="left"] { grid-area: 2 / 1; border-right: 0; margin-right: calc(-1 * var(--_line-width)); border-radius: var(--_dpad-radius) 0 0 var(--_dpad-radius); }
[data-jgz-touch-controls] .jgz-cross [data-jgz-touch-button="right"] { grid-area: 2 / 3; border-left: 0; margin-left: calc(-1 * var(--_line-width)); border-radius: 0 var(--_dpad-radius) var(--_dpad-radius) 0; }
[data-jgz-touch-controls] .jgz-dpad-center { grid-area: 2 / 2; box-sizing: border-box; border: var(--_line-width) solid var(--_line); background: radial-gradient(circle closest-side, var(--_dot) 0 22%, transparent 24%), var(--_fill); }
[data-jgz-touch-controls] .jgz-cross.jgz-has-up .jgz-dpad-center { border-top: 0; }
[data-jgz-touch-controls] .jgz-cross.jgz-has-down .jgz-dpad-center { border-bottom: 0; }
[data-jgz-touch-controls] .jgz-cross.jgz-has-left .jgz-dpad-center { border-left: 0; }
[data-jgz-touch-controls] .jgz-cross.jgz-has-right .jgz-dpad-center { border-right: 0; }
[data-jgz-touch-controls] .jgz-split { gap: 12px; grid-auto-flow: column; grid-template-rows: var(--_size); }
[data-jgz-touch-controls] .jgz-split button { min-width: calc(var(--_size) * 1.2); }
[data-jgz-touch-controls] .jgz-split.jgz-vertical { grid-auto-flow: row; grid-template-rows: none; }
[data-jgz-touch-controls] .jgz-actions { grid-area: actions; justify-self: end; display: grid; grid-template: repeat(3, calc(var(--_size) / 2)) / repeat(2, var(--_size)); column-gap: 8px; }
[data-jgz-touch-controls] .jgz-actions button { padding: 0; border-width: var(--_action-line-width); border-radius: 50%; font: var(--_action-font); }
[data-jgz-touch-controls] [data-jgz-touch-button="a"] { grid-area: 1 / 2 / span 2; }
[data-jgz-touch-controls] [data-jgz-touch-button="b"] { grid-area: 2 / 1 / span 2; }
[data-jgz-touch-controls] .jgz-actions.jgz-single { grid-template: var(--_size) / var(--_size); }
[data-jgz-touch-controls] .jgz-actions.jgz-single button { grid-area: 1 / 1; }
[data-jgz-touch-controls] .jgz-system { grid-area: system; justify-self: center; display: flex; flex-direction: column; gap: 8px; }
[data-jgz-touch-controls] .jgz-system button { min-width: 0; height: var(--_system-height); padding: 0 14px; border-radius: var(--_system-radius); }
@media (orientation: portrait) {
  [data-jgz-touch-surface] { gap: var(--jgz-dock-gap, 48px); }
  [data-jgz-touch-controls] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "dpad actions"; }
  [data-jgz-touch-controls].jgz-has-system.jgz-has-actions { grid-template-areas: "dpad actions" "system system"; }
  [data-jgz-touch-controls].jgz-has-system.jgz-has-actions .jgz-system { flex-direction: row; }
  [data-jgz-touch-controls].jgz-has-system:not(.jgz-has-actions) { grid-template-areas: "dpad system"; }
  [data-jgz-touch-controls].jgz-has-system:not(.jgz-has-actions) .jgz-system { justify-self: end; }
}
`;

const isDirection = (name: TouchButton): name is Direction =>
  (directions as readonly string[]).includes(name);

/** A direction's chevron, stroked in the key's ink. */
function arrow(doc: Document, direction: Direction): SVGSVGElement {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", arrows[direction]);
  svg.append(path);
  return svg;
}

/**
 * Mount a responsive control dock at the bottom of the game's available
 * space. The canvas is fitted by its logical `screen` size, since density
 * multiplies its pixel size.
 */
export function mountTouchControls(
  canvas: HTMLCanvasElement,
  settings: TouchControlsSettings | null,
  dispatcher: InputDispatcher,
  invoke: (callback: () => void) => void,
  screen: { readonly width: number; readonly height: number } = canvas,
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
    if (isDirection(name)) button.append(arrow(doc, name));
    else button.textContent = labels[name];
    button.setAttribute(
      "aria-label",
      name.length > 1
        ? name[0]!.toUpperCase() + name.slice(1)
        : name.toUpperCase(),
    );
    button.setAttribute("aria-pressed", "false");
    const group = isDirection(name)
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
    const next = doc
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("button") as HTMLButtonElement | null | undefined;
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
  // Three or four directions join into one cross, or two at a corner; an opposite pair or a
  // lone direction stays separate keys.
  const shown = directions.filter((direction) =>
    settings.buttons.some(([name]) => name === direction),
  );
  const opposite =
    shown.length === 2 &&
    (shown.every((d) => d === "up" || d === "down") ||
      shown.every((d) => d === "left" || d === "right"));
  if (shown.length >= 2 && !opposite) {
    dpad.classList.add("jgz-cross");
    for (const direction of shown) dpad.classList.add(`jgz-has-${direction}`);
    const center = doc.createElement("div");
    center.className = "jgz-dpad-center";
    center.setAttribute("aria-hidden", "true");
    dpad.append(center);
  } else if (shown.length) {
    dpad.classList.add("jgz-split");
    if (shown.every((d) => d === "up" || d === "down"))
      dpad.classList.add("jgz-vertical");
  }
  if (!dpad.children.length) dpad.remove();
  root.classList.toggle("jgz-has-system", system.children.length > 0);
  root.classList.toggle("jgz-has-actions", actions.children.length > 0);
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
    // Fit using the minimum gap before adding any space needed to center the
    // portrait screen. Short viewports keep the largest game that fits.
    surface.style.rowGap = "";
    const dockHeight = root.getBoundingClientRect().height;
    const minimumGap = pixels(view.getComputedStyle(surface).rowGap);
    const height = surfaceHeight - dockHeight - minimumGap - verticalEdges;
    const logicalWidth = screen.width || 1;
    const logicalHeight = screen.height || 1;
    const scale = Math.max(
      0,
      Math.min(width / logicalWidth, height / logicalHeight),
    );
    const setScale = (value: number): void => {
      const borderBox = canvasStyle.boxSizing === "border-box";
      canvas.style.width = `${logicalWidth * value + (borderBox ? horizontalEdges : 0)}px`;
      canvas.style.height = `${logicalHeight * value + (borderBox ? verticalEdges : 0)}px`;
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
        contentWidth / logicalWidth,
        contentHeight / logicalHeight,
      ),
    );
    if (constrainedScale < scale) {
      setScale(constrainedScale);
    }
    if (view.matchMedia("(orientation: portrait)").matches) {
      const screenHeight = canvas.getBoundingClientRect().height;
      surface.style.rowGap = `${Math.max(
        minimumGap,
        (surfaceHeight - screenHeight) / 2 - dockHeight,
      )}px`;
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
