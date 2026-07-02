import {
  ImageSurface,
  run,
  type RuntimeDiagnostic,
  type SurfaceLike,
} from "@js-game-zero/core";

type ConsoleLevel = "log" | "info" | "warn" | "error";

const body = document.body;
const project = body.dataset.jgzProject ?? "";
const entry = body.dataset.jgzEntry ?? "main.js";
const canvasOrNull = document.querySelector<HTMLCanvasElement>(
  "[data-jgz-preview-canvas]",
);

if (!canvasOrNull) throw new Error("Missing preview canvas element.");
const canvas: HTMLCanvasElement = canvasOrNull;

const seenMessages = new Set<string>();

function post(message: Record<string, unknown>): void {
  window.parent.postMessage(
    { source: "jgz-sandbox-preview", project, ...message },
    window.location.origin,
  );
}

function postDiagnosticOnce(diagnostic: RuntimeDiagnostic): void {
  const key = `${diagnostic.severity}:${diagnostic.message}`;
  if (seenMessages.has(key)) return;
  seenMessages.add(key);
  post({ type: "diagnostic", diagnostic });
}

function postRuntimeErrorOnce(message: string, line?: number): void {
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
            typeof value === "string" ? value : safeStringify(value),
          )
          .join(" "),
      });
    };
  }
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
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

/**
 * Letterboxes the canvas inside the iframe: largest size that fits the
 * viewport while keeping the game's aspect ratio. Done by sizing the
 * element itself (rather than object-fit) so the element box always equals
 * the drawn content, which the runtime's mouse mapping relies on to
 * translate clicks back into game coordinates.
 */
function fitCanvasToViewport(): void {
  const logicalWidth = canvas.width || 1;
  const logicalHeight = canvas.height || 1;
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

function canvasIsNonblank(): boolean {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width === 0 || canvas.height === 0) return false;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 0) return true;
  }
  return false;
}

// Fix for the "clicks never register while a game runs" defect: the old
// preview posted a status message on every animation frame, forcing the
// parent to re-render its whole UI ~60x/sec. Status is now sampled and
// posted on an interval well under the browser's click-registration risk
// window (<=4Hz), decoupled from the render/game loop entirely.
let frames = 0;
let ready = false;
function sampleStatus(): void {
  frames += 1;
  ready = ready || canvasIsNonblank();
  post({ type: "status", status: { ready, nonblank: ready, frames } });
}
const statusInterval = window.setInterval(sampleStatus, 250);
window.addEventListener("pagehide", () => window.clearInterval(statusInterval));

function assetUrl(path: string): string {
  return `/assets/${encodeURIComponent(project)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function loadImageSurface(path: string): Promise<SurfaceLike> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.addEventListener("load", () => resolve(new ImageSurface(image)), {
      once: true,
    });
    image.addEventListener(
      "error",
      () => reject(new Error(`Failed to preload ${path}`)),
      { once: true },
    );
    image.src = assetUrl(path);
  });
}

/**
 * Zero-boilerplate code often accesses images synchronously at the top of
 * the file (e.g. `images.player.get_size()` right after declaring an
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
  const images: Record<string, SurfaceLike> = {};
  const preload: string[] = [];
  const imagePaths = files.filter((path) => path.startsWith("images/"));
  const loaded = await Promise.all(
    imagePaths.map(async (path) => {
      try {
        return [path, await loadImageSurface(path)] as const;
      } catch {
        return null;
      }
    }),
  );
  for (const entry of loaded) {
    if (!entry) continue;
    const [path, surface] = entry;
    images[path.slice("images/".length)] = surface;
  }
  for (const path of files) {
    if (
      path.startsWith("sounds/") ||
      path.startsWith("music/") ||
      path.startsWith("fonts/")
    ) {
      preload.push(path);
    }
  }
  return { images, preload };
}

forwardConsole();

try {
  const [entryResponse, projectResponse] = await Promise.all([
    fetch(`/api/projects/${encodeURIComponent(project)}/files/${entry}`),
    fetch(`/api/projects/${encodeURIComponent(project)}`),
  ]);
  if (!entryResponse.ok) throw new Error(`Failed to load ${entry}`);
  const source = (await entryResponse.json()).content as string;
  const files: string[] = projectResponse.ok
    ? ((await projectResponse.json()).project?.files ?? [])
    : [];
  const { images, preload } = await preloadAssets(files);
  run(source, {
    canvas,
    projectId: project,
    assetBaseUrl: "/assets",
    preload,
    preloadedAssets: { images },
    diagnostics(diagnostic) {
      postDiagnosticOnce(diagnostic);
    },
  });
} catch (error) {
  postRuntimeErrorOnce(messageOf(error));
}

sampleStatus();
