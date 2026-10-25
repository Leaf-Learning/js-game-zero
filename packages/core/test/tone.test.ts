import { describe, expect, test } from "bun:test";
import { DEFAULT_TONE_VOLUME, type Waveform } from "@js-game-zero/core";
import {
  AudioUnlockState,
  createToneGenerator,
  noteToFrequency,
  normalizeWaveform,
  parseToneFrequency,
  type AudioContextLike,
  type AudioParamLike,
  type GainNodeLike,
  type OscillatorNodeLike,
} from "@js-game-zero/core/host";

class MockAudioParam implements AudioParamLike {
  value = 0;
  calls: Array<{ value: number; time: number }> = [];

  setValueAtTime(value: number, startTime: number): void {
    this.value = value;
    this.calls.push({ value, time: startTime });
  }
}

class MockOscillator implements OscillatorNodeLike {
  type: Waveform = "sine";
  frequency = new MockAudioParam();
  connectedTo: unknown;
  starts: number[] = [];
  stops: number[] = [];

  connect(destination: unknown): unknown {
    this.connectedTo = destination;
    return destination;
  }

  start(when?: number): void {
    this.starts.push(when ?? 0);
  }

  stop(when?: number): void {
    this.stops.push(when ?? 0);
  }
}

class MockGain implements GainNodeLike {
  gain = new MockAudioParam();
  connectedTo: unknown;

  connect(destination: unknown): unknown {
    this.connectedTo = destination;
    return destination;
  }
}

class MockAudioContext implements AudioContextLike {
  destination = { output: true };
  currentTime = 12;
  state = "suspended";
  resumeCalls = 0;
  oscillators: MockOscillator[] = [];
  gains: MockGain[] = [];

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
  }

  createOscillator(): OscillatorNodeLike {
    const oscillator = new MockOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain(): GainNodeLike {
    const gain = new MockGain();
    this.gains.push(gain);
    return gain;
  }
}

describe("tone note and frequency parsing", () => {
  test("parses frequencies, note names, sharps, and flats", () => {
    expect(parseToneFrequency(440)).toBe(440);
    expect(noteToFrequency("A4")).toBeCloseTo(440, 8);
    expect(noteToFrequency("C4")).toBeCloseTo(261.625565, 5);
    expect(noteToFrequency("A#5")).toBeCloseTo(932.327523, 5);
    expect(noteToFrequency("Bb3")).toBeCloseTo(233.081881, 5);
  });

  test("rejects bad frequencies and guarded durations", () => {
    expect(() => parseToneFrequency(0)).toThrow(RangeError);
    expect(() => parseToneFrequency("H4")).toThrow(TypeError);
    const generator = createToneGenerator({
      audioContext: new MockAudioContext(),
    });
    expect(() => generator.create("A4", 0)).toThrow(RangeError);
    expect(() => generator.create("A4", 4.1)).toThrow(RangeError);
  });

  test("rejects options tone doesn't have", () => {
    const generator = createToneGenerator({
      audioContext: new MockAudioContext(),
    });
    expect(() =>
      generator.create("A4", 0.2, { wave: "square" } as never),
    ).toThrow("tone has no option called wave. Did you mean waveform?");
    const created = generator.create("A4", 0.2);
    expect(() => created.play({ volum: 0.2 } as never)).toThrow(
      "Did you mean volume?",
    );
  });

  test("rejects a waveform tone doesn't have, listing the ones it does", () => {
    const generator = createToneGenerator({
      audioContext: new MockAudioContext(),
    });
    expect(() =>
      generator.create("A4", 0.2, { waveform: "squar" as never }),
    ).toThrow(
      'tone waveform must be "sine", "square", "sawtooth" or "triangle", not "squar". Did you mean "square"?',
    );
    expect(() => generator.create("A4", 0.2, { waveform: "custom" })).toThrow(
      'tone waveform must be "sine", "square", "sawtooth" or "triangle", not "custom".',
    );
    const created = generator.create("A4", 0.2);
    expect(() => created.play({ waveform: 3 as never })).toThrow(TypeError);
  });
});

describe("tone Web Audio scheduling", () => {
  test("create returns default waveform/volume and play schedules oscillator nodes", async () => {
    const context = new MockAudioContext();
    const unlockState = new AudioUnlockState();
    const generator = createToneGenerator({
      audioContext: context,
      unlockState,
    });

    const created = generator.create("A4", 0.5);
    expect(created.frequency).toBeCloseTo(440, 8);
    expect(created.duration).toBe(0.5);
    expect(created.waveform).toBe("sine");
    expect(created.volume).toBe(DEFAULT_TONE_VOLUME);
    expect(DEFAULT_TONE_VOLUME).toBe(0.8);

    const playback = await created.play({ waveform: "square", volume: 0.25 });

    expect(context.resumeCalls).toBe(1);
    expect(unlockState.isUnlocked()).toBe(true);
    expect(playback).toMatchObject({
      frequency: 440,
      duration: 0.5,
      waveform: "square",
      volume: 0.25,
      startedAt: 12,
      stoppedAt: 12.5,
    });
    const oscillator = context.oscillators[0];
    const gain = context.gains[0];
    expect(oscillator?.type).toBe("square");
    expect(oscillator?.frequency.calls).toEqual([{ value: 440, time: 12 }]);
    expect(oscillator?.starts).toEqual([12]);
    expect(oscillator?.stops).toEqual([12.5]);
    expect(oscillator?.connectedTo).toBe(gain);
    expect(gain?.gain.calls).toEqual([{ value: 0.25, time: 12 }]);
    expect(gain?.connectedTo).toBe(context.destination);
    expect(generator.debugState()).toMatchObject({
      unlocked: true,
      contextState: "running",
      scheduled: [playback],
    });
  });

  test("frequency input, duration, waveform, and clamped volume are preserved", async () => {
    const context = new MockAudioContext();
    context.state = "running";
    const generator = createToneGenerator({ audioContext: context });

    const playback = await generator.play(220, 1.25, {
      waveform: "triangle",
      volume: 2,
    });

    expect(playback.frequency).toBe(220);
    expect(playback.duration).toBe(1.25);
    expect(playback.waveform).toBe("triangle");
    expect(playback.volume).toBe(1);
    expect(context.resumeCalls).toBe(0);
  });

  test("tone.isUnlocked reflects the unlock state", async () => {
    const context = new MockAudioContext();
    const unlockState = new AudioUnlockState();
    const generator = createToneGenerator({
      audioContext: context,
      unlockState,
    });

    expect(generator.isUnlocked()).toBe(false);

    await generator.play("A4", 0.2);

    // Playing a tone resumes/unlocks the context, so the generator and the
    // shared unlock state both report it.
    expect(generator.isUnlocked()).toBe(true);
    expect(unlockState.isUnlocked()).toBe(true);
  });
});

describe("tone falls back to a helpful error with no Web Audio available", () => {
  test("play() rejects with 'Web Audio is not available in this environment.' when neither AudioContext nor webkitAudioContext exist and no audioContext was passed", async () => {
    const globals = globalThis as typeof globalThis & {
      AudioContext?: unknown;
      webkitAudioContext?: unknown;
    };
    const hadAudioContext = "AudioContext" in globals;
    const hadWebkitAudioContext = "webkitAudioContext" in globals;
    const previousAudioContext = globals.AudioContext;
    const previousWebkitAudioContext = globals.webkitAudioContext;

    // Bun's test environment does not define either constructor, but
    // delete/save-and-restore defensively so this test can't leak state
    // into others even if that ever changes.
    delete globals.AudioContext;
    delete globals.webkitAudioContext;

    try {
      expect(typeof globals.AudioContext).toBe("undefined");
      expect(typeof globals.webkitAudioContext).toBe("undefined");

      // No `audioContext` option is passed, so createToneGenerator must
      // fall through to `globalThis.AudioContext ?? globalThis.webkitAudioContext`
      // inside getContext() when play() is called.
      const generator = createToneGenerator();

      await expect(generator.play("A4", 0.5)).rejects.toThrow(
        "Web Audio is not available in this environment.",
      );
    } finally {
      if (hadAudioContext) globals.AudioContext = previousAudioContext;
      else delete globals.AudioContext;
      if (hadWebkitAudioContext) {
        globals.webkitAudioContext = previousWebkitAudioContext;
      } else {
        delete globals.webkitAudioContext;
      }
    }
  });
});

describe("pgzero waveform aliases", () => {
  test("normalizeWaveform maps pgzero's sin/saw names to Web Audio types", () => {
    expect(normalizeWaveform("sin")).toBe("sine");
    expect(normalizeWaveform("saw")).toBe("sawtooth");
    expect(normalizeWaveform("square")).toBe("square");
    expect(normalizeWaveform("triangle")).toBe("triangle");
  });

  test("create() and play() accept sin/saw aliases end-to-end", async () => {
    const context = new MockAudioContext();
    context.state = "running";
    const generator = createToneGenerator({ audioContext: context });

    const created = generator.create("A4", 0.5, { waveform: "sin" });
    expect(created.waveform).toBe("sine");

    const playback = await generator.play(440, 0.5, { waveform: "saw" });
    expect(playback.waveform).toBe("sawtooth");
    expect(context.oscillators[0]?.type).toBe("sawtooth");
  });
});
