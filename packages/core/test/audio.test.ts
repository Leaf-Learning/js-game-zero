import { describe, expect, test } from "bun:test";
import { MissingAssetError, type MusicAsset } from "@js-game-zero/core";
import {
  AudioUnlockState,
  createBrowserSoundAsset,
  createMusicLoader,
  createMusicPlayer,
  createSoundLoader,
  type AudioElementLike,
} from "@js-game-zero/core/host";

class MockAudioElement implements AudioElementLike {
  src: string;
  loop = false;
  currentTime = 0;
  volume = 1;
  duration = 1.25;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  rejectPlay = false;
  private readonly endedListeners = new Set<() => void>();

  constructor(src: string) {
    this.src = src;
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (this.rejectPlay) return Promise.reject(new Error("codec unsupported"));
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }

  addEventListener(type: "ended", listener: () => void): void {
    if (type === "ended") this.endedListeners.add(listener);
  }

  removeEventListener(type: "ended", listener: () => void): void {
    if (type === "ended") this.endedListeners.delete(listener);
  }

  emitEnded(): void {
    for (const listener of [...this.endedListeners]) listener();
  }
}

class ManualScheduler {
  private now = 0;
  private nextId = 0;
  private readonly timers = new Map<
    number,
    { readonly at: number; readonly callback: () => void }
  >();

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, { at: this.now + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(Number(handle));
  }

  advance(ms: number): void {
    this.now += ms;
    const due = [...this.timers.entries()]
      .filter(([, timer]) => timer.at <= this.now)
      .sort((a, b) => a[1].at - b[1].at);
    for (const [id, timer] of due) {
      if (!this.timers.delete(id)) continue;
      timer.callback();
    }
  }
}

function soundFixture(options: { rejectPlay?: boolean } = {}) {
  const elements: MockAudioElement[] = [];
  const unlockState = new AudioUnlockState();
  const sound = createBrowserSoundAsset(
    { kind: "sound", name: "hit.wav", url: "/sounds/hit.wav" },
    {
      unlockState,
      createAudioElement(url) {
        const element = new MockAudioElement(url);
        element.rejectPlay = options.rejectPlay ?? false;
        elements.push(element);
        return element;
      },
    },
  );
  return { sound, elements, unlockState };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("browser sound effects", () => {
  test("play once, stop, duration, volume, and unlock state use audio elements", async () => {
    const { sound, elements } = soundFixture();

    sound.setVolume(0.35);
    sound.play();
    const element = elements[0];
    expect(element).toBeTruthy();
    if (!element) throw new Error("Missing mock audio element.");
    await Promise.resolve();

    expect(element.src).toBe("/sounds/hit.wav");
    expect(element.playCalls).toBe(1);
    expect(element.loop).toBe(false);
    expect(element.volume).toBe(0.35);
    expect(sound.getVolume()).toBe(0.35);
    expect(sound.getLength()).toBe(1.25);
    expect(sound.debugState()).toMatchObject({
      active: true,
      unlocked: true,
      lastError: null,
    });

    sound.stop();
    expect(element.pauseCalls).toBe(1);
    expect(element.currentTime).toBe(0);
    expect(sound.debugState().active).toBe(false);
  });

  test("finite loop counts replay FIFO-style and -1 loops forever", () => {
    const { sound, elements } = soundFixture();

    sound.play(2);
    const finite = elements[0];
    expect(finite).toBeTruthy();
    if (!finite) throw new Error("Missing finite loop element.");
    finite.emitEnded();
    finite.emitEnded();
    expect(finite.playCalls).toBe(3);
    expect(sound.debugState().active).toBe(true);
    finite.emitEnded();
    expect(sound.debugState().active).toBe(false);

    sound.play(-1);
    const infinite = elements[1];
    expect(infinite).toBeTruthy();
    if (!infinite) throw new Error("Missing infinite loop element.");
    expect(infinite.loop).toBe(true);
    infinite.emitEnded();
    expect(infinite.playCalls).toBe(1);
    expect(sound.debugState().loop).toBe(true);
  });

  test("loop() plays until stop, and a bad loop count explains itself", () => {
    const { sound, elements } = soundFixture();
    sound.loop();
    expect(elements[0]?.loop).toBe(true);
    expect(sound.debugState().loop).toBe(true);
    sound.stop();
    expect(sound.debugState().active).toBe(false);
    expect(() => sound.play(1.5)).toThrow("2 plays it three times");
  });

  test("play errors are captured without throwing and missing assets stay explicit", async () => {
    const { sound } = soundFixture({ rejectPlay: true });
    expect(() => sound.play()).not.toThrow();
    await flushAsyncWork();
    expect(sound.debugState().lastError).toBe("codec unsupported");
    expect(sound.debugState()).toMatchObject({
      active: false,
      unlocked: false,
    });

    const loader = createSoundLoader({
      loadAsset: async () => {
        throw new Error("missing");
      },
    });
    await expect(loader.load("ghost.wav")).rejects.toBeInstanceOf(
      MissingAssetError,
    );
  });

  test("play() overlaps rather than stopping prior instances, like pygame Sounds mixing on channels", async () => {
    const { sound, elements } = soundFixture();

    sound.play();
    sound.play();
    const [first, second] = elements;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    if (!first || !second) throw new Error("Missing mock audio elements.");
    await Promise.resolve();

    // Both instances are distinct audio elements that are actively playing
    // at the same time -- the second play() must not have stopped the first.
    expect(first.playCalls).toBe(1);
    expect(second.playCalls).toBe(1);
    expect(first.paused).toBe(false);
    expect(second.paused).toBe(false);
    expect(first.pauseCalls).toBe(0);
    expect(sound.debugInstanceCount()).toBe(2);
    expect(sound.debugState().active).toBe(true);

    sound.stop();
    expect(first.paused).toBe(true);
    expect(second.paused).toBe(true);
    expect(sound.debugInstanceCount()).toBe(0);
    expect(sound.debugState().active).toBe(false);
  });

  test("setVolume applies to already-playing instances and future ones", () => {
    const { sound, elements } = soundFixture();

    sound.play();
    sound.setVolume(0.2);
    sound.play();

    expect(elements[0]?.volume).toBe(0.2);
    expect(elements[1]?.volume).toBe(0.2);
  });
});

describe("music player", () => {
  function musicFixture() {
    const elements: MockAudioElement[] = [];
    const ended: string[] = [];
    const scheduler = new ManualScheduler();
    const loader = createMusicLoader({
      projectId: "test_project",
      loadAsset: async (url, name): Promise<MusicAsset> => ({
        kind: "music",
        name,
        url,
      }),
    });
    const player = createMusicPlayer({
      loader,
      scheduler,
      onMusicEnd: () => ended.push("end"),
      createAudioElement(url) {
        const element = new MockAudioElement(url);
        element.duration = 0.5;
        elements.push(element);
        return element;
      },
    });
    return { player, elements, ended, scheduler };
  }

  test("play replaces active music and clears queued tracks", async () => {
    const { player, elements } = musicFixture();

    await player.play("theme.ogg");
    await player.queue("next.ogg");
    await player.play("boss.ogg");

    expect(elements[0]?.pauseCalls).toBe(1);
    expect(player.debugState()).toMatchObject({
      current: "boss.ogg",
      queued: [],
      isPlaying: true,
    });
    expect(elements[1]?.loop).toBe(true);
  });

  test("stop invalidates a track that is still loading", async () => {
    const loading = deferred<MusicAsset>();
    const elements: MockAudioElement[] = [];
    const loader = createMusicLoader({
      projectId: "test_project",
      loadAsset: () => loading.promise,
    });
    const player = createMusicPlayer({
      loader,
      createAudioElement(url) {
        const element = new MockAudioElement(url);
        elements.push(element);
        return element;
      },
    });

    const play = player.playOnce("slow.ogg");
    await Promise.resolve();
    player.stop();
    loading.resolve({
      kind: "music",
      name: "slow.ogg",
      url: "/assets/test_project/music/slow.ogg",
    });
    await play;

    expect(elements).toHaveLength(0);
    expect(player.debugState()).toMatchObject({
      current: null,
      queued: [],
      isPlaying: false,
    });
  });

  test("music asset load failures are recoverable and reported without rejecting play", async () => {
    const reported: unknown[] = [];
    const loader = createMusicLoader({
      projectId: "test_project",
      loadAsset: async () => {
        throw new Error("music fetch failed");
      },
    });
    const player = createMusicPlayer({
      loader,
      onError: (error) => reported.push(error),
      createAudioElement: (url) => new MockAudioElement(url),
    });

    await expect(player.playOnce("missing.ogg")).resolves.toBeUndefined();

    expect(reported).toHaveLength(1);
    expect(reported[0]).toBeInstanceOf(MissingAssetError);
    expect(player.debugState()).toMatchObject({
      current: null,
      isPlaying: false,
    });
    expect(player.debugState().lastError).toContain("missing.ogg");
  });

  test("a newer play wins even when an older load resolves last", async () => {
    const slow = deferred<MusicAsset>();
    const fast = deferred<MusicAsset>();
    const elements: MockAudioElement[] = [];
    const loader = createMusicLoader({
      projectId: "test_project",
      loadAsset(_url, name) {
        return name === "slow.ogg" ? slow.promise : fast.promise;
      },
    });
    const player = createMusicPlayer({
      loader,
      createAudioElement(url) {
        const element = new MockAudioElement(url);
        elements.push(element);
        return element;
      },
    });

    const firstPlay = player.playOnce("slow.ogg");
    await Promise.resolve();
    const secondPlay = player.playOnce("fast.ogg");
    fast.resolve({ kind: "music", name: "fast.ogg", url: "/fast.ogg" });
    await secondPlay;
    slow.resolve({ kind: "music", name: "slow.ogg", url: "/slow.ogg" });
    await firstPlay;

    expect(elements.map((element) => element.src)).toEqual(["/fast.ogg"]);
    expect(player.debugState()).toMatchObject({
      current: "fast.ogg",
      isPlaying: true,
    });
  });

  test("music loaded as bytes plays from them, so it can seek on any server", async () => {
    const bytes = new TextEncoder().encode("not really an ogg").buffer;
    const elements: MockAudioElement[] = [];
    const loader = createMusicLoader({
      projectId: "test_project",
      async loadAsset(_url, name) {
        return { kind: "music", name, url: "/music/theme.ogg", bytes };
      },
    });
    const player = createMusicPlayer({
      loader,
      createAudioElement(url) {
        const element = new MockAudioElement(url);
        elements.push(element);
        return element;
      },
    });

    await player.playOnce("theme");
    await player.playOnce("theme");

    const [first, second] = elements.map((element) => element.src);
    expect(first).toStartWith("blob:");
    // One blob URL per track, however often it plays.
    expect(second).toBe(first!);
    const played = await fetch(first!);
    expect(played.headers.get("content-type")).toBe("audio/ogg");
    expect(await played.text()).toBe("not really an ogg");
  });

  test("stop invalidates queued-track advancement that is still loading", async () => {
    const next = deferred<MusicAsset>();
    const elements: MockAudioElement[] = [];
    const loader = createMusicLoader({
      projectId: "test_project",
      async loadAsset(url, name) {
        if (name === "next.ogg") return next.promise;
        return { kind: "music", name, url };
      },
    });
    const player = createMusicPlayer({
      loader,
      createAudioElement(url) {
        const element = new MockAudioElement(url);
        elements.push(element);
        return element;
      },
    });

    await player.playOnce("first.ogg");
    await player.queue("next.ogg");
    elements[0]?.emitEnded();
    await Promise.resolve();
    player.stop();
    next.resolve({ kind: "music", name: "next.ogg", url: "/next.ogg" });
    await flushAsyncWork();

    expect(elements).toHaveLength(1);
    expect(player.debugState()).toMatchObject({
      current: null,
      queued: [],
      isPlaying: false,
    });
  });

  test("playOnce and queue advance in order before onMusicEnd fires", async () => {
    const { player, elements, ended } = musicFixture();

    await player.playOnce("one.ogg");
    await player.queue("two.ogg");
    await player.queue("three.ogg");

    elements[0]?.emitEnded();
    await flushAsyncWork();
    expect(player.debugState().current).toBe("two.ogg");
    expect(ended).toEqual([]);

    elements[1]?.emitEnded();
    await flushAsyncWork();
    expect(player.debugState().current).toBe("three.ogg");
    expect(ended).toEqual([]);

    elements[2]?.emitEnded();
    await flushAsyncWork();
    expect(player.debugState().current).toBe(null);
    expect(ended).toEqual(["end"]);
  });

  test("a queued track that fails to load is skipped without stalling the queue", async () => {
    const elements: MockAudioElement[] = [];
    const ended: string[] = [];
    const reported: unknown[] = [];
    const loader = createMusicLoader({
      projectId: "test_project",
      loadAsset: async (url, name): Promise<MusicAsset> => {
        if (name === "bad.ogg") throw new Error("music fetch failed");
        return { kind: "music", name, url };
      },
    });
    const player = createMusicPlayer({
      loader,
      onMusicEnd: () => ended.push("end"),
      onError: (error) => reported.push(error),
      createAudioElement(url) {
        const element = new MockAudioElement(url);
        elements.push(element);
        return element;
      },
    });

    await player.playOnce("one.ogg");
    await player.queue("bad.ogg");
    await player.queue("three.ogg");

    elements[0]?.emitEnded();
    await flushAsyncWork();

    expect(reported).toHaveLength(1);
    expect(reported[0]).toBeInstanceOf(MissingAssetError);
    expect(player.debugState().current).toBe("three.ogg");
    expect(player.debugState().queued).toEqual([]);
    expect(ended).toEqual([]);

    elements[1]?.emitEnded();
    await flushAsyncWork();

    expect(player.debugState().current).toBe(null);
    expect(ended).toEqual(["end"]);
  });

  test("pause, unpause, stop, fadeOut timing, volume, and isPlaying are deterministic", async () => {
    const { player, elements, scheduler } = musicFixture();

    player.setVolume(1.5);
    expect(player.getVolume()).toBe(1);
    player.setVolume(0.4);
    await player.playOnce("theme.ogg");
    expect(player.isPlaying()).toBe(true);
    expect(elements[0]?.volume).toBe(0.4);

    player.pause();
    expect(player.isPlaying()).toBe(false);
    player.unpause();
    expect(player.isPlaying()).toBe(true);
    expect(elements[0]?.playCalls).toBe(2);

    player.fadeOut(0.25);
    scheduler.advance(125);
    expect(elements[0]?.volume).toBeLessThan(0.4);
    expect(elements[0]?.volume).toBeGreaterThan(0);
    expect(player.isPlaying()).toBe(true);
    scheduler.advance(124);
    expect(player.isPlaying()).toBe(true);
    scheduler.advance(1);
    expect(player.isPlaying()).toBe(false);
    expect(elements[0]?.pauseCalls).toBe(2);

    await player.playOnce("theme.ogg");
    player.stop();
    expect(player.debugState()).toMatchObject({
      current: null,
      queued: [],
      isPlaying: false,
    });
  });

  test("play rejection clears current music and queued side effects", async () => {
    const elements: MockAudioElement[] = [];
    const loader = createMusicLoader({
      projectId: "test_project",
      loadAsset: async (url, name): Promise<MusicAsset> => ({
        kind: "music",
        name,
        url,
      }),
    });
    const player = createMusicPlayer({
      loader,
      createAudioElement(url) {
        const element = new MockAudioElement(url);
        element.rejectPlay = true;
        elements.push(element);
        return element;
      },
    });

    await player.playOnce("bad.ogg");
    await player.queue("queued.ogg");
    await flushAsyncWork();

    expect(elements[0]?.pauseCalls).toBe(1);
    expect(player.debugState()).toMatchObject({
      current: null,
      queued: [],
      isPlaying: false,
      lastError: "codec unsupported",
    });
  });

  test("rewind, getPos, and setPos control playback position on the underlying element", async () => {
    const { player, elements } = musicFixture();
    await player.playOnce("theme.ogg");
    const element = elements[0];
    expect(element).toBeTruthy();
    if (!element) throw new Error("Missing mock audio element.");

    expect(player.getPos()).toBe(0);
    element.currentTime = 12.5;
    expect(player.getPos()).toBeCloseTo(12_500, 5);

    player.setPos(7);
    expect(element.currentTime).toBe(7);
    expect(player.getPos()).toBeCloseTo(7000, 5);
    expect(() => player.setPos(-1)).toThrow(RangeError);

    player.rewind();
    expect(element.currentTime).toBe(0);
  });

  test("position reads and seeks in seconds", async () => {
    const { player, elements } = musicFixture();
    expect(player.position).toBe(0);
    await player.playOnce("theme.ogg");
    const element = elements[0];
    if (!element) throw new Error("Missing mock audio element.");
    element.currentTime = 12.5;
    expect(player.position).toBe(12.5);
    player.position = 3;
    expect(element.currentTime).toBe(3);
    expect(player.getPos()).toBeCloseTo(3000, 5);
    expect(() => {
      player.position = -1;
    }).toThrow(RangeError);
  });

  test("getPos returns -1 and rewind/setPos are no-ops when nothing is loaded", () => {
    const { player } = musicFixture();
    expect(player.getPos()).toBe(-1);
    expect(() => player.rewind()).not.toThrow();
    expect(() => player.setPos(5)).not.toThrow();
  });

  test("isPlaying accepts and ignores an optional track name argument", async () => {
    const { player } = musicFixture();
    await player.playOnce("theme.ogg");
    expect(player.isPlaying()).toBe(true);
    expect(player.isPlaying("theme.ogg")).toBe(true);
    expect(player.isPlaying("some-other-track.ogg")).toBe(true);
    player.pause();
    expect(player.isPlaying()).toBe(false);
    player.stop();
    expect(player.isPlaying()).toBe(false);
  });

  test("playOnce replaces a looping track with a single non-looping one", async () => {
    const { player, elements } = musicFixture();

    await player.play("theme.ogg"); // looping background track
    expect(elements[0]?.loop).toBe(true);

    await player.playOnce("stinger.ogg");
    // It stops the previous track and starts the new one as a one-shot
    // (loop === false), not on a loop.
    expect(elements[0]?.pauseCalls).toBe(1);
    expect(player.debugState()).toMatchObject({
      current: "stinger.ogg",
      isPlaying: true,
    });
    expect(elements[1]?.loop).toBe(false);
  });

  test("setOnMusicEnd registers and clears the end callback", async () => {
    const { player, elements } = musicFixture();
    const ended: string[] = [];
    // It replaces the end callback the fixture set.
    player.setOnMusicEnd(() => ended.push("end"));

    await player.playOnce("solo.ogg");
    expect(ended).toEqual([]);
    elements[0]?.emitEnded();
    await flushAsyncWork();
    expect(ended).toEqual(["end"]);

    // Clearing it stops further notifications.
    player.setOnMusicEnd(undefined);
    await player.playOnce("solo.ogg");
    elements[1]?.emitEnded();
    await flushAsyncWork();
    expect(ended).toEqual(["end"]);
  });
});

describe("audio unlock state", () => {
  test("isUnlocked reflects markUnlocked", () => {
    const unlock = new AudioUnlockState();
    expect(unlock.isUnlocked()).toBe(false);
    unlock.markUnlocked();
    expect(unlock.isUnlocked()).toBe(true);
  });

  test("a successful sound playback flips the shared unlock state's isUnlocked to true", async () => {
    const { sound, unlockState } = soundFixture();
    expect(unlockState.isUnlocked()).toBe(false);

    sound.play();
    await flushAsyncWork();

    expect(unlockState.isUnlocked()).toBe(true);
  });
});
