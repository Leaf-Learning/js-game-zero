import { describe, expect, test } from "bun:test";
import {
  ImageSurface,
  MissingAssetError,
  assetUrl,
  createFontLoader,
  createImageLoader,
  createMusicLoader,
  createSoundLoader,
  validateAssetName,
  type DrawableImage,
  type FontAsset,
  type MusicAsset,
  type SoundAsset,
  type SurfaceLike,
} from "@js-game-zero/core";

function surface(width = 32, height = 16): SurfaceLike {
  return new ImageSurface(
    { width, height } as unknown as DrawableImage,
    width,
    height,
  );
}

describe("asset name validation and URL roots", () => {
  test("accepts lowercase portable names and nested directories", () => {
    expect(validateAssetName("image", "player.svg", ["svg"])).toBe(
      "player.svg",
    );
    expect(validateAssetName("image", "sprites/player_idle.png", ["png"])).toBe(
      "sprites/player_idle.png",
    );
    expect(
      assetUrl("/assets/", "phase_three", "images", "sprites/player_idle.png"),
    ).toBe("/assets/phase_three/images/sprites/player_idle.png");
  });

  test("rejects traversal, absolute paths, mixed case, and digit starts", () => {
    for (const name of [
      "../player.svg",
      "/player.svg",
      "Player.svg",
      "2player.svg",
      "sprites/2player.svg",
      "player.bad",
      "player.extra.svg",
      "sprites//player.svg",
    ]) {
      expect(() => validateAssetName("image", name, ["svg"])).toThrow(
        TypeError,
      );
    }
  });
});

describe("image loader cache and surfaces", () => {
  test("loads extensionless names, caches hits, unloads, and reports dimensions", async () => {
    const calls: string[] = [];
    const loader = createImageLoader({
      projectId: "phase_three",
      assetBaseUrl: "/game-assets",
      async loadAsset(url, name) {
        calls.push(`${name}@${url}`);
        if (name === "sprites/player.svg") return surface(20, 10);
        throw new Error("missing");
      },
    });

    const first = await loader.load("sprites/player");
    const second = await loader.load("sprites/player");
    const explicit = await loader.load("sprites/player.svg");

    expect(first).toBe(second);
    expect(explicit).toBe(first);
    expect(calls).toEqual([
      "sprites/player.png@/game-assets/phase_three/images/sprites/player.png",
      "sprites/player.gif@/game-assets/phase_three/images/sprites/player.gif",
      "sprites/player.jpg@/game-assets/phase_three/images/sprites/player.jpg",
      "sprites/player.jpeg@/game-assets/phase_three/images/sprites/player.jpeg",
      "sprites/player.bmp@/game-assets/phase_three/images/sprites/player.bmp",
      "sprites/player.webp@/game-assets/phase_three/images/sprites/player.webp",
      "sprites/player.svg@/game-assets/phase_three/images/sprites/player.svg",
    ]);
    expect(first.get_width()).toBe(20);
    expect(first.get_height()).toBe(10);
    expect(first.get_size()).toEqual([20, 10]);
    expect(first.get_rect({ center: [50, 60] })).toMatchObject({
      left: 40,
      top: 55,
      width: 20,
      height: 10,
    });
    expect(loader.has("sprites/player")).toBe(true);
    expect(loader.unload("sprites/player")).toBe(true);
    expect(loader.has("sprites/player.svg")).toBe(false);
    expect((await loader.load("sprites/player.svg")).get_size()).toEqual([
      20, 10,
    ]);
    loader.unload_all();
    expect(loader.cache_keys()).toEqual([]);
  });

  test("throws a clear missing asset error", async () => {
    const loader = createImageLoader({
      projectId: "phase_three",
      loadAsset: async () => {
        throw new Error("not found");
      },
    });
    await expect(loader.load("ghost.svg")).rejects.toBeInstanceOf(
      MissingAssetError,
    );
  });

  test("returns cached image assets through PGZero-style property access", () => {
    const loader = createImageLoader({ projectId: "phase_three" });
    const player = surface(20, 10);

    loader.define("player.svg", player);

    const assets = loader as unknown as Record<string, SurfaceLike>;
    const playerProperty = assets.player;
    expect(playerProperty).toBe(player);
    if (!playerProperty) throw new Error("Missing player property asset.");
    expect(playerProperty.get_width()).toBe(20);
    expect(playerProperty.get_rect({ center: [50, 60] })).toMatchObject({
      left: 40,
      top: 55,
      width: 20,
      height: 10,
    });
  });
});

describe("sound, music, and font loaders", () => {
  test("cache and unload inert Phase 03 assets", async () => {
    const soundLoader = createSoundLoader({
      projectId: "phase_three",
      loadAsset: async (url, name): Promise<SoundAsset> => ({
        kind: "sound",
        name,
        url,
        play() {},
        stop() {},
        get_length: () => 0,
        set_volume() {},
        get_volume: () => 1,
      }),
    });
    const musicLoader = createMusicLoader({
      projectId: "phase_three",
      loadAsset: async (url, name): Promise<MusicAsset> => ({
        kind: "music",
        name,
        url,
      }),
    });
    const fontLoader = createFontLoader({
      projectId: "phase_three",
      loadAsset: async (url, name): Promise<FontAsset> => ({
        kind: "font",
        name,
        url,
        family: "phase",
      }),
    });

    expect(await soundLoader.load("tap.wav")).toBe(
      await soundLoader.load("tap.wav"),
    );
    expect(await musicLoader.load("theme.ogg")).toBe(
      await musicLoader.load("theme.ogg"),
    );
    expect(await fontLoader.load("ui.woff")).toBe(
      await fontLoader.load("ui.woff"),
    );
    expect(soundLoader.unload("tap.wav")).toBe(true);
    expect(musicLoader.unload("theme.ogg")).toBe(true);
    fontLoader.unloadAll();
    expect(fontLoader.cache_keys()).toEqual([]);
  });

  test("returns cached sound assets through PGZero-style property access", () => {
    const loops: number[] = [];
    const sound: SoundAsset = {
      kind: "sound",
      name: "tap.wav",
      url: "/assets/default/sounds/tap.wav",
      play(loopCount = 0) {
        loops.push(loopCount);
      },
      stop() {},
      get_length: () => 0.25,
      set_volume() {},
      get_volume: () => 1,
    };
    const soundLoader = createSoundLoader({ projectId: "phase_three" });

    soundLoader.define("tap.wav", sound);
    const assets = soundLoader as unknown as Record<string, SoundAsset>;

    expect(assets.tap).toBe(sound);
    const tap = assets.tap;
    if (!tap) throw new Error("Missing tap property asset.");
    tap.play(2);
    expect(loops).toEqual([2]);
    expect(tap.get_length()).toBe(0.25);
  });

  test("lazy sound property access loads before playing", async () => {
    const loops: number[] = [];
    const soundLoader = createSoundLoader({
      projectId: "phase_three",
      async loadAsset(url, name): Promise<SoundAsset> {
        return {
          kind: "sound",
          name,
          url,
          play(loopCount = 0) {
            loops.push(loopCount);
          },
          stop() {},
          get_length: () => 0.5,
          set_volume() {},
          get_volume: () => 1,
        };
      },
    });
    const assets = soundLoader as unknown as Record<string, SoundAsset>;
    const tap = assets.tap;
    if (!tap) throw new Error("Missing lazy tap property asset.");

    expect(typeof tap.play).toBe("function");
    expect((tap as unknown as { then?: unknown }).then).toBeUndefined();
    tap.play(1);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loops).toEqual([1]);
    expect(soundLoader.has("tap.wav")).toBe(true);
    expect(assets.tap).toBe(soundLoader.get("tap"));
  });

  test("default font loader fetches bytes and loads a FontFace when available", async () => {
    const originalFetch = globalThis.fetch;
    const originalFontFace = globalThis.FontFace;
    const loadedFamilies: string[] = [];

    class MockFontFace {
      readonly family: string;
      readonly source: BufferSource;

      constructor(family: string, source: BufferSource) {
        this.family = family;
        this.source = source;
      }

      async load(): Promise<this> {
        loadedFamilies.push(this.family);
        return this;
      }
    }

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async () => new Response(new Uint8Array([1, 2, 3])),
    });
    Object.defineProperty(globalThis, "FontFace", {
      configurable: true,
      value: MockFontFace,
    });

    try {
      const loader = createFontLoader({
        projectId: "phase_three",
        assetBaseUrl: "/assets",
      });
      const asset = await loader.load("ui.woff");
      expect(asset.family).toBe("ui");
      expect(asset.bytes?.byteLength).toBe(3);
      expect(asset.face).toBeInstanceOf(MockFontFace);
      expect(loadedFamilies).toEqual(["ui"]);
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch,
      });
      Object.defineProperty(globalThis, "FontFace", {
        configurable: true,
        value: originalFontFace,
      });
    }
  });
});
