import {
  fontExtensions,
  loadBrowserImage,
  loadFontAsset,
  loadMusicAsset,
  loadSoundAsset,
} from "./browser-asset-backends";
import { createActiveServiceProxy } from "./active-service";
import { guardSpellings } from "./friendly-names";
import { Rect, type Point, type RectLike } from "./geometry";
import {
  imageExtensions,
  isPair,
  rectPositionKeys,
  requirePoint,
  soundExtensions,
} from "./util";

export type AssetKind = "image" | "sound" | "music" | "font";

/**
 * A game's assets by path (`images/cat.svg`, `sounds/pop.wav`), each with
 * the URL to load it from, such as a data URL. When a run is given one, its
 * assets come only from here, so a page needs no asset server.
 */
export type AssetUrls = Readonly<Record<string, string>>;

export type AssetLoadOptions<T> = {
  readonly kind: AssetKind;
  readonly directory: string;
  readonly extensions: readonly string[];
  readonly projectId?: string;
  readonly assetBaseUrl?: string;
  /** Where each asset is, by path; when set, `assetBaseUrl` isn't used. */
  readonly assetUrls?: AssetUrls;
  readonly loadAsset?: (url: string, name: string) => Promise<T>;
};

export type AssetLoaderOptions<T> = Partial<
  Omit<AssetLoadOptions<T>, "kind" | "directory" | "extensions">
>;

export type DrawableImage = CanvasImageSource & {
  readonly width?: number;
  readonly height?: number;
  readonly naturalWidth?: number;
  readonly naturalHeight?: number;
};

export type SurfaceRectOptions = Partial<Record<PositionKey, Point>>;

export interface SurfaceLike {
  readonly source: DrawableImage;
  getWidth(): number;
  getHeight(): number;
  getSize(): Point;
  getRect(options?: SurfaceRectOptions): Rect;
}

export type LoadedAsset = {
  readonly kind: AssetKind;
  readonly name: string;
  readonly url: string;
  readonly bytes?: ArrayBuffer;
};

export type SoundAsset = LoadedAsset & {
  play(loops?: number): void;
  /** Plays the sound over and over until `stop()`. */
  loop(): void;
  stop(): void;
  getLength(): number;
  setVolume(volume: number): void;
  getVolume(): number;
};

export type MusicAsset = LoadedAsset;

export type FontAsset = LoadedAsset & {
  readonly family: string;
  readonly face?: FontFace;
};

export type AssetLoader<T> = {
  readonly kind: AssetKind;
  readonly projectId: string;
  readonly assetBaseUrl: string;
  /** The asset map this loader reads instead of `assetBaseUrl`, if it was given one. */
  readonly assetUrls?: AssetUrls | undefined;
  readonly extensions: readonly string[];
  readonly directory: string;
  load(name: string): Promise<T>;
  get(name: string): T | undefined;
  has(name: string): boolean;
  define(name: string, asset: T): T;
  unload(name: string): boolean;
  unloadAll(): void;
  cacheKeys(): string[];
  /**
   * Number of loads currently in flight (started but not yet settled).
   * Used by the runtime's preload gate to hold frames until assets that
   * were requested during module evaluation (or mid-game) have resolved.
   */
  pendingCount(): number;
  /**
   * Resolves once there are no in-flight loads, or rejects with failures
   * settled since the previous idle wait. Re-checks after each settle so
   * loads triggered while waiting are also awaited.
   */
  waitForIdle(): Promise<void>;
};

export type AssetLoaders = {
  images: AssetLoader<SurfaceLike>;
  sounds: AssetLoader<SoundAsset>;
  music: AssetLoader<MusicAsset>;
  fonts: AssetLoader<FontAsset>;
};

type PositionKey =
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | "midTop"
  | "midLeft"
  | "midRight"
  | "midBottom"
  | "center";

export class MissingAssetError extends Error {
  readonly kind: AssetKind;
  readonly assetName: string;
  readonly attemptedUrls: readonly string[];

  constructor(
    kind: AssetKind,
    name: string,
    options: {
      readonly attemptedUrls?: readonly string[];
      readonly cause?: unknown;
      /** Why a file that's there couldn't be loaded, when that's known. */
      readonly why?: string;
    } = {},
  ) {
    const attemptedUrls = [...(options.attemptedUrls ?? [])];
    const attemptedMessage =
      attemptedUrls.length === 0 ? "" : ` (tried ${attemptedUrls.join(", ")})`;
    super(
      options.why === undefined
        ? `Missing ${kind} asset: ${name}${attemptedMessage}`
        : `Couldn't load ${kind} asset ${name}${attemptedMessage}. ${options.why}`,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "MissingAssetError";
    this.kind = kind;
    this.assetName = name;
    this.attemptedUrls = attemptedUrls;
  }
}

export class InvalidAssetNameError extends TypeError {
  constructor(kind: AssetKind, name: string, reason: string) {
    super(`Invalid ${kind} asset name "${name}": ${reason}`);
    this.name = "InvalidAssetNameError";
  }
}

export class ImageSurface implements SurfaceLike {
  readonly source: DrawableImage;
  private readonly width: number;
  private readonly height: number;

  constructor(source: DrawableImage, width?: number, height?: number) {
    this.source = source;
    this.width = requirePositiveDimension(
      width ?? source.naturalWidth ?? source.width,
      "image width",
    );
    this.height = requirePositiveDimension(
      height ?? source.naturalHeight ?? source.height,
      "image height",
    );
  }

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }

  getSize(): Point {
    return [this.width, this.height];
  }

  getRect(options: SurfaceRectOptions = {}): Rect {
    const rect = new Rect(0, 0, this.width, this.height);
    applyRectPosition(rect, options);
    return rect;
  }
}

guardSpellings(ImageSurface.prototype, "image");

export function createImageLoader(
  options: AssetLoaderOptions<SurfaceLike> = {},
): AssetLoader<SurfaceLike> {
  return createAssetLoader<SurfaceLike>({
    kind: "image",
    directory: "images",
    extensions: imageExtensions,
    ...options,
    loadAsset:
      options.loadAsset ??
      ((url) => loadBrowserImage(url, (image) => new ImageSurface(image))),
  });
}

/**
 * Decodes every image in an asset map, by name under `images/`, for
 * `RunOptions.preloadedAssets`. `run()` starts a game's code at once, so an
 * image the run loads itself has no size yet while the top level runs: an
 * Actor placed by `midBottom` and then moved lands as if it were 0×0.
 * Images handed over decoded are ready from the first line, as Pygame
 * Zero's are. One that fails to decode is left out, so the run loads it
 * itself and reports the failure only if the game uses it.
 */
export async function loadImages(
  assetUrls: AssetUrls,
): Promise<Record<string, SurfaceLike>> {
  const loader = createImageLoader({ assetUrls });
  const names = Object.keys(assetUrls)
    .filter((path) => path.startsWith("images/"))
    .map((path) => path.slice("images/".length));
  const loaded = await Promise.all(
    names.map((name) =>
      loader.load(name).then(
        (surface) => [name, surface] as const,
        () => null,
      ),
    ),
  );
  return Object.fromEntries(loaded.filter((entry) => entry !== null));
}

export function createSoundLoader(
  options: AssetLoaderOptions<SoundAsset> = {},
): AssetLoader<SoundAsset> {
  return createAssetLoader<SoundAsset>({
    kind: "sound",
    directory: "sounds",
    extensions: soundExtensions,
    ...options,
    loadAsset: options.loadAsset ?? loadSoundAsset,
  });
}

export function createMusicLoader(
  options: AssetLoaderOptions<MusicAsset> = {},
): AssetLoader<MusicAsset> {
  return createAssetLoader<MusicAsset>({
    kind: "music",
    directory: "music",
    extensions: soundExtensions,
    ...options,
    loadAsset: options.loadAsset ?? loadMusicAsset,
  });
}

export function createFontLoader(
  options: AssetLoaderOptions<FontAsset> = {},
): AssetLoader<FontAsset> {
  return createAssetLoader<FontAsset>({
    kind: "font",
    directory: "fonts",
    extensions: fontExtensions,
    ...options,
    loadAsset: options.loadAsset ?? loadFontAsset,
  });
}

export function createAssetLoaders(
  options: {
    readonly projectId?: string;
    readonly assetBaseUrl?: string;
    readonly assetUrls?: AssetUrls;
  } = {},
): AssetLoaders {
  return {
    images: createImageLoader(options),
    sounds: createSoundLoader(options),
    music: createMusicLoader(options),
    fonts: createFontLoader(options),
  };
}

export function validateAssetName(
  kind: AssetKind,
  name: string,
  extensions: readonly string[],
): string {
  if (typeof name !== "string" || name.trim() !== name || name.length === 0) {
    throw new InvalidAssetNameError(kind, String(name), "use a non-empty name");
  }
  if (name.startsWith("/") || /^[a-z]+:\/\//i.test(name)) {
    throw new InvalidAssetNameError(
      kind,
      name,
      "absolute paths are not allowed",
    );
  }
  if (name.includes("\\") || name.includes("//")) {
    throw new InvalidAssetNameError(kind, name, "use forward-slash paths");
  }

  const segments = name.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new InvalidAssetNameError(
      kind,
      name,
      "path traversal is not allowed",
    );
  }
  if (segments.some((segment) => segment.length === 0)) {
    throw new InvalidAssetNameError(
      kind,
      name,
      "empty path segments are not allowed",
    );
  }

  for (const segment of segments) {
    const [stem, extension, extra] = segment.split(".");
    if (extra !== undefined) {
      throw new InvalidAssetNameError(
        kind,
        name,
        "only one extension is allowed",
      );
    }
    if (!stem || !/^[a-z][a-z0-9_]*$/.test(stem)) {
      throw new InvalidAssetNameError(
        kind,
        name,
        "names must be lowercase, start with a letter, and contain only letters, digits, and underscores",
      );
    }
    if (extension !== undefined) {
      if (!/^[a-z0-9]+$/.test(extension)) {
        throw new InvalidAssetNameError(
          kind,
          name,
          "extensions must be lowercase",
        );
      }
      if (!extensions.includes(extension)) {
        throw new InvalidAssetNameError(
          kind,
          name,
          `supported extensions are ${extensions.join(", ")}`,
        );
      }
    }
  }

  return name;
}

export function assetUrl(
  assetBaseUrl: string,
  projectId: string,
  directory: string,
  name: string,
): string {
  const base = assetBaseUrl.replace(/\/+$/, "");
  const encodedProjectId = encodeURIComponent(projectId);
  const encodedName = name
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${encodedProjectId}/${directory}/${encodedName}`;
}

/** Where a loader finds the asset with this exact name, or undefined when its asset map doesn't list it. */
export function locateAsset(
  loader: {
    readonly assetBaseUrl: string;
    readonly assetUrls?: AssetUrls | undefined;
    readonly projectId: string;
    readonly directory: string;
  },
  name: string,
): string | undefined {
  const { assetUrls } = loader;
  if (!assetUrls) {
    return assetUrl(
      loader.assetBaseUrl,
      loader.projectId,
      loader.directory,
      name,
    );
  }
  const path = `${loader.directory}/${name}`;
  return Object.hasOwn(assetUrls, path) ? assetUrls[path] : undefined;
}

// Package-level singleton loaders backing the ambient `images`/`sounds`/
// `musicAssets`/`fonts` exports whenever no run is currently active (e.g.
// module-top-level `images.load("bg")` or `new Actor("player")` before
// `run()` executes). Exported so the runtime can adopt any pending loads
// into a starting run's preload gate.
export const defaultAssetLoaders: AssetLoaders = createAssetLoaders();
let activeAssetLoaders: AssetLoaders | null = null;

export function setActiveAssetLoaders(
  loaders: AssetLoaders | null,
): AssetLoaders | null {
  const previous = activeAssetLoaders;
  activeAssetLoaders = loaders;
  return previous;
}

export const images = createActiveServiceProxy(
  () => activeAssetLoaders?.images ?? defaultAssetLoaders.images,
);
export const sounds = createActiveServiceProxy(
  () => activeAssetLoaders?.sounds ?? defaultAssetLoaders.sounds,
);
export const musicAssets = createActiveServiceProxy(
  () => activeAssetLoaders?.music ?? defaultAssetLoaders.music,
);
export const fonts = createActiveServiceProxy(
  () => activeAssetLoaders?.fonts ?? defaultAssetLoaders.fonts,
);

// Cap on the per-loader failure ring buffer; see `settledFailures` below.
const MAX_SETTLED_FAILURES = 32;

function createAssetLoader<T>(options: AssetLoadOptions<T>): AssetLoader<T> {
  const projectId = validateProjectId(options.projectId ?? "default");
  const assetBaseUrl = options.assetBaseUrl ?? "/assets";
  const assetUrls = options.assetUrls
    ? Object.freeze({ ...requireAssetUrls(options.assetUrls) })
    : undefined;
  const cache = new Map<string, T>();
  const aliases = new Map<string, string>();
  const pending = new Map<string, Promise<T>>();
  // Bounded ring buffer: a game that keeps retrying a permanently-missing
  // asset (e.g. `music.play` on a timer) must not grow this without limit —
  // each failure retains an `Error` with a stack. Only the most recent
  // `MAX_SETTLED_FAILURES` are kept; `waitForIdle()` also clears it whenever
  // it is consumed, so a drained loader starts fresh.
  const settledFailures: unknown[] = [];
  const lazyProperties = new Map<string, T>();
  const target: AssetLoader<T> = {
    kind: options.kind,
    projectId,
    assetBaseUrl,
    assetUrls,
    directory: options.directory,
    extensions: [...options.extensions],
    async load(name: string): Promise<T> {
      const requested = validateAssetName(
        options.kind,
        name,
        options.extensions,
      );
      const cached = getCached(cache, aliases, requested);
      if (cached) return cached;
      const existingPending = pending.get(requested);
      if (existingPending) return existingPending;

      const loadPromise = loadFirstMatchingAsset(options, {
        assetBaseUrl,
        assetUrls,
        projectId,
        requested,
      })
        .then(({ asset, resolved }) => {
          cache.set(resolved, asset);
          aliases.set(requested, resolved);
          aliases.set(
            stripKnownExtension(resolved, options.extensions),
            resolved,
          );
          pending.delete(requested);
          return asset;
        })
        .catch((error: unknown) => {
          pending.delete(requested);
          const failure =
            error instanceof MissingAssetError
              ? error
              : new MissingAssetError(options.kind, requested, {
                  cause: error,
                });
          settledFailures.push(failure);
          if (settledFailures.length > MAX_SETTLED_FAILURES) {
            settledFailures.splice(
              0,
              settledFailures.length - MAX_SETTLED_FAILURES,
            );
          }
          throw failure;
        });
      pending.set(requested, loadPromise);
      return loadPromise;
    },
    get(name: string): T | undefined {
      const requested = validateAssetName(
        options.kind,
        name,
        options.extensions,
      );
      return getCached(cache, aliases, requested);
    },
    has(name: string): boolean {
      const requested = validateAssetName(
        options.kind,
        name,
        options.extensions,
      );
      return getCached(cache, aliases, requested) !== undefined;
    },
    define(name: string, asset: T): T {
      const requested = validateAssetName(
        options.kind,
        name,
        options.extensions,
      );
      cache.set(requested, asset);
      aliases.set(requested, requested);
      aliases.set(
        stripKnownExtension(requested, options.extensions),
        requested,
      );
      return asset;
    },
    unload(name: string): boolean {
      const requested = validateAssetName(
        options.kind,
        name,
        options.extensions,
      );
      const resolved = aliases.get(requested) ?? requested;
      const deleted = cache.delete(resolved);
      for (const [alias, canonical] of [...aliases.entries()]) {
        if (canonical === resolved || alias === requested) {
          aliases.delete(alias);
          lazyProperties.delete(alias);
        }
      }
      lazyProperties.delete(requested);
      lazyProperties.delete(resolved);
      return deleted;
    },
    unloadAll(): void {
      cache.clear();
      aliases.clear();
      pending.clear();
      settledFailures.length = 0;
      lazyProperties.clear();
    },
    cacheKeys(): string[] {
      return [...cache.keys()].sort();
    },
    pendingCount(): number {
      return pending.size;
    },
    async waitForIdle(): Promise<void> {
      while (pending.size > 0) {
        await Promise.allSettled([...pending.values()]);
      }
      const failures = settledFailures.splice(0);
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) {
        throw new AggregateError(
          failures,
          `${failures.length} ${options.kind} assets failed to load.`,
        );
      }
    },
  };

  // `images.cache_keys` names `images.cacheKeys` instead of loading an
  // image called "cache_keys".
  guardSpellings(target, options.directory);
  return new Proxy(target, {
    get(loader, property, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(loader, property, receiver);
      }
      if (
        property in loader ||
        property === "then" ||
        property === "inspect" ||
        property === "toJSON"
      ) {
        return Reflect.get(loader, property, receiver);
      }
      const requested = validateAssetName(
        options.kind,
        property,
        options.extensions,
      );
      const cached = getCached(cache, aliases, requested);
      if (cached) return cached;
      const existing = lazyProperties.get(requested);
      if (existing) return existing;
      const lazy = createLazyAsset<T>({
        assetBaseUrl,
        assetUrls,
        directory: options.directory,
        extensions: options.extensions,
        get: () => getCached(cache, aliases, requested),
        kind: options.kind,
        load: () => loader.load(requested),
        projectId,
        requested,
      });
      lazyProperties.set(requested, lazy);
      return lazy;
    },
  });
}

type LazyAssetContext<T> = {
  readonly assetBaseUrl: string;
  readonly assetUrls: AssetUrls | undefined;
  readonly directory: string;
  readonly extensions: readonly string[];
  readonly get: () => T | undefined;
  readonly kind: AssetKind;
  readonly load: () => Promise<T>;
  readonly projectId: string;
  readonly requested: string;
};

function createLazyAsset<T>(context: LazyAssetContext<T>): T {
  if (context.kind === "image") {
    return createLazySurface(
      context as unknown as LazyAssetContext<SurfaceLike>,
    ) as T;
  }
  if (context.kind === "sound") {
    return createLazySoundAsset(
      context as unknown as LazyAssetContext<SoundAsset>,
    ) as T;
  }
  return createLazyLoadedAsset(context);
}

function createLazySurface(
  context: LazyAssetContext<SurfaceLike>,
): SurfaceLike {
  let failure: { readonly error: unknown } | undefined;
  void context.load().catch((error: unknown) => {
    failure = { error };
  });

  // An image still loading isn't missing. A game's first frame waits for
  // the images its top level named, so say how to be one of them.
  const loaded = (): SurfaceLike => {
    const asset = context.get();
    if (asset) return asset;
    if (failure) throw failure.error;
    throw new Error(
      `images.${context.requested} is still loading. Name it at the top level (let picture = images.${context.requested};) and the game's first frame waits for it.`,
    );
  };

  const surface: SurfaceLike = {
    get source(): DrawableImage {
      return loaded().source;
    },
    getWidth(): number {
      return loaded().getWidth();
    },
    getHeight(): number {
      return loaded().getHeight();
    },
    getSize(): Point {
      return loaded().getSize();
    },
    getRect(options?: SurfaceRectOptions): Rect {
      return loaded().getRect(options);
    },
  };
  guardSpellings(surface, "image");
  return surface;
}

function createLazySoundAsset(
  context: LazyAssetContext<SoundAsset>,
): SoundAsset {
  let loaded: SoundAsset | undefined;
  let loading: Promise<SoundAsset> | null = null;

  const current = (): SoundAsset | undefined => loaded ?? context.get();
  const ensure = (): Promise<SoundAsset> => {
    const asset = current();
    if (asset) {
      loaded = asset;
      return Promise.resolve(asset);
    }
    loading ??= context.load().then((resolved) => {
      loaded = resolved;
      return resolved;
    });
    return loading;
  };
  const whenLoaded = (callback: (asset: SoundAsset) => void): void => {
    const asset = current();
    if (asset) {
      loaded = asset;
      callback(asset);
      return;
    }
    void ensure()
      .then(callback)
      .catch(() => undefined);
  };

  const sound: SoundAsset = {
    kind: "sound",
    name: context.requested,
    get url(): string {
      return current()?.url ?? fallbackAssetUrl(context);
    },
    play(loops = 0): void {
      whenLoaded((asset) => asset.play(loops));
    },
    loop(): void {
      // Host-built sound assets that predate loop() still loop via play(-1).
      whenLoaded((asset) =>
        typeof asset.loop === "function" ? asset.loop() : asset.play(-1),
      );
    },
    stop(): void {
      const asset = current();
      if (asset) {
        loaded = asset;
        asset.stop();
        return;
      }
      if (loading) {
        void loading.then((resolved) => resolved.stop()).catch(() => undefined);
      }
    },
    getLength(): number {
      return current()?.getLength() ?? 0;
    },
    setVolume(volume: number): void {
      whenLoaded((asset) => asset.setVolume(volume));
    },
    getVolume(): number {
      return current()?.getVolume() ?? 1;
    },
  };
  guardSpellings(sound, "sound");
  return sound;
}

function createLazyLoadedAsset<T>(context: LazyAssetContext<T>): T {
  void context.load().catch(() => undefined);
  const placeholder = {
    kind: context.kind,
    name: context.requested,
    url: fallbackAssetUrl(context),
  };

  return new Proxy(placeholder, {
    get(target, property, receiver) {
      if (property === "then") return undefined;
      const loaded = context.get() as Record<PropertyKey, unknown> | undefined;
      if (loaded && property in loaded) return loaded[property];
      return Reflect.get(target, property, receiver);
    },
  }) as T;
}

function fallbackAssetUrl(context: {
  readonly assetBaseUrl: string;
  readonly assetUrls: AssetUrls | undefined;
  readonly directory: string;
  readonly extensions: readonly string[];
  readonly projectId: string;
  readonly requested: string;
}): string {
  const candidates = candidateNames(context.requested, context.extensions);
  if (!context.assetUrls) {
    return locateAsset(context, candidates[0] ?? context.requested) ?? "";
  }
  // An asset map gives the first candidate it lists, if it lists one.
  for (const candidate of candidates) {
    const url = locateAsset(context, candidate);
    if (url !== undefined) return url;
  }
  return "";
}

async function loadFirstMatchingAsset<T>(
  options: AssetLoadOptions<T>,
  context: {
    readonly assetBaseUrl: string;
    readonly assetUrls: AssetUrls | undefined;
    readonly projectId: string;
    readonly requested: string;
  },
): Promise<{ asset: T; resolved: string }> {
  const candidates = candidateNames(context.requested, options.extensions);
  const loadAsset = options.loadAsset;
  const attemptedUrls: string[] = [];
  const causes: unknown[] = [];
  for (const candidate of candidates) {
    const url = locateAsset(
      { ...context, directory: options.directory },
      candidate,
    );
    if (url === undefined) {
      // An asset map that doesn't list it: nothing to load, so nothing is fetched.
      causes.push(
        new Error(`${options.directory}/${candidate} isn't in assetUrls.`),
      );
      continue;
    }
    attemptedUrls.push(url);
    if (!loadAsset) {
      causes.push(new Error("No asset loader is configured."));
      continue;
    }
    try {
      return {
        asset: await loadAsset(url, candidate),
        resolved: candidate,
      };
    } catch (error) {
      causes.push(error);
      // Try the next supported extension before reporting a clear missing asset.
    }
  }
  const cause =
    causes.length === 1
      ? causes[0]
      : new AggregateError(
          causes,
          `Every candidate for ${options.kind} asset ${context.requested} failed.`,
        );
  // The file is there, but the page can't fetch it: say why.
  const fromDiskPage = causes.find(
    (failure) =>
      (failure as { fromDiskPage?: boolean } | null)?.fromDiskPage === true,
  ) as Error | undefined;
  throw new MissingAssetError(options.kind, context.requested, {
    attemptedUrls,
    cause,
    ...(fromDiskPage ? { why: fromDiskPage.message } : {}),
  });
}

function candidateNames(name: string, extensions: readonly string[]): string[] {
  if (hasKnownExtension(name, extensions)) return [name];
  return extensions.map((extension) => `${name}.${extension}`);
}

function hasKnownExtension(
  name: string,
  extensions: readonly string[],
): boolean {
  return extensions.some((extension) => name.endsWith(`.${extension}`));
}

function stripKnownExtension(
  name: string,
  extensions: readonly string[],
): string {
  for (const extension of extensions) {
    if (name.endsWith(`.${extension}`))
      return name.slice(0, -extension.length - 1);
  }
  return name;
}

function getCached<T>(
  cache: Map<string, T>,
  aliases: Map<string, string>,
  requested: string,
): T | undefined {
  return cache.get(aliases.get(requested) ?? requested);
}

function requireAssetUrls(assetUrls: AssetUrls): AssetUrls {
  if (typeof assetUrls !== "object" || assetUrls === null) {
    throw new TypeError(
      'assetUrls must map asset paths to URLs, like { "images/cat.svg": url }.',
    );
  }
  for (const [path, url] of Object.entries(assetUrls)) {
    if (typeof url !== "string" || url.length === 0) {
      throw new TypeError(`assetUrls["${path}"] must be a URL string.`);
    }
  }
  return assetUrls;
}

function validateProjectId(projectId: string): string {
  if (!/^[a-z][a-z0-9_-]*$/.test(projectId)) {
    throw new TypeError(
      "projectId must be lowercase, start with a letter, and contain only letters, digits, underscores, or hyphens.",
    );
  }
  return projectId;
}

function applyRectPosition(rect: Rect, options: SurfaceRectOptions): void {
  const keys = rectPositionKeys.filter((key) => options[key] !== undefined);
  if (keys.length > 1) {
    throw new TypeError("getRect accepts at most one position keyword.");
  }
  const key = keys[0];
  if (!key) return;
  rect[key] = requirePoint(options[key], key);
}

function requirePositiveDimension(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  throw new TypeError(`${label} must be a positive finite number.`);
}

export function rectFromBlitTarget(target: Point | RectLike): Rect | Point {
  if (isPair(target)) return [target[0], target[1]];
  return new Rect(target);
}
