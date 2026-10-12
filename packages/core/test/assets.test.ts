import { describe, expect, test } from "bun:test";
import {
  ImageSurface,
  MissingAssetError,
  type DrawableImage,
  type FontAsset,
  type MusicAsset,
  type SoundAsset,
  type SurfaceLike,
} from "@js-game-zero/core";
import {
  assetUrl,
  createFontLoader,
  createImageLoader,
  createMusicLoader,
  createSoundLoader,
  validateAssetName,
} from "@js-game-zero/core/host";

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
      assetUrl("/assets/", "test_project", "images", "sprites/player_idle.png"),
    ).toBe("/assets/test_project/images/sprites/player_idle.png");
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
      projectId: "test_project",
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
      "sprites/player.png@/game-assets/test_project/images/sprites/player.png",
      "sprites/player.gif@/game-assets/test_project/images/sprites/player.gif",
      "sprites/player.jpg@/game-assets/test_project/images/sprites/player.jpg",
      "sprites/player.jpeg@/game-assets/test_project/images/sprites/player.jpeg",
      "sprites/player.bmp@/game-assets/test_project/images/sprites/player.bmp",
      "sprites/player.webp@/game-assets/test_project/images/sprites/player.webp",
      "sprites/player.svg@/game-assets/test_project/images/sprites/player.svg",
    ]);
    expect(first.getWidth()).toBe(20);
    expect(first.getHeight()).toBe(10);
    expect(first.getSize()).toEqual([20, 10]);
    expect(first.getRect({ center: [50, 60] })).toMatchObject({
      left: 40,
      top: 55,
      width: 20,
      height: 10,
    });
    expect(loader.has("sprites/player")).toBe(true);
    expect(loader.unload("sprites/player")).toBe(true);
    expect(loader.has("sprites/player.svg")).toBe(false);
    expect((await loader.load("sprites/player.svg")).getSize()).toEqual([
      20, 10,
    ]);
    loader.unloadAll();
    expect(loader.cacheKeys()).toEqual([]);
  });

  test("throws a clear missing asset error", async () => {
    const backendError = new Error("not found");
    const loader = createImageLoader({
      projectId: "test_project",
      loadAsset: async () => {
        throw backendError;
      },
    });
    const failure = await loader
      .load("ghost.svg")
      .catch((error: unknown) =>
        error instanceof MissingAssetError ? error : Promise.reject(error),
      );
    expect(failure).toBeInstanceOf(MissingAssetError);
    if (!(failure instanceof MissingAssetError)) {
      throw new Error("Expected a MissingAssetError.");
    }
    expect(failure.attemptedUrls).toEqual([
      "/assets/test_project/images/ghost.svg",
    ]);
    expect(failure.cause).toBe(backendError);
    expect(failure.message).toContain("/assets/test_project/images/ghost.svg");
  });

  test("returns cached image assets through PGZero-style property access", () => {
    const loader = createImageLoader({ projectId: "test_project" });
    const player = surface(20, 10);

    loader.define("player.svg", player);

    const assets = loader as unknown as Record<string, SurfaceLike>;
    const playerProperty = assets.player;
    expect(playerProperty).toBe(player);
    if (!playerProperty) throw new Error("Missing player property asset.");
    expect(playerProperty.getWidth()).toBe(20);
    expect(playerProperty.getRect({ center: [50, 60] })).toMatchObject({
      left: 40,
      top: 55,
      width: 20,
      height: 10,
    });
  });

  test("returns loaded image assets through property access after preload", async () => {
    const loader = createImageLoader({
      projectId: "test_project",
      async loadAsset(_url, name) {
        if (name === "player.svg") return surface(32, 24);
        throw new Error("missing");
      },
    });

    await loader.load("player.svg");
    const player = (loader as unknown as Record<string, SurfaceLike>).player;

    if (!player) throw new Error("Missing loaded player property asset.");
    expect(player.getSize()).toEqual([32, 24]);
    expect(player.getRect().size).toEqual([32, 24]);
  });

  test("pendingCount and waitForIdle track in-flight loads for the runtime preload gate", async () => {
    let releaseFirst: (() => void) | undefined;
    const loader = createImageLoader({
      projectId: "test_project",
      loadAsset: async (_url, name) => {
        if (name === "first.svg") {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return surface(
          name === "first.svg" ? 4 : 6,
          name === "first.svg" ? 4 : 6,
        );
      },
    });

    expect(loader.pendingCount()).toBe(0);
    const firstLoad = loader.load("first.svg");
    expect(loader.pendingCount()).toBe(1);

    const idle = loader.waitForIdle();
    releaseFirst?.();
    await firstLoad;
    await idle;

    expect(loader.pendingCount()).toBe(0);
  });

  test("pendingCount clears after a load rejects, and waitForIdle reports the settled failure", async () => {
    const loader = createImageLoader({
      projectId: "test_project",
      loadAsset: async () => {
        throw new Error("boom");
      },
    });

    const rejected = loader.load("ghost.svg").catch(() => "handled");
    expect(loader.pendingCount()).toBe(1);

    await expect(loader.waitForIdle()).rejects.toBeInstanceOf(
      MissingAssetError,
    );
    expect(loader.pendingCount()).toBe(0);
    expect(await rejected).toBe("handled");
    // Failures are consumed once reported rather than poisoning every later
    // idle wait.
    await expect(loader.waitForIdle()).resolves.toBeUndefined();
  });

  test("failed lazy sound access does not create an unhandled rejection", async () => {
    const loader = createSoundLoader({
      projectId: "test_project",
      loadAsset: async () => {
        throw new Error("missing lazy sound");
      },
    });
    const ghost = (loader as unknown as Record<string, SoundAsset>).ghost;
    if (!ghost) throw new Error("Missing lazy sound placeholder.");

    ghost.play();
    await expect(loader.waitForIdle()).rejects.toBeInstanceOf(
      MissingAssetError,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loader.pendingCount()).toBe(0);
  });

  test("caps settledFailures at 32 and clears them once consumed", async () => {
    const loader = createImageLoader({
      projectId: "test_project",
      loadAsset: async () => {
        throw new Error("boom");
      },
    });

    // A game that keeps retrying a permanently-missing asset (e.g. on a
    // timer) must not grow the failure buffer without bound.
    for (let index = 0; index < 40; index += 1) {
      await loader.load("ghost.svg").catch(() => undefined);
    }

    const failure = await loader.waitForIdle().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toHaveLength(32);

    // Consuming the failures via waitForIdle() clears the buffer, so a
    // later idle wait isn't poisoned by stale retries.
    await expect(loader.waitForIdle()).resolves.toBeUndefined();
  });

  test("waitForIdle re-checks so a load started while waiting is also awaited", async () => {
    const loadedNames: string[] = [];
    const loader = createImageLoader({
      projectId: "test_project",
      loadAsset: async (_url, name) => {
        loadedNames.push(name);
        if (name === "chain_one.svg") {
          // Triggers a second, unrelated load before this one resolves.
          void loader.load("chain_two.svg");
        }
        return surface(1, 1);
      },
    });

    void loader.load("chain_one.svg");
    await loader.waitForIdle();

    expect(loader.pendingCount()).toBe(0);
    expect(loadedNames).toContain("chain_one.svg");
    expect(loadedNames).toContain("chain_two.svg");
  });
});

describe("sound, music, and font loaders", () => {
  test("cache and unload inert test assets", async () => {
    const soundLoader = createSoundLoader({
      projectId: "test_project",
      loadAsset: async (url, name): Promise<SoundAsset> => ({
        kind: "sound",
        name,
        url,
        play() {},
        loop() {},
        stop() {},
        getLength: () => 0,
        setVolume() {},
        getVolume: () => 1,
      }),
    });
    const musicLoader = createMusicLoader({
      projectId: "test_project",
      loadAsset: async (url, name): Promise<MusicAsset> => ({
        kind: "music",
        name,
        url,
      }),
    });
    const fontLoader = createFontLoader({
      projectId: "test_project",
      loadAsset: async (url, name): Promise<FontAsset> => ({
        kind: "font",
        name,
        url,
        family: "sample",
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

    // unloadAll() clears a populated cache to empty.
    expect(fontLoader.cacheKeys()).toEqual(["ui.woff"]);
    expect(fontLoader.has("ui.woff")).toBe(true);
    fontLoader.unloadAll();
    expect(fontLoader.cacheKeys()).toEqual([]);
    expect(fontLoader.has("ui.woff")).toBe(false);
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
      loop() {
        loops.push(-1);
      },
      stop() {},
      getLength: () => 0.25,
      setVolume() {},
      getVolume: () => 1,
    };
    const soundLoader = createSoundLoader({ projectId: "test_project" });

    soundLoader.define("tap.wav", sound);
    const assets = soundLoader as unknown as Record<string, SoundAsset>;

    expect(assets.tap).toBe(sound);
    const tap = assets.tap;
    if (!tap) throw new Error("Missing tap property asset.");
    tap.play(2);
    expect(loops).toEqual([2]);
    expect(tap.getLength()).toBe(0.25);
  });

  test("lazy sound property access loads before playing", async () => {
    const loops: number[] = [];
    const soundLoader = createSoundLoader({
      projectId: "test_project",
      async loadAsset(url, name): Promise<SoundAsset> {
        return {
          kind: "sound",
          name,
          url,
          play(loopCount = 0) {
            loops.push(loopCount);
          },
          loop() {
            loops.push(-1);
          },
          stop() {},
          getLength: () => 0.5,
          setVolume() {},
          getVolume: () => 1,
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

  test("a lazy sound loops forever, even if its host asset predates loop()", async () => {
    const loops: number[] = [];
    const soundLoader = createSoundLoader({
      projectId: "test_project",
      async loadAsset(url, name): Promise<SoundAsset> {
        const asset = {
          kind: "sound" as const,
          name,
          url,
          play(loopCount = 0) {
            loops.push(loopCount);
          },
          stop() {},
          getLength: () => 0.5,
          setVolume() {},
          getVolume: () => 1,
        };
        return asset as unknown as SoundAsset;
      },
    });
    const assets = soundLoader as unknown as Record<string, SoundAsset>;
    assets.engine?.loop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loops).toEqual([-1]);
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
        projectId: "test_project",
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
