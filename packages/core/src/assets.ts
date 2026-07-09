import { createBrowserSoundAsset } from "./audio";
import { Rect, type Point, type RectLike } from "./geometry";
import {
  imageExtensions,
  isPair,
  rectPositionKeys,
  requirePoint,
  soundExtensions,
} from "./util";

export type AssetKind = "image" | "sound" | "music" | "font";

export type AssetLoadOptions<T> = {
  readonly kind: AssetKind;
  readonly directory: string;
  readonly extensions: readonly string[];
  readonly projectId?: string;
  readonly assetBaseUrl?: string;
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
  get_width(): number;
  get_height(): number;
  get_size(): Point;
  get_rect(options?: SurfaceRectOptions): Rect;
}

export type LoadedAsset = {
  readonly kind: AssetKind;
  readonly name: string;
  readonly url: string;
  readonly bytes?: ArrayBuffer;
};

export type SoundAsset = LoadedAsset & {
  play(loops?: number): void;
  stop(): void;
  get_length(): number;
  set_volume(volume: number): void;
  get_volume(): number;
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
  readonly extensions: readonly string[];
  readonly directory: string;
  load(name: string): Promise<T>;
  get(name: string): T | undefined;
  has(name: string): boolean;
  define(name: string, asset: T): T;
  unload(name: string): boolean;
  unload_all(): void;
  unloadAll(): void;
  cache_keys(): string[];
  /**
   * Number of loads currently in flight (started but not yet settled).
   * Used by the runtime's preload gate to hold frames until assets that
   * were requested during module evaluation (or mid-game) have resolved.
   */
  pendingCount(): number;
  /**
   * Resolves once there are no in-flight loads. Re-checks after each
   * settle so loads triggered while waiting are also awaited.
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
  | "topleft"
  | "topright"
  | "bottomleft"
  | "bottomright"
  | "midtop"
  | "midleft"
  | "midright"
  | "midbottom"
  | "center";

const fontExtensions = ["ttf", "otf", "woff", "woff2"];

export class MissingAssetError extends Error {
  readonly kind: AssetKind;
  readonly assetName: string;

  constructor(kind: AssetKind, name: string) {
    super(`Missing ${kind} asset: ${name}`);
    this.name = "MissingAssetError";
    this.kind = kind;
    this.assetName = name;
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

  get_width(): number {
    return this.width;
  }

  get_height(): number {
    return this.height;
  }

  get_size(): Point {
    return [this.width, this.height];
  }

  get_rect(options: SurfaceRectOptions = {}): Rect {
    const rect = new Rect(0, 0, this.width, this.height);
    applyRectPosition(rect, options);
    return rect;
  }
}

export function createImageLoader(
  options: AssetLoaderOptions<SurfaceLike> = {},
): AssetLoader<SurfaceLike> {
  return createAssetLoader<SurfaceLike>({
    kind: "image",
    directory: "images",
    extensions: imageExtensions,
    ...options,
    loadAsset: options.loadAsset ?? loadBrowserImage,
  });
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

export const images = createImageLoader();
export const sounds = createSoundLoader();
export const musicAssets = createMusicLoader();
export const fonts = createFontLoader();

function createAssetLoader<T>(options: AssetLoadOptions<T>): AssetLoader<T> {
  const projectId = validateProjectId(options.projectId ?? "default");
  const assetBaseUrl = options.assetBaseUrl ?? "/assets";
  const cache = new Map<string, T>();
  const aliases = new Map<string, string>();
  const pending = new Map<string, Promise<T>>();
  const lazyProperties = new Map<string, T>();
  const target: AssetLoader<T> = {
    kind: options.kind,
    projectId,
    assetBaseUrl,
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
          if (error instanceof MissingAssetError) throw error;
          throw new MissingAssetError(options.kind, requested);
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
    unload_all(): void {
      cache.clear();
      aliases.clear();
      pending.clear();
      lazyProperties.clear();
    },
    unloadAll(): void {
      this.unload_all();
    },
    cache_keys(): string[] {
      return [...cache.keys()].sort();
    },
    pendingCount(): number {
      return pending.size;
    },
    async waitForIdle(): Promise<void> {
      while (pending.size > 0) {
        await Promise.allSettled([...pending.values()]);
      }
    },
  };

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
  void context.load().catch(() => undefined);

  const loaded = (): SurfaceLike => {
    const asset = context.get();
    if (!asset) throw new MissingAssetError(context.kind, context.requested);
    return asset;
  };

  return {
    get source(): DrawableImage {
      return loaded().source;
    },
    get_width(): number {
      return loaded().get_width();
    },
    get_height(): number {
      return loaded().get_height();
    },
    get_size(): Point {
      return loaded().get_size();
    },
    get_rect(options?: SurfaceRectOptions): Rect {
      return loaded().get_rect(options);
    },
  };
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
    void ensure().then(callback);
  };

  return {
    kind: "sound",
    name: context.requested,
    get url(): string {
      return current()?.url ?? fallbackAssetUrl(context);
    },
    play(loops = 0): void {
      whenLoaded((asset) => asset.play(loops));
    },
    stop(): void {
      const asset = current();
      if (asset) {
        loaded = asset;
        asset.stop();
        return;
      }
      void loading?.then((resolved) => resolved.stop());
    },
    get_length(): number {
      return current()?.get_length() ?? 0;
    },
    set_volume(volume: number): void {
      whenLoaded((asset) => asset.set_volume(volume));
    },
    get_volume(): number {
      return current()?.get_volume() ?? 1;
    },
  };
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
  readonly directory: string;
  readonly extensions: readonly string[];
  readonly projectId: string;
  readonly requested: string;
}): string {
  const [candidate = context.requested] = candidateNames(
    context.requested,
    context.extensions,
  );
  return assetUrl(
    context.assetBaseUrl,
    context.projectId,
    context.directory,
    candidate,
  );
}

async function loadFirstMatchingAsset<T>(
  options: AssetLoadOptions<T>,
  context: {
    readonly assetBaseUrl: string;
    readonly projectId: string;
    readonly requested: string;
  },
): Promise<{ asset: T; resolved: string }> {
  const candidates = candidateNames(context.requested, options.extensions);
  const loadAsset = options.loadAsset;
  if (!loadAsset) throw new MissingAssetError(options.kind, context.requested);
  for (const candidate of candidates) {
    try {
      const url = assetUrl(
        context.assetBaseUrl,
        context.projectId,
        options.directory,
        candidate,
      );
      return {
        asset: await loadAsset(url, candidate),
        resolved: candidate,
      };
    } catch {
      // Try the next supported extension before reporting a clear missing asset.
    }
  }
  throw new MissingAssetError(options.kind, context.requested);
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

function validateProjectId(projectId: string): string {
  if (!/^[a-z][a-z0-9_-]*$/.test(projectId)) {
    throw new TypeError(
      "projectId must be lowercase, start with a letter, and contain only letters, digits, underscores, or hyphens.",
    );
  }
  return projectId;
}

async function loadBrowserImage(url: string): Promise<SurfaceLike> {
  const ImageConstructor = globalThis.Image;
  if (typeof ImageConstructor !== "function") {
    throw new MissingAssetError("image", url);
  }
  const image = new ImageConstructor();
  image.decoding = "async";
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("image load failed")),
      {
        once: true,
      },
    );
  });
  image.src = url;
  return new ImageSurface(await loaded);
}

async function loadSoundAsset(url: string, name: string): Promise<SoundAsset> {
  const bytes = await fetchBytes(url);
  return createBrowserSoundAsset({
    kind: "sound",
    name,
    url,
    bytes,
  });
}

async function loadMusicAsset(url: string, name: string): Promise<MusicAsset> {
  return {
    kind: "music",
    name,
    url,
    bytes: await fetchBytes(url),
  };
}

async function loadFontAsset(url: string, name: string): Promise<FontAsset> {
  const bytes = await fetchBytes(url);
  const family = stripKnownExtension(
    name.split("/").at(-1) ?? name,
    fontExtensions,
  );
  let face: FontFace | undefined;
  if (typeof globalThis.FontFace === "function") {
    face = new FontFace(family, bytes);
    await face.load();
    globalThis.document?.fonts?.add(face);
  }
  return {
    kind: "font",
    name,
    url,
    bytes,
    family,
    ...(face ? { face } : {}),
  };
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("fetch is not available");
  }
  const response = await globalThis.fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.arrayBuffer();
}

function applyRectPosition(rect: Rect, options: SurfaceRectOptions): void {
  const keys = rectPositionKeys.filter((key) => options[key] !== undefined);
  if (keys.length > 1) {
    throw new TypeError("get_rect accepts at most one position keyword.");
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
