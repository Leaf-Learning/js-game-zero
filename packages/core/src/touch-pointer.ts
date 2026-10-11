import type { BrowserMouseLike, InputDispatcher } from "./events";

type PointerTarget = Parameters<InputDispatcher["handleMouseDown"]>[1];

/**
 * Touch and pen use the existing mouse hooks, with one canvas pointer at a
 * time. Positions map onto `target`, which reports the logical screen size.
 */
export function attachTouchPointer(
  canvas: HTMLCanvasElement,
  dispatcher: InputDispatcher,
  invoke: (callback: () => void) => void,
  target: PointerTarget = canvas,
): { reset(): void; detach(): void } {
  if (!canvas.style || typeof canvas.setPointerCapture !== "function") {
    return { reset() {}, detach() {} };
  }
  const initialTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = "none";
  let active: number | null = null;
  let previous: { clientX: number; clientY: number } | null = null;
  const mapped = (event: PointerEvent, down: boolean): BrowserMouseLike => ({
    clientX: event.clientX,
    clientY: event.clientY,
    button: 0,
    buttons: down ? 1 : 0,
    movementX: previous ? event.clientX - previous.clientX : 0,
    movementY: previous ? event.clientY - previous.clientY : 0,
  });
  const down = (raw: Event): void => {
    const event = raw as PointerEvent;
    if (
      event.pointerType === "mouse" ||
      active !== null ||
      !event.isPrimary ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    active = event.pointerId;
    const mouseEvent = mapped(event, true);
    previous = { clientX: event.clientX, clientY: event.clientY };
    invoke(() => {
      dispatcher.handleMouseDown(mouseEvent, target);
    });
  };
  const move = (raw: Event): void => {
    const event = raw as PointerEvent;
    if (event.pointerId !== active) return;
    const mouseEvent = mapped(event, true);
    previous = { clientX: event.clientX, clientY: event.clientY };
    invoke(() => {
      dispatcher.handleMouseMove(mouseEvent, target);
    });
  };
  const reset = (): void => {
    const id = active;
    active = null;
    previous = null;
    if (id !== null && canvas.hasPointerCapture(id))
      canvas.releasePointerCapture(id);
  };
  const up = (raw: Event): void => {
    const event = raw as PointerEvent;
    if (event.pointerId !== active) return;
    const mouseEvent =
      event.type === "lostpointercapture" && previous
        ? { ...previous, button: 0, buttons: 0, movementX: 0, movementY: 0 }
        : mapped(event, false);
    reset();
    invoke(() => {
      dispatcher.handleMouseUp(mouseEvent, target);
    });
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(type, up);
  return {
    reset() {
      const position = previous;
      const held = active !== null;
      reset();
      if (held && position) {
        invoke(() => {
          dispatcher.handleMouseUp(
            { ...position, button: 0, buttons: 0, movementX: 0, movementY: 0 },
            target,
          );
        });
      }
    },
    detach() {
      reset();
      canvas.style.touchAction = initialTouchAction;
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
        canvas.removeEventListener(type, up);
    },
  };
}
