import {
  createMusicLoader,
  type AssetLoader,
  type LoadedAsset,
  type MusicAsset,
  type SoundAsset,
} from "./assets";

export type AudioElementLike = {
  src: string;
  loop: boolean;
  currentTime: number;
  volume: number;
  duration: number;
  paused?: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: "ended", listener: () => void): void;
  removeEventListener(type: "ended", listener: () => void): void;
};

export type AudioElementFactory = (url: string) => AudioElementLike;

export class AudioUnlockState {
  private unlocked = false;

  is_unlocked(): boolean {
    return this.unlocked;
  }

  isUnlocked(): boolean {
    return this.is_unlocked();
  }

  mark_unlocked(): void {
    this.unlocked = true;
  }

  reset(): void {
    this.unlocked = false;
  }
}

export const audioUnlock = new AudioUnlockState();

export type BrowserSoundDebugState = {
  readonly active: boolean;
  readonly loop: boolean;
  readonly volume: number;
  readonly unlocked: boolean;
  readonly lastError: string | null;
};

export type BrowserSoundOptions = {
  readonly createAudioElement?: AudioElementFactory;
  readonly unlockState?: AudioUnlockState;
  readonly volume?: number;
};

/** One overlapping playback instance backing a BrowserSoundAsset. */
type SoundInstance = {
  readonly element: AudioElementLike;
  readonly loopCount: number;
  remainingLoops: number;
  readonly ended: () => void;
};

export class BrowserSoundAsset implements SoundAsset {
  readonly kind: "sound";
  readonly name: string;
  readonly url: string;
  readonly bytes?: ArrayBuffer;

  private readonly createElement: AudioElementFactory;
  private readonly unlockState: AudioUnlockState;
  // pygame Sounds mix on channels, so multiple play() calls overlap rather
  // than cutting each other off; this pool tracks every concurrently
  // playing instance of this sound.
  private readonly activeInstances = new Set<SoundInstance>();
  private metadataElement: AudioElementLike | null = null;
  private volumeValue: number;
  private lastErrorMessage: string | null = null;

  constructor(asset: LoadedAsset, options: BrowserSoundOptions = {}) {
    this.kind = "sound";
    this.name = asset.name;
    this.url = asset.url;
    if (asset.bytes) this.bytes = asset.bytes;
    this.createElement = options.createAudioElement ?? createHtmlAudioElement;
    this.unlockState = options.unlockState ?? audioUnlock;
    this.volumeValue = clampVolume(options.volume ?? 1);
  }

  play(loops = 0): void {
    const loopCount = requireLoopCount(loops);

    let element: AudioElementLike;
    try {
      element = this.createElement(this.url);
    } catch (error) {
      this.lastErrorMessage = errorMessage(error);
      return;
    }

    element.volume = this.volumeValue;
    element.loop = loopCount < 0;
    const instance: SoundInstance = {
      element,
      loopCount,
      remainingLoops: loopCount,
      ended: () => this.handleInstanceEnded(instance),
    };
    this.activeInstances.add(instance);
    element.addEventListener("ended", instance.ended);
    this.playElement(element, () => {
      if (this.activeInstances.has(instance))
        this.removeInstance(instance, true);
    });
  }

  stop(): void {
    for (const instance of [...this.activeInstances]) {
      this.removeInstance(instance, true);
    }
  }

  get_length(): number {
    const element = this.firstActiveElement() ?? this.getMetadataElement();
    return Number.isFinite(element.duration) && element.duration > 0
      ? element.duration
      : 0;
  }

  set_volume(volume: number): void {
    this.volumeValue = clampVolume(volume);
    for (const instance of this.activeInstances) {
      instance.element.volume = this.volumeValue;
    }
    if (this.metadataElement) this.metadataElement.volume = this.volumeValue;
  }

  get_volume(): number {
    return this.volumeValue;
  }

  debug_state(): BrowserSoundDebugState {
    return {
      active: this.activeInstances.size > 0,
      loop: [...this.activeInstances].some((instance) =>
        Boolean(instance.element.loop),
      ),
      volume: this.volumeValue,
      unlocked: this.unlockState.is_unlocked(),
      lastError: this.lastErrorMessage,
    };
  }

  /** Number of currently overlapping playback instances of this sound. */
  debug_instance_count(): number {
    return this.activeInstances.size;
  }

  private handleInstanceEnded(instance: SoundInstance): void {
    if (!this.activeInstances.has(instance)) return;
    if (instance.loopCount < 0) return;
    if (instance.remainingLoops > 0) {
      instance.remainingLoops -= 1;
      instance.element.currentTime = 0;
      this.playElement(instance.element, () => {
        if (this.activeInstances.has(instance))
          this.removeInstance(instance, true);
      });
      return;
    }
    this.removeInstance(instance, false);
  }

  private firstActiveElement(): AudioElementLike | null {
    for (const instance of this.activeInstances) return instance.element;
    return null;
  }

  private getMetadataElement(): AudioElementLike {
    this.metadataElement ??= this.createElement(this.url);
    this.metadataElement.volume = this.volumeValue;
    return this.metadataElement;
  }

  private playElement(
    element: AudioElementLike,
    onRejected?: () => void,
  ): void {
    try {
      const result = element.play();
      if (isPromiseLike(result)) {
        void result
          .then(() => {
            this.unlockState.mark_unlocked();
          })
          .catch((error: unknown) => {
            this.lastErrorMessage = errorMessage(error);
            onRejected?.();
          });
      } else {
        this.unlockState.mark_unlocked();
      }
    } catch (error) {
      this.lastErrorMessage = errorMessage(error);
      onRejected?.();
    }
  }

  private removeInstance(instance: SoundInstance, resetTime: boolean): void {
    const { element } = instance;
    element.removeEventListener("ended", instance.ended);
    element.pause();
    element.loop = false;
    if (resetTime) element.currentTime = 0;
    this.activeInstances.delete(instance);
  }
}

export function createBrowserSoundAsset(
  asset: LoadedAsset,
  options: BrowserSoundOptions = {},
): BrowserSoundAsset {
  return new BrowserSoundAsset(asset, options);
}

export type MusicMode = "loop" | "once";

export type MusicPlayerOptions = {
  readonly loader?: AssetLoader<MusicAsset>;
  readonly createAudioElement?: AudioElementFactory;
  readonly onMusicEnd?: () => void;
  readonly scheduler?: TimeoutScheduler;
  readonly volume?: number;
};

export type TimeoutScheduler = {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type MusicDebugState = {
  readonly current: string | null;
  readonly queued: readonly string[];
  readonly isPlaying: boolean;
  readonly volume: number;
  readonly lastError: string | null;
};

type CurrentMusicTrack = {
  readonly asset: MusicAsset;
  readonly element: AudioElementLike;
  readonly mode: MusicMode;
  readonly ended: () => void;
};

export class MusicPlayer {
  private loaderValue: AssetLoader<MusicAsset> | null;
  private readonly createElement: AudioElementFactory;
  private readonly scheduler: TimeoutScheduler;
  private currentTrack: CurrentMusicTrack | null = null;
  private queuedNames: string[] = [];
  private onEnd: (() => void) | undefined;
  private fadeoutHandles: unknown[] = [];
  private volumeValue: number;
  private lastErrorMessage: string | null = null;

  constructor(options: MusicPlayerOptions = {}) {
    this.loaderValue = options.loader ?? null;
    this.createElement = options.createAudioElement ?? createHtmlAudioElement;
    this.scheduler = options.scheduler ?? defaultTimeoutScheduler();
    this.onEnd = options.onMusicEnd;
    this.volumeValue = clampVolume(options.volume ?? 1);
  }

  async play(name: string): Promise<void> {
    this.stop();
    await this.startTrack(name, "loop");
  }

  async play_once(name: string): Promise<void> {
    this.stop();
    await this.startTrack(name, "once");
  }

  async playOnce(name: string): Promise<void> {
    await this.play_once(name);
  }

  async queue(name: string): Promise<void> {
    this.queuedNames.push(name);
    if (!this.currentTrack) await this.playNextQueuedTrack();
  }

  stop(): void {
    this.clearFadeout();
    this.queuedNames = [];
    this.disposeCurrent(true);
  }

  pause(): void {
    this.currentTrack?.element.pause();
  }

  unpause(): void {
    const element = this.currentTrack?.element;
    if (!element) return;
    this.playElement(element);
  }

  /** Restarts the current track from the beginning (pygame.mixer.music.rewind). */
  rewind(): void {
    const element = this.currentTrack?.element;
    if (!element) return;
    element.currentTime = 0;
  }

  /**
   * Milliseconds the current track has been playing for, or -1 if nothing
   * is loaded (matches pygame.mixer.music.get_pos()).
   */
  get_pos(): number {
    const element = this.currentTrack?.element;
    if (!element) return -1;
    return element.currentTime * 1000;
  }

  getPos(): number {
    return this.get_pos();
  }

  /** Seeks the current track to the given position in seconds. */
  set_pos(seconds: number): void {
    if (
      typeof seconds !== "number" ||
      !Number.isFinite(seconds) ||
      seconds < 0
    ) {
      throw new RangeError("set_pos seconds must be a non-negative number.");
    }
    const element = this.currentTrack?.element;
    if (!element) return;
    element.currentTime = seconds;
  }

  setPos(seconds: number): void {
    this.set_pos(seconds);
  }

  fadeout(seconds: number): void {
    if (
      typeof seconds !== "number" ||
      !Number.isFinite(seconds) ||
      seconds < 0
    ) {
      throw new RangeError("fadeout duration must be a non-negative number.");
    }
    this.clearFadeout();
    if (seconds === 0) {
      this.stop();
      return;
    }
    const track = this.currentTrack;
    if (!track) return;
    const durationMs = seconds * 1000;
    const steps = Math.max(1, Math.ceil(durationMs / 50));
    const startVolume = track.element.volume;
    for (let step = 1; step <= steps; step += 1) {
      const handle = this.scheduler.setTimeout(
        () => {
          if (this.currentTrack !== track) return;
          track.element.volume = startVolume * (1 - step / steps);
          if (step === steps) this.stop();
        },
        (durationMs * step) / steps,
      );
      this.fadeoutHandles.push(handle);
    }
  }

  set_volume(volume: number): void {
    this.volumeValue = clampVolume(volume);
    if (this.currentTrack) this.currentTrack.element.volume = this.volumeValue;
  }

  get_volume(): number {
    return this.volumeValue;
  }

  /**
   * True if music is currently playing (and not paused). Accepts and
   * ignores an optional track name argument, matching pgzero's
   * `music.is_playing(name)` signature.
   */
  is_playing(_name?: string): boolean {
    return Boolean(this.currentTrack && !this.currentTrack.element.paused);
  }

  isPlaying(name?: string): boolean {
    return this.is_playing(name);
  }

  set_on_music_end(callback: (() => void) | undefined): void {
    this.onEnd = callback;
  }

  setOnMusicEnd(callback: (() => void) | undefined): void {
    this.set_on_music_end(callback);
  }

  debug_state(): MusicDebugState {
    return {
      current: this.currentTrack?.asset.name ?? null,
      queued: [...this.queuedNames],
      isPlaying: this.is_playing(),
      volume: this.volumeValue,
      lastError: this.lastErrorMessage,
    };
  }

  debug_current_element(): AudioElementLike | null {
    return this.currentTrack?.element ?? null;
  }

  private get loader(): AssetLoader<MusicAsset> {
    this.loaderValue ??= createMusicLoader();
    return this.loaderValue;
  }

  private async startTrack(name: string, mode: MusicMode): Promise<void> {
    const asset = await this.loader.load(name);
    const element = this.createElement(asset.url);
    element.volume = this.volumeValue;
    element.loop = mode === "loop";
    const track: CurrentMusicTrack = {
      asset,
      element,
      mode,
      ended: () => {
        void this.handleTrackEnded(track);
      },
    };
    this.currentTrack = track;
    element.addEventListener("ended", track.ended);
    this.playElement(element, () => {
      if (this.currentTrack === track) {
        this.queuedNames = [];
        this.disposeCurrent(true);
      }
    });
  }

  private async playNextQueuedTrack(): Promise<void> {
    const next = this.queuedNames.shift();
    if (!next) {
      this.onEnd?.();
      return;
    }
    await this.startTrack(next, "once");
  }

  private async handleTrackEnded(track: CurrentMusicTrack): Promise<void> {
    if (this.currentTrack !== track) return;
    this.disposeCurrent(false);
    if (this.queuedNames.length > 0) {
      await this.playNextQueuedTrack();
      return;
    }
    this.onEnd?.();
  }

  private playElement(
    element: AudioElementLike,
    onRejected?: () => void,
  ): void {
    try {
      const result = element.play();
      if (isPromiseLike(result)) {
        void result.catch((error: unknown) => {
          this.lastErrorMessage = errorMessage(error);
          onRejected?.();
        });
      }
    } catch (error) {
      this.lastErrorMessage = errorMessage(error);
      onRejected?.();
    }
  }

  private disposeCurrent(resetTime: boolean): void {
    const track = this.currentTrack;
    if (!track) return;
    track.element.removeEventListener("ended", track.ended);
    track.element.pause();
    track.element.loop = false;
    if (resetTime) track.element.currentTime = 0;
    this.currentTrack = null;
  }

  private clearFadeout(): void {
    for (const handle of this.fadeoutHandles) {
      this.scheduler.clearTimeout(handle);
    }
    this.fadeoutHandles = [];
  }
}

export function createMusicPlayer(
  options: MusicPlayerOptions = {},
): MusicPlayer {
  return new MusicPlayer(options);
}

const defaultMusicPlayer = createMusicPlayer();
let activeMusicPlayer: MusicPlayer | null = null;

export function setActiveMusicPlayer(
  nextMusicPlayer: MusicPlayer | null,
): MusicPlayer | null {
  const previous = activeMusicPlayer;
  activeMusicPlayer = nextMusicPlayer;
  return previous;
}

export function getActiveMusicPlayer(): MusicPlayer {
  return activeMusicPlayer ?? defaultMusicPlayer;
}

export const music = new Proxy({} as MusicPlayer, {
  get(_target, property) {
    const target = getActiveMusicPlayer();
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  },
  set(_target, property, value) {
    return Reflect.set(getActiveMusicPlayer(), property, value);
  },
  has(_target, property) {
    return property in getActiveMusicPlayer();
  },
}) as MusicPlayer;

export function clampVolume(volume: number): number {
  if (typeof volume !== "number" || Number.isNaN(volume)) return 1;
  return Math.min(1, Math.max(0, volume));
}

function createHtmlAudioElement(url: string): AudioElementLike {
  if (typeof globalThis.Audio !== "function") {
    throw new Error("HTML audio is not available in this environment.");
  }
  return new globalThis.Audio(url);
}

function requireLoopCount(loops: number): number {
  if (Number.isInteger(loops) && loops >= -1) return loops;
  throw new RangeError("loops must be an integer greater than or equal to -1.");
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then: unknown }).then === "function"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultTimeoutScheduler(): TimeoutScheduler {
  return {
    setTimeout(callback, delayMs) {
      return globalThis.setTimeout(callback, delayMs);
    },
    clearTimeout(handle) {
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
  };
}
