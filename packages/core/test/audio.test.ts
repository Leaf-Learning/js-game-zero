import { describe, expect, test } from "bun:test";
import {
  AudioUnlockState,
  MissingAssetError,
  createBrowserSoundAsset,
  createMusicLoader,
  createMusicPlayer,
  createSoundLoader,
  type AudioElementLike,
  type MusicAsset,
} from "@js-game-zero/core";

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

describe("browser sound effects", () => {
  test("play once, stop, duration, volume, and unlock state use audio elements", async () => {
    const { sound, elements } = soundFixture();

    sound.set_volume(0.35);
    sound.play();
    const element = elements[0];
    expect(element).toBeTruthy();
    if (!element) throw new Error("Missing mock audio element.");
    await Promise.resolve();

    expect(element.src).toBe("/sounds/hit.wav");
    expect(element.playCalls).toBe(1);
    expect(element.loop).toBe(false);
    expect(element.volume).toBe(0.35);
    expect(sound.get_volume()).toBe(0.35);
    expect(sound.get_length()).toBe(1.25);
    expect(sound.debug_state()).toMatchObject({
      active: true,
      unlocked: true,
      lastError: null,
    });

    sound.stop();
    expect(element.pauseCalls).toBe(1);
    expect(element.currentTime).toBe(0);
    expect(sound.debug_state().active).toBe(false);
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
    expect(sound.debug_state().active).toBe(true);
    finite.emitEnded();
    expect(sound.debug_state().active).toBe(false);

    sound.play(-1);
    const infinite = elements[1];
    expect(infinite).toBeTruthy();
    if (!infinite) throw new Error("Missing infinite loop element.");
    expect(infinite.loop).toBe(true);
    infinite.emitEnded();
    expect(infinite.playCalls).toBe(1);
    expect(sound.debug_state().loop).toBe(true);
  });

  test("play errors are captured without throwing and missing assets stay explicit", async () => {
    const { sound } = soundFixture({ rejectPlay: true });
    expect(() => sound.play()).not.toThrow();
    await flushAsyncWork();
    expect(sound.debug_state().lastError).toBe("codec unsupported");
    expect(sound.debug_state()).toMatchObject({
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
});

describe("music player", () => {
  function musicFixture() {
    const elements: MockAudioElement[] = [];
    const ended: string[] = [];
    const scheduler = new ManualScheduler();
    const loader = createMusicLoader({
      projectId: "phase_four",
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
    expect(player.debug_state()).toMatchObject({
      current: "boss.ogg",
      queued: [],
      isPlaying: true,
    });
    expect(elements[1]?.loop).toBe(true);
  });

  test("play_once and queue advance in order before on_music_end fires", async () => {
    const { player, elements, ended } = musicFixture();

    await player.play_once("one.ogg");
    await player.queue("two.ogg");
    await player.queue("three.ogg");

    elements[0]?.emitEnded();
    await flushAsyncWork();
    expect(player.debug_state().current).toBe("two.ogg");
    expect(ended).toEqual([]);

    elements[1]?.emitEnded();
    await flushAsyncWork();
    expect(player.debug_state().current).toBe("three.ogg");
    expect(ended).toEqual([]);

    elements[2]?.emitEnded();
    await flushAsyncWork();
    expect(player.debug_state().current).toBe(null);
    expect(ended).toEqual(["end"]);
  });

  test("pause, unpause, stop, fadeout timing, volume, and is_playing are deterministic", async () => {
    const { player, elements, scheduler } = musicFixture();

    player.set_volume(1.5);
    expect(player.get_volume()).toBe(1);
    player.set_volume(0.4);
    await player.play_once("theme.ogg");
    expect(player.is_playing()).toBe(true);
    expect(elements[0]?.volume).toBe(0.4);

    player.pause();
    expect(player.is_playing()).toBe(false);
    player.unpause();
    expect(player.is_playing()).toBe(true);
    expect(elements[0]?.playCalls).toBe(2);

    player.fadeout(0.25);
    scheduler.advance(125);
    expect(elements[0]?.volume).toBeLessThan(0.4);
    expect(elements[0]?.volume).toBeGreaterThan(0);
    expect(player.is_playing()).toBe(true);
    scheduler.advance(124);
    expect(player.is_playing()).toBe(true);
    scheduler.advance(1);
    expect(player.is_playing()).toBe(false);
    expect(elements[0]?.pauseCalls).toBe(2);

    await player.play_once("theme.ogg");
    player.stop();
    expect(player.debug_state()).toMatchObject({
      current: null,
      queued: [],
      isPlaying: false,
    });
  });

  test("play rejection clears current music and queued side effects", async () => {
    const elements: MockAudioElement[] = [];
    const loader = createMusicLoader({
      projectId: "phase_four",
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

    await player.play_once("bad.ogg");
    await player.queue("queued.ogg");
    await flushAsyncWork();

    expect(elements[0]?.pauseCalls).toBe(1);
    expect(player.debug_state()).toMatchObject({
      current: null,
      queued: [],
      isPlaying: false,
      lastError: "codec unsupported",
    });
  });
});
