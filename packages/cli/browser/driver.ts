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
  readonly canvas: { readonly width: number; readonly height: number };
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly failure: {
    readonly phase: string;
    readonly message: string;
    readonly line?: number;
  } | null;
  readonly startupError: string | null;
};

type JgzDriver = {
  initialized: boolean;
  status(): DriverStatus;
  step(dt: number, count: number): DriverStatus;
  inspect(path?: InspectionPath): unknown;
  screenshot(): string;
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
  screenshot() {
    return canvas.toDataURL("image/png");
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

function status(): DriverStatus {
  const failure = handle?.failure;
  return {
    state: handle?.state ?? (startupError ? "failed" : "starting"),
    elapsed,
    frames,
    canvas: { width: canvas.width, height: canvas.height },
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
