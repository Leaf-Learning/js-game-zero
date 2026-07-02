import { describe, expect, test } from "bun:test";
import {
  AudioUnlockState,
  DEFAULT_TONE_VOLUME,
  createToneGenerator,
  noteToFrequency,
  normalizeWaveform,
  parseToneFrequency,
  type AudioContextLike,
  type AudioParamLike,
  type GainNodeLike,
  type OscillatorNodeLike,
  type Waveform,
} from "@js-game-zero/core";

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
    expect(unlockState.is_unlocked()).toBe(true);
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
    expect(generator.debug_state()).toMatchObject({
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
