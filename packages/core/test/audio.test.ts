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
    expect(sound.debug_instance_count()).toBe(2);
    expect(sound.debug_state().active).toBe(true);

    sound.stop();
    expect(first.paused).toBe(true);
    expect(second.paused).toBe(true);
    expect(sound.debug_instance_count()).toBe(0);
    expect(sound.debug_state().active).toBe(false);
  });

  test("set_volume applies to already-playing instances and future ones", () => {
    const { sound, elements } = soundFixture();

    sound.play();
    sound.set_volume(0.2);
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

  test("rewind, get_pos, and set_pos control playback position on the underlying element", async () => {
    const { player, elements } = musicFixture();
    await player.play_once("theme.ogg");
    const element = elements[0];
    expect(element).toBeTruthy();
    if (!element) throw new Error("Missing mock audio element.");

    expect(player.get_pos()).toBe(0);
    // getPos() is a camelCase alias of get_pos(): both read the same position.
    expect(player.getPos()).toBe(0);
    element.currentTime = 12.5;
    expect(player.get_pos()).toBeCloseTo(12_500, 5);
    expect(player.getPos()).toBeCloseTo(12_500, 5);

    player.set_pos(3);
    expect(element.currentTime).toBe(3);
    // setPos() is a camelCase alias of set_pos(): it seeks the underlying
    // element and the new position is observable through get_pos()/getPos().
    player.setPos(7);
    expect(element.currentTime).toBe(7);
    expect(player.getPos()).toBeCloseTo(7000, 5);
    expect(() => player.setPos(-1)).toThrow(RangeError);

    player.rewind();
    expect(element.currentTime).toBe(0);

    expect(() => player.set_pos(-1)).toThrow(RangeError);
  });

  test("get_pos returns -1 and rewind/set_pos are no-ops when nothing is loaded", () => {
    const { player } = musicFixture();
    expect(player.get_pos()).toBe(-1);
    expect(player.getPos()).toBe(-1);
    expect(() => player.rewind()).not.toThrow();
    expect(() => player.set_pos(5)).not.toThrow();
  });

  test("is_playing accepts and ignores an optional track name argument", async () => {
    const { player } = musicFixture();
    await player.play_once("theme.ogg");
    expect(player.is_playing()).toBe(true);
    expect(player.is_playing("theme.ogg")).toBe(true);
    expect(player.is_playing("some-other-track.ogg")).toBe(true);
    // isPlaying() is a camelCase alias of is_playing(): it mirrors the same
    // play/pause state and also ignores the optional track name argument.
    expect(player.isPlaying()).toBe(true);
    expect(player.isPlaying("theme.ogg")).toBe(true);
    player.pause();
    expect(player.is_playing()).toBe(false);
    expect(player.isPlaying()).toBe(false);
    player.stop();
    expect(player.isPlaying()).toBe(false);
  });

  test("playOnce is a camelCase alias of play_once: plays a single non-looping track", async () => {
    const { player, elements } = musicFixture();

    await player.play("theme.ogg"); // looping background track
    expect(elements[0]?.loop).toBe(true);

    await player.playOnce("stinger.ogg");
    // Like play_once, the alias stops the previous track and starts the new
    // one as a one-shot (loop === false), not on a loop.
    expect(elements[0]?.pauseCalls).toBe(1);
    expect(player.debug_state()).toMatchObject({
      current: "stinger.ogg",
      isPlaying: true,
    });
    expect(elements[1]?.loop).toBe(false);
  });

  test("setOnMusicEnd is a camelCase alias of set_on_music_end: registers and clears the end callback", async () => {
    const { player, elements } = musicFixture();
    const ended: string[] = [];
    // Registering through the alias must install the same end callback that
    // set_on_music_end would, replacing the one the fixture set.
    player.setOnMusicEnd(() => ended.push("end"));

    await player.play_once("solo.ogg");
    expect(ended).toEqual([]);
    elements[0]?.emitEnded();
    await flushAsyncWork();
    expect(ended).toEqual(["end"]);

    // Clearing it through the alias stops further notifications.
    player.setOnMusicEnd(undefined);
    await player.play_once("solo.ogg");
    elements[1]?.emitEnded();
    await flushAsyncWork();
    expect(ended).toEqual(["end"]);
  });
});

describe("audio unlock state", () => {
  test("isUnlocked is a camelCase alias of is_unlocked and reflects mark_unlocked", () => {
    const unlock = new AudioUnlockState();
    expect(unlock.is_unlocked()).toBe(false);
    expect(unlock.isUnlocked()).toBe(false);

    unlock.mark_unlocked();
    expect(unlock.is_unlocked()).toBe(true);
    // The alias reports the same state as the canonical after unlocking.
    expect(unlock.isUnlocked()).toBe(true);
    expect(unlock.isUnlocked()).toBe(unlock.is_unlocked());
  });

  test("a successful sound playback flips the shared unlock state's isUnlocked to true", async () => {
    const { sound, unlockState } = soundFixture();
    expect(unlockState.isUnlocked()).toBe(false);

    sound.play();
    await flushAsyncWork();

    expect(unlockState.is_unlocked()).toBe(true);
    expect(unlockState.isUnlocked()).toBe(true);
  });
});
