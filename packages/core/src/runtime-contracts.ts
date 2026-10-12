import type {
  AssetLoaders,
  FontAsset,
  MusicAsset,
  SoundAsset,
  SurfaceLike,
} from "./assets";
import type {
  Hook,
  InputHooks,
  MappedKeyboardEvent,
  MappedMouseEvent,
} from "./events";
import type { Storage, StorageAdapter } from "./storage";
import type { TouchControlsConfig } from "./touch-controls";

export type GameModule = InputHooks & {
  readonly WIDTH?: number;
  readonly HEIGHT?: number;
  /**
   * Canvas pixels per logical pixel. Defaults to the device's pixel ratio,
   * at most 3, so the game is sharp on high-density screens.
   */
  readonly PIXEL_DENSITY?: number;
  readonly TITLE?: string;
  readonly ICON?: string | null;
  readonly TOUCH_CONTROLS?: TouchControlsConfig;
  readonly draw?: Hook;
  readonly update?: Hook;
};

export type RuntimeMode = "global" | "import";

export type RuntimeDiagnostic = {
  readonly code:
    | "asset-name"
    | "constant-typo"
    | "duplicate-config"
    | "hook-arity"
    | "hook-parameter"
    | "hook-typo"
    | "invalid-config"
    | "runtime-error";
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly name?: string;
  readonly suggestion?: string;
  readonly phase?: RuntimeFailurePhase;
  /** For `runtime-error`: the 1-based line in the game source where the error was thrown, when the engine reports one. */
  readonly line?: number;
  readonly recoverable?: boolean;
};

export type RuntimeFailurePhase =
  | "startup"
  | "input"
  | "clock"
  | "update"
  | "draw"
  | "asset"
  | "storage"
  | "audio";

export type RuntimeFailure = {
  readonly phase: RuntimeFailurePhase;
  readonly message: string;
  readonly cause: unknown;
  /** 1-based line in the game source where the error was thrown, when the engine reports one. */
  readonly line?: number;
};

export type GameHandleState =
  "starting" | "running" | "paused" | "failed" | "stopped";

export type RuntimeScheduler = {
  requestAnimationFrame(callback: (timestamp: number) => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
  now?(): number;
};

export type RuntimeCanvas = HTMLCanvasElement & {
  getBoundingClientRect?: () => {
    left: number;
    top: number;
    width?: number;
    height?: number;
  };
};

export type RunOptions = Partial<GameModule> & {
  readonly assetBaseUrl?: string;
  readonly autostart?: boolean;
  readonly canvas?: RuntimeCanvas;
  readonly container?: HTMLElement;
  readonly diagnostics?: (diagnostic: RuntimeDiagnostic) => void;
  readonly keyboardTarget?: EventTarget;
  readonly preload?: readonly string[];
  readonly preloadedAssets?: PreloadedAssets;
  readonly projectId?: string;
  readonly scheduler?: RuntimeScheduler;
  readonly storage?: Storage | StorageAdapter;
  /** Context-owned loader overrides for embedding hosts and deterministic tests. */
  readonly loaders?: Partial<AssetLoaders>;
};

export type PreloadedAssets = {
  readonly images?: Record<string, SurfaceLike>;
  readonly sounds?: Record<string, SoundAsset>;
  readonly music?: Record<string, MusicAsset>;
  readonly fonts?: Record<string, FontAsset>;
};

export type GameKeyEvent = Readonly<MappedKeyboardEvent>;
export type GameMouseEvent = Readonly<MappedMouseEvent>;

export type DefinedGameModule = {
  readonly WIDTH?: number;
  readonly HEIGHT?: number;
  readonly PIXEL_DENSITY?: number;
  readonly TITLE?: string;
  readonly ICON?: string | null;
  readonly TOUCH_CONTROLS?: TouchControlsConfig;
  readonly draw?: () => void;
  readonly update?: (dt: number) => void;
  readonly onKeyDown?: (event: GameKeyEvent) => void;
  readonly onKeyUp?: (event: GameKeyEvent) => void;
  readonly onMouseDown?: (event: GameMouseEvent) => void;
  readonly onMouseUp?: (event: GameMouseEvent) => void;
  readonly onMouseMove?: (event: GameMouseEvent) => void;
  readonly onMusicEnd?: () => void;
};
