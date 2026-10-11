import {
  ImageSurface,
  run,
  type GameHandle,
  type RuntimeDiagnostic,
  type SurfaceLike,
} from "@js-game-zero/core";
import { getGameInspector } from "@js-game-zero/core/host";
import { serializeGameValue } from "./serialize";

type DriverEvent = {
  readonly event: "ready" | "diagnostic" | "runtime-error";
  readonly [key: string]: unknown;
};

type InspectionPath = {
  readonly source: string;
  readonly binding: string;
  readonly segments: readonly (string | number)[];
};

type DriverStatus = {
  readonly state: string;
  readonly elapsed: number;
  readonly frames: number;
  /** The logical screen size, and the canvas pixels per logical pixel. */
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly density: number;
  };
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly failure: {
    readonly phase: string;
    readonly message: string;
    readonly line?: number;
  } | null;
  readonly startupError: string | null;
  /** Sampled pixel summary of the current frame, when requested. */
  readonly pixels?: PixelSummary;
};

type PixelSummary = {
  readonly distinctColors: number;
  readonly frameHash: string;
};

type JgzDriver = {
  initialized: boolean;
  status(options?: { pixels?: boolean }): DriverStatus;
  step(dt: number, count: number): DriverStatus;
  inspect(path?: InspectionPath): unknown;
  call(binding: string): unknown;
  screenshot(): { dataUrl: string; pixels: PixelSummary };
};

declare global {
  interface Window {
    __jgzDriver?: JgzDriver;
    __jgzEmit?: (event: DriverEvent) => Promise<void> | void;
  }
}

const body = document.body;
const token = body.dataset.jgzToken ?? "";
const canvasElement =
  document.querySelector<HTMLCanvasElement>("[data-jgz-canvas]");
if (!canvasElement) throw new Error("Missing game canvas.");
const canvas: HTMLCanvasElement = canvasElement;

let handle: GameHandle | null = null;
let elapsed = 0;
let frames = 0;
let startupError: string | null = null;
const diagnostics: RuntimeDiagnostic[] = [];

const driver: JgzDriver = {
  initialized: false,
  status,
  step(dt, count) {
    requireHandle();
    for (let index = 0; index < count; index += 1) {
      if (!handle || handle.state === "failed" || handle.state === "stopped") {
        break;
      }
      handle.step(dt);
      elapsed += dt;
      frames += 1;
    }
    return status();
  },
  inspect(path) {
    const active = requireHandle();
    const inspector = getGameInspector(active);
    if (!inspector) throw new Error("Game state inspection is unavailable.");
    if (!path) {
      const snapshot: Record<string, unknown> = {};
      for (const binding of inspector.bindings()) {
        try {
          snapshot[binding] = serializeGameValue(inspector.read(binding));
        } catch (error) {
          snapshot[binding] = serializeGameValue(error);
        }
      }
      return snapshot;
    }
    let value = inspector.read(path.binding);
    for (const segment of path.segments) {
      if (
        value === null ||
        (typeof value !== "object" && typeof value !== "function")
      ) {
        throw new Error(
          `Cannot read ${path.source}: ${String(segment)} has no parent value.`,
        );
      }
      value = Reflect.get(value, segment);
    }
    return serializeGameValue(value);
  },
  call(binding) {
    const active = requireHandle();
    const inspector = getGameInspector(active);
    if (!inspector) throw new Error("Game state inspection is unavailable.");
    const value = inspector.read(binding);
    if (typeof value !== "function") {
      throw new Error(`${binding} is not a function.`);
    }
    return serializeGameValue(value());
  },
  screenshot() {
    return { dataUrl: canvas.toDataURL("image/png"), pixels: pixelSummary() };
  },
};
window.__jgzDriver = driver;

window.addEventListener("error", (event) => {
  emit({
    event: "runtime-error",
    message: messageOf(event.error ?? event.message),
    ...(event.lineno > 0 ? { line: event.lineno } : {}),
  });
});
window.addEventListener("unhandledrejection", (event) => {
  emit({ event: "runtime-error", message: messageOf(event.reason) });
});

void boot();

async function boot(): Promise<void> {
  try {
    const [source, manifest] = await Promise.all([
      fetch(projectUrl("source"), { cache: "no-store" }).then(requireText),
      fetch(projectUrl("manifest"), { cache: "no-store" }).then(requireJson),
    ]);
    const files = decodeManifest(manifest);
    const { images, preload } = await preloadAssets(files);
    handle = run(source, {
      autostart: false,
      canvas,
      projectId: "assets",
      assetBaseUrl: `/${encodeURIComponent(token)}`,
      preload,
      preloadedAssets: { images },
      diagnostics(diagnostic) {
        diagnostics.push(diagnostic);
        emit({ event: "diagnostic", diagnostic });
      },
    });
    await handle.ready;
    handle.step(0);
    frames += 1;
    canvas.focus();
    driver.initialized = true;
    emit({ event: "ready", status: status() });
  } catch (error) {
    startupError = messageOf(error);
    driver.initialized = true;
    emit({ event: "runtime-error", message: startupError, phase: "startup" });
  }
}

const PIXEL_SAMPLE_STEP = 6;
const sampler = document.createElement("canvas");
const samplerContext = sampler.getContext("2d", { willReadFrequently: true });

/** Distinct colours and a hash over a sparse pixel grid: enough to tell a
 * blank canvas from a painted one and one frame from the next. The game
 * canvas is copied unsmoothed onto a small sampler canvas, which keeps one
 * pixel per grid cell and keeps readback off the game's own context. The
 * grid is laid over the logical screen, so it has the same cells at any
 * pixel density. */
function pixelSummary(): PixelSummary {
  const { width: logicalWidth, height: logicalHeight } = logicalSize();
  const width = Math.ceil(logicalWidth / PIXEL_SAMPLE_STEP);
  const height = Math.ceil(logicalHeight / PIXEL_SAMPLE_STEP);
  if (!samplerContext || width === 0 || height === 0) {
    return { distinctColors: 0, frameHash: "" };
  }
  let data: Uint8ClampedArray;
  try {
    sampler.width = width;
    sampler.height = height;
    samplerContext.imageSmoothingEnabled = false;
    samplerContext.drawImage(canvas, 0, 0, width, height);
    data = samplerContext.getImageData(0, 0, width, height).data;
  } catch {
    return { distinctColors: 0, frameHash: "" };
  }
  const seen = new Set<number>();
  let hash = 2166136261;
  for (let index = 0; index < data.length; index += 4) {
    const rgb =
      ((data[index] ?? 0) << 16) |
      ((data[index + 1] ?? 0) << 8) |
      (data[index + 2] ?? 0);
    seen.add(rgb);
    hash = Math.imul(hash ^ rgb, 16777619);
  }
  return { distinctColors: seen.size, frameHash: (hash >>> 0).toString(16) };
}

function status(options?: { pixels?: boolean }): DriverStatus {
  const failure = handle?.failure;
  return {
    ...(options?.pixels ? { pixels: pixelSummary() } : {}),
    state: handle?.state ?? (startupError ? "failed" : "starting"),
    elapsed,
    frames,
    canvas: logicalSize(),
    diagnostics: [...diagnostics],
    failure: failure
      ? {
          phase: failure.phase,
          message: failure.message,
          ...(failure.line === undefined ? {} : { line: failure.line }),
        }
      : null,
    startupError,
  };
}

function logicalSize(): DriverStatus["canvas"] {
  const screen = handle?.screen;
  return screen
    ? { width: screen.width, height: screen.height, density: screen.density }
    : { width: canvas.width, height: canvas.height, density: 1 };
}

function requireHandle(): GameHandle {
  if (!handle) throw new Error(startupError ?? "The game is not ready.");
  return handle;
}

function projectUrl(path: string): string {
  return `/${encodeURIComponent(token)}/${path}`;
}

function emit(event: DriverEvent): void {
  try {
    void window.__jgzEmit?.(event);
  } catch {
    // Losing the automation client must not affect the game runtime.
  }
}

async function requireText(response: Response): Promise<string> {
  if (!response.ok) throw new Error(await response.text());
  return response.text();
}

async function requireJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function decodeManifest(value: unknown): string[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("files" in value) ||
    !Array.isArray(value.files) ||
    !value.files.every((path) => typeof path === "string")
  ) {
    throw new Error("The project server returned an invalid asset manifest.");
  }
  return value.files;
}

async function preloadAssets(
  files: readonly string[],
): Promise<{ images: Record<string, SurfaceLike>; preload: string[] }> {
  const images: Record<string, SurfaceLike> = {};
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
  return {
    images,
    preload: files.filter(
      (path) =>
        path.startsWith("sounds/") ||
        path.startsWith("music/") ||
        path.startsWith("fonts/"),
    ),
  };
}

function loadImageSurface(path: string): Promise<SurfaceLike> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(new ImageSurface(image)), {
      once: true,
    });
    image.addEventListener(
      "error",
      () => reject(new Error(`Failed to preload ${path}`)),
      { once: true },
    );
    image.src = `${projectUrl(`assets/${path}`)}?v=${Date.now()}`;
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
