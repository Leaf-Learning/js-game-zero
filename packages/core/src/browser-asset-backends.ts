import { createBrowserSoundAsset } from "./audio";
import type { FontAsset, MusicAsset, SoundAsset, SurfaceLike } from "./assets";

export const fontExtensions = ["ttf", "otf", "woff", "woff2"] as const;

export async function loadBrowserImage(
  url: string,
  createSurface: (image: HTMLImageElement) => SurfaceLike,
): Promise<SurfaceLike> {
  const ImageConstructor = globalThis.Image;
  if (typeof ImageConstructor !== "function") {
    throw new Error("HTML Image is not available in this environment.");
  }
  const image = new ImageConstructor();
  image.decoding = "async";
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("image load failed")),
      { once: true },
    );
  });
  image.src = url;
  return createSurface(await loaded);
}

export async function loadSoundAsset(
  url: string,
  name: string,
): Promise<SoundAsset> {
  const bytes = await fetchBytes(url);
  return createBrowserSoundAsset({
    kind: "sound",
    name,
    url,
    bytes,
  });
}

export async function loadMusicAsset(
  url: string,
  name: string,
): Promise<MusicAsset> {
  return {
    kind: "music",
    name,
    url,
    bytes: await fetchBytes(url),
  };
}

export async function loadFontAsset(
  url: string,
  name: string,
): Promise<FontAsset> {
  const bytes = await fetchBytes(url);
  const filename = name.split("/").at(-1) ?? name;
  const family = stripExtension(filename, fontExtensions);
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

function stripExtension(name: string, extensions: readonly string[]): string {
  for (const extension of extensions) {
    if (name.endsWith(`.${extension}`)) {
      return name.slice(0, -extension.length - 1);
    }
  }
  return name;
}
