import { audioUnlock, clampVolume, type AudioUnlockState } from "./audio";

export type Waveform = OscillatorType;

/** pgzero's tone.Waveform names that don't match the Web Audio OscillatorType spelling. */
export type WaveformAlias = "sin" | "saw";

export type WaveformInput = Waveform | WaveformAlias;

export type AudioParamLike = {
  value: number;
  setValueAtTime?: (value: number, startTime: number) => void;
};

export type OscillatorNodeLike = {
  type: Waveform;
  frequency: AudioParamLike;
  connect(destination: unknown): unknown;
  start(when?: number): void;
  stop(when?: number): void;
};

export type GainNodeLike = {
  gain: AudioParamLike;
  connect(destination: unknown): unknown;
};

export type AudioContextLike = {
  readonly destination: unknown;
  currentTime: number;
  state?: string;
  resume?: () => Promise<void>;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
};

export type ToneOptions = {
  readonly audioContext?: AudioContextLike;
  readonly unlockState?: AudioUnlockState;
  readonly waveform?: WaveformInput;
  readonly volume?: number;
};

export type TonePlayOptions = Omit<ToneOptions, "audioContext" | "unlockState">;

/** pgzero's tone module defaults to volume 0.8 (see pgzero.tone._convert_args). */
export const DEFAULT_TONE_VOLUME = 0.8;

export type ToneSpec = {
  readonly frequency: number;
  readonly duration: number;
  readonly waveform: Waveform;
  readonly volume: number;
};

export type TonePlayback = ToneSpec & {
  readonly startedAt: number;
  readonly stoppedAt: number;
};

export type ToneDebugState = {
  readonly unlocked: boolean;
  readonly contextState: string | null;
  readonly scheduled: readonly TonePlayback[];
};

export class CreatedTone implements ToneSpec {
  readonly frequency: number;
  readonly duration: number;
  readonly waveform: Waveform;
  readonly volume: number;
  private readonly generator: ToneGenerator;

  constructor(generator: ToneGenerator, spec: ToneSpec) {
    this.generator = generator;
    this.frequency = spec.frequency;
    this.duration = spec.duration;
    this.waveform = spec.waveform;
    this.volume = spec.volume;
  }

  play(options: TonePlayOptions = {}): Promise<TonePlayback> {
    return this.generator.play(this.frequency, this.duration, {
      waveform: options.waveform ?? this.waveform,
      volume: options.volume ?? this.volume,
    });
  }
}

export class ToneGenerator {
  private contextValue: AudioContextLike | null;
  private readonly unlockState: AudioUnlockState;
  private readonly scheduledTones: TonePlayback[] = [];

  constructor(options: ToneOptions = {}) {
    this.contextValue = options.audioContext ?? null;
    this.unlockState = options.unlockState ?? audioUnlock;
  }

  create(
    noteOrFrequency: string | number,
    duration = 1,
    options: TonePlayOptions = {},
  ): CreatedTone {
    return new CreatedTone(
      this,
      this.createSpec(noteOrFrequency, duration, options),
    );
  }

  async play(
    noteOrFrequency: string | number,
    duration = 1,
    options: TonePlayOptions = {},
  ): Promise<TonePlayback> {
    const spec = this.createSpec(noteOrFrequency, duration, options);
    const context = this.getContext();
    await this.unlock();
    const startAt = context.currentTime;
    const stopAt = startAt + spec.duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = spec.waveform;
    setAudioParam(oscillator.frequency, spec.frequency, startAt);
    setAudioParam(gain.gain, spec.volume, startAt);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(stopAt);
    const playback = {
      ...spec,
      startedAt: startAt,
      stoppedAt: stopAt,
    };
    this.scheduledTones.push(playback);
    return playback;
  }

  async unlock(): Promise<boolean> {
    const context = this.getContext();
    if (context.state === "suspended" && context.resume) {
      await context.resume();
    }
    if (context.state === undefined || context.state === "running") {
      this.unlockState.mark_unlocked();
    }
    return this.unlockState.is_unlocked();
  }

  is_unlocked(): boolean {
    return this.unlockState.is_unlocked();
  }

  isUnlocked(): boolean {
    return this.is_unlocked();
  }

  debug_state(): ToneDebugState {
    return {
      unlocked: this.unlockState.is_unlocked(),
      contextState: this.contextValue?.state ?? null,
      scheduled: [...this.scheduledTones],
    };
  }

  private createSpec(
    noteOrFrequency: string | number,
    duration: number,
    options: TonePlayOptions,
  ): ToneSpec {
    return {
      frequency: parseToneFrequency(noteOrFrequency),
      duration: requireToneDuration(duration),
      waveform: normalizeWaveform(options.waveform ?? "sine"),
      volume: clampVolume(options.volume ?? DEFAULT_TONE_VOLUME),
    };
  }

  private getContext(): AudioContextLike {
    if (this.contextValue) return this.contextValue;
    const AudioContextConstructor =
      globalThis.AudioContext ??
      (
        globalThis as typeof globalThis & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (typeof AudioContextConstructor !== "function") {
      throw new Error("Web Audio is not available in this environment.");
    }
    this.contextValue = new AudioContextConstructor();
    return this.contextValue;
  }
}

export function createToneGenerator(options: ToneOptions = {}): ToneGenerator {
  return new ToneGenerator(options);
}

export const tone = createToneGenerator();

export function parseToneFrequency(noteOrFrequency: string | number): number {
  if (typeof noteOrFrequency === "number") {
    if (Number.isFinite(noteOrFrequency) && noteOrFrequency > 0) {
      return noteOrFrequency;
    }
    throw new RangeError("tone frequency must be a positive finite number.");
  }
  return noteToFrequency(noteOrFrequency);
}

export function noteToFrequency(noteName: string): number {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(noteName.trim());
  if (!match) {
    throw new TypeError("tone note names must look like A4, A#5, or Bb3.");
  }
  const [, note = "", accidental = "", octaveText = ""] = match;
  const baseSemitone = noteSemitones[note.toUpperCase()];
  if (baseSemitone === undefined) {
    throw new TypeError(`Unknown tone note name: ${noteName}.`);
  }
  const semitone =
    baseSemitone + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  const octave = Number(octaveText);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

export function requireToneDuration(duration: number): number {
  if (
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0 &&
    duration <= 4
  ) {
    return duration;
  }
  throw new RangeError(
    "tone duration must be greater than 0 and at most 4 seconds.",
  );
}

export function normalizeWaveform(waveform: WaveformInput): Waveform {
  if (waveform === "sin") return "sine";
  if (waveform === "saw") return "sawtooth";
  return waveform;
}

function setAudioParam(
  param: AudioParamLike,
  value: number,
  time: number,
): void {
  if (param.setValueAtTime) {
    param.setValueAtTime(value, time);
    return;
  }
  param.value = value;
}

const noteSemitones: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
