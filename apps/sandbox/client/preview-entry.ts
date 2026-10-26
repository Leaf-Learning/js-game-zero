import {
  Actor,
  Rect,
  run,
  type RuntimeDiagnostic,
  type SurfaceLike,
} from "@js-game-zero/core";
import { loadImages } from "@js-game-zero/core/host";
import { assetSourceUrl, getProject, readFile } from "./api";

type ConsoleLevel = "log" | "info" | "warn" | "error";

const body = document.body;
const project = body.dataset.jgzProject ?? "";
const entry = body.dataset.jgzEntry ?? "main.js";
const parentOrigin = body.dataset.jgzParentOrigin ?? window.location.origin;
const canvasOrNull = document.querySelector<HTMLCanvasElement>(
  "[data-jgz-preview-canvas]",
);

if (!canvasOrNull) throw new Error("Missing preview canvas element.");
const canvas: HTMLCanvasElement = canvasOrNull;

const seenMessages = new Set<string>();
let fatalRuntimeDiagnosticPosted = false;

function post(message: Record<string, unknown>): void {
  window.parent.postMessage(
    { source: "jgz-sandbox-preview", project, ...message },
    parentOrigin,
  );
}

function postDiagnosticOnce(diagnostic: RuntimeDiagnostic): void {
  const key = `${diagnostic.severity}:${diagnostic.message}`;
  if (seenMessages.has(key)) return;
  seenMessages.add(key);
  if (diagnostic.code === "runtime-error" && diagnostic.severity === "error") {
    fatalRuntimeDiagnosticPosted = true;
  }
  post({ type: "diagnostic", diagnostic });
}

function postRuntimeErrorOnce(message: string, line?: number): void {
  // `run()` reports synchronous startup failures through diagnostics before
  // rethrowing them. The outer loader catch and browser rejection events must
  // not turn the same failure into a second Problems entry.
  if (fatalRuntimeDiagnosticPosted) return;
  const key = `error:${message}`;
  if (seenMessages.has(key)) return;
  seenMessages.add(key);
  post({ type: "runtime-error", message, ...(line ? { line } : {}) });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function forwardConsole(): void {
  const levels: ConsoleLevel[] = ["log", "info", "warn", "error"];
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      post({
        type: "console",
        level,
        text: args
          .map((value) =>
            typeof value === "string" ? value : formatValue(value),
          )
          .join(" "),
      });
    };
  }
}

/**
 * A logged value as the browser's console would show it, kept short:
 * `undefined`, `NaN`, `[1, 2, 3]`, `Map(1) {"a" => 1}`, an Actor by its
 * image and position rather than its insides.
 */
function formatValue(
  value: unknown,
  depth = 0,
  seen = new Set<object>(),
): string {
  if (typeof value === "string")
    return depth === 0 ? value : JSON.stringify(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") {
    return `function ${value.name || "(anonymous)"}`;
  }
  if (value === null || typeof value !== "object") return String(value);
  if (value instanceof Error)
    return depth === 0 ? value.message : `${value.name}: ${value.message}`;
  if (value instanceof Actor) {
    return `Actor("${value.image}") at [${value.x}, ${value.y}]`;
  }
  if (value instanceof Rect) {
    return `Rect(${value.x}, ${value.y}, ${value.w}, ${value.h})`;
  }
  if (seen.has(value)) return "[circular]";
  if (depth >= 3) return Array.isArray(value) ? "[…]" : "{…}";
  seen.add(value);
  try {
    const inner = (item: unknown) => formatValue(item, depth + 1, seen);
    const list = (items: readonly string[], total: number) =>
      total > items.length
        ? [...items, `… ${total - items.length} more`]
        : items;
    if (Array.isArray(value)) {
      return `[${list(value.slice(0, 50).map(inner), value.length).join(", ")}]`;
    }
    if (value instanceof Map) {
      const entries = [...value]
        .slice(0, 50)
        .map(([key, item]) => `${inner(key)} => ${inner(item)}`);
      return `Map(${value.size}) {${list(entries, value.size).join(", ")}}`;
    }
    if (value instanceof Set) {
      const items = [...value].slice(0, 50).map(inner);
      return `Set(${value.size}) {${list(items, value.size).join(", ")}}`;
    }
    // A class's own fields, without its private ones (the `_` names).
    const keys = Object.keys(value).filter((key) => !key.startsWith("_"));
    const entries = keys
      .slice(0, 50)
      .map(
        (key) => `${key}: ${inner((value as Record<string, unknown>)[key])}`,
      );
    const name = value.constructor?.name;
    const prefix = name && name !== "Object" ? `${name} ` : "";
    return `${prefix}{${list(entries, keys.length).join(", ")}}`;
  } finally {
    seen.delete(value);
  }
}

window.addEventListener("error", (event) => {
  postRuntimeErrorOnce(
    messageOf(event.error ?? event.message),
    event.lineno > 0 ? event.lineno : undefined,
  );
});
window.addEventListener("unhandledrejection", (event) => {
  postRuntimeErrorOnce(messageOf(event.reason));
});

/** The running game's screen, whose size is in logical pixels. */
let gameScreen: { readonly width: number; readonly height: number } | null =
  null;

/**
 * Letterboxes the canvas inside the iframe: largest size that fits the
 * viewport while keeping the game's aspect ratio. Done by sizing the
 * element itself (rather than object-fit) so the element box always equals
 * the drawn content, which the runtime's mouse mapping relies on to
 * translate clicks back into game coordinates. It fits the logical
 * WIDTH × HEIGHT, since pixel density multiplies `canvas.width`.
 */
function fitCanvasToViewport(): void {
  const logicalWidth = gameScreen?.width || canvas.width || 1;
  const logicalHeight = gameScreen?.height || canvas.height || 1;
  const scale = Math.min(
    document.documentElement.clientWidth / logicalWidth,
    document.documentElement.clientHeight / logicalHeight,
  );
  canvas.style.width = `${logicalWidth * scale}px`;
  canvas.style.height = `${logicalHeight * scale}px`;
}

window.addEventListener("resize", fitCanvasToViewport);
// The game's WIDTH/HEIGHT are applied to the canvas while `run()` boots
// (and user code may change them later); refit whenever they do.
new MutationObserver(fitCanvasToViewport).observe(canvas, {
  attributes: true,
  attributeFilter: ["width", "height"],
});
fitCanvasToViewport();

canvas.addEventListener("focus", () =>
  post({ type: "focus-changed", focused: true }),
);
canvas.addEventListener("blur", () =>
  post({ type: "focus-changed", focused: false }),
);
window.addEventListener("focus", () => canvas.focus());

/**
 * Zero-boilerplate code often accesses images synchronously at the top of
 * the file (e.g. `images.player.getSize()` right after declaring an
 * Actor), the same style the bundled /examples pages use. That only works
 * if the image is registered before the source runs, so preload every
 * image under images/ up front, matching how the example gallery's own
 * pages preload their declared assets. Sounds/music/fonts are warmed with
 * a best-effort async preload instead, since sandbox code typically only
 * touches them from event handlers rather than at module scope.
 */
async function preloadAssets(
  files: readonly string[],
): Promise<{ images: Record<string, SurfaceLike>; preload: string[] }> {
  const imageUrls = Object.fromEntries(
    files
      .filter((path) => path.startsWith("images/"))
      .map((path) => [path, assetSourceUrl(project, path)]),
  );
  const preload = files.filter(
    (path) =>
      path.startsWith("sounds/") ||
      path.startsWith("music/") ||
      path.startsWith("fonts/"),
  );
  return { images: await loadImages(imageUrls), preload };
}

forwardConsole();

try {
  const [source, projectSummary] = await Promise.all([
    readFile(project, entry),
    getProject(project),
  ]);
  const { images, preload } = await preloadAssets(projectSummary.files);
  gameScreen = run(source, {
    canvas,
    projectId: project,
    assetBaseUrl: "/assets",
    preload,
    preloadedAssets: { images },
    diagnostics(diagnostic) {
      postDiagnosticOnce(diagnostic);
    },
  }).screen;
  fitCanvasToViewport();
} catch (error) {
  postRuntimeErrorOnce(messageOf(error));
}
