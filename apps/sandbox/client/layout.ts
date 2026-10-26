import { qs } from "./dom";

const LAYOUT_KEY = "jgz-sandbox:layout";
const KEYBOARD_STEP = 16;

/** Must match the minmax() minimum on the code column in style.css. */
const CODE_MIN = 280;
/** Smallest height the game stage is allowed to be squeezed to. */
const FRAME_MIN = 160;

type PanelName = "preview" | "console";
const panelNames: readonly PanelName[] = ["preview", "console"];

type PanelSpec = {
  readonly cssVar: string;
  readonly min: number;
  readonly max: number;
  readonly axis: "x" | "y";
  /** +1 when moving the divider right/down grows the panel, -1 otherwise. */
  readonly direction: 1 | -1;
};

const specs: Record<PanelName, PanelSpec> = {
  preview: {
    // Unset, the game takes 5/9 of the room beside the code (style.css).
    cssVar: "--jgz-preview-width",
    min: 300,
    max: 1600,
    axis: "x",
    direction: -1,
  },
  console: {
    cssVar: "--jgz-console-height",
    min: 88,
    max: 600,
    axis: "y",
    direction: -1,
  },
};

type LayoutSizes = Partial<Record<PanelName, number>>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function loadSizes(): LayoutSizes {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    const sizes: LayoutSizes = {};
    for (const name of panelNames) {
      const value = record[name];
      if (typeof value === "number" && Number.isFinite(value)) {
        sizes[name] = value;
      }
    }
    return sizes;
  } catch {
    return {};
  }
}

/**
 * Draggable dividers for the two adjustable panels: the game column, and
 * Messages (which trades height with the game stage above it). Sizes land
 * in CSS custom properties consumed by style.css and persist across
 * sessions in localStorage. Double-clicking a divider puts it back.
 */
export function initPanelResizers(root: HTMLElement): void {
  const shell = qs<HTMLElement>(root, "[data-jgz-app-shell]");
  const codePanel = qs<HTMLElement>(root, "[data-jgz-editor-pane]");
  const frameWrap = qs<HTMLElement>(root, "[data-jgz-preview-frame-wrap]");
  const panels: Record<PanelName, HTMLElement> = {
    preview: qs<HTMLElement>(root, "[data-jgz-preview-pane]"),
    console: qs<HTMLElement>(root, "[data-jgz-console-panel]"),
  };

  const sizes = loadSizes();

  function measure(name: PanelName): number {
    const rect = panels[name].getBoundingClientRect();
    return specs[name].axis === "x" ? rect.width : rect.height;
  }

  /** How much the panel may still grow before its neighbor hits bottom. */
  function headroom(name: PanelName): number {
    if (name === "console") {
      return Math.max(0, frameWrap.getBoundingClientRect().height - FRAME_MIN);
    }
    return Math.max(0, codePanel.getBoundingClientRect().width - CODE_MIN);
  }

  function apply(name: PanelName, size: number): void {
    shell.style.setProperty(specs[name].cssVar, `${Math.round(size)}px`);
    sizes[name] = Math.round(size);
  }

  function reset(name: PanelName): void {
    shell.style.removeProperty(specs[name].cssVar);
    delete sizes[name];
  }

  function persist(): void {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(sizes));
    } catch {
      // Layout persistence is a convenience; ignore quota/privacy errors.
    }
  }

  for (const name of panelNames) {
    const spec = specs[name];
    const saved = sizes[name];
    if (saved !== undefined) {
      apply(name, clamp(saved, spec.min, spec.max));
    }
  }

  for (const name of panelNames) {
    const spec = specs[name];
    const handle = qs<HTMLElement>(root, `[data-jgz-resize="${name}"]`);

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const start = spec.axis === "x" ? event.clientX : event.clientY;
      const startSize = measure(name);
      const maxSize = Math.min(spec.max, startSize + headroom(name));
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("resizing");

      const onMove = (moveEvent: PointerEvent): void => {
        const point = spec.axis === "x" ? moveEvent.clientX : moveEvent.clientY;
        const delta = (point - start) * spec.direction;
        apply(name, clamp(startSize + delta, spec.min, maxSize));
      };
      const onEnd = (): void => {
        handle.classList.remove("resizing");
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onEnd);
        handle.removeEventListener("pointercancel", onEnd);
        persist();
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onEnd);
      handle.addEventListener("pointercancel", onEnd);
    });

    handle.addEventListener("keydown", (event) => {
      const grow =
        spec.axis === "x"
          ? { key: "ArrowRight", opposite: "ArrowLeft" }
          : { key: "ArrowDown", opposite: "ArrowUp" };
      let sign: number;
      if (event.key === grow.key) sign = 1;
      else if (event.key === grow.opposite) sign = -1;
      else return;
      event.preventDefault();
      const current = measure(name);
      const maxSize = Math.min(spec.max, current + headroom(name));
      apply(
        name,
        clamp(
          current + sign * KEYBOARD_STEP * spec.direction,
          spec.min,
          maxSize,
        ),
      );
      persist();
    });

    handle.addEventListener("dblclick", () => {
      reset(name);
      persist();
    });
  }
}
