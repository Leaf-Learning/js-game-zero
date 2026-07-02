import { describe, expect, test } from "bun:test";
import {
  Animation,
  Clock,
  ValueError,
  animate,
  tweenNames,
  tweens,
} from "@js-game-zero/core";

describe("tweens", () => {
  test("all documented tween names are exported and produce finite values", () => {
    expect(tweenNames).toEqual([
      "linear",
      "accelerate",
      "decelerate",
      "accel_decel",
      "in_elastic",
      "out_elastic",
      "in_out_elastic",
      "bounce_end",
      "bounce_start",
      "bounce_start_end",
      "end_elastic",
      "start_elastic",
      "both_elastic",
    ]);
    for (const name of tweenNames) {
      expect(Number.isFinite(tweens[name](0.5))).toBe(true);
    }
  });

  test("unknown tweens include the requested name and nearest suggestion", () => {
    expect(() => new Animation({ x: 0 }, { x: 1, tween: "linar" })).toThrow(
      /linar.*linear/,
    );
    expect(
      () => new Animation({ x: 0 }, { x: 1, tween: "wildly_missing" }),
    ).toThrow(/wildly_missing/);
  });

  test("golden values match the reference pgzero easing formulas at n=0,0.25,0.5,0.75,1", () => {
    const samples = [0, 0.25, 0.5, 0.75, 1];
    const linear = [0, 0.25, 0.5, 0.75, 1];
    const accelerate = [0, 0.0625, 0.25, 0.5625, 1];
    const decelerate = [0, 0.4375, 0.75, 0.9375, 1];
    const accelDecel = [0, 0.125, 0.5, 0.875, 1];
    const inElastic = [0, -0.005524271728, -0.015625, 0.088388347648, 1];
    const outElastic = [0, 0.911611652352, 1.015625, 1.005524271728, 1];
    const inOutElastic = [0, 0.011969444424, 0.5, 0.988030555576, 1];
    const bounceEnd = [0, 0.47265625, 0.765625, 0.97265625, 1];
    const bounceStart = [0, 0.02734375, 0.234375, 0.52734375, 1];
    const bounceStartEnd = [0, 0.1171875, 0.5, 0.8828125, 1];

    // Aliases must produce identical values to the tween they wrap.
    const expected: Record<string, number[]> = {
      linear,
      accelerate,
      decelerate,
      accel_decel: accelDecel,
      in_elastic: inElastic,
      out_elastic: outElastic,
      in_out_elastic: inOutElastic,
      bounce_end: bounceEnd,
      bounce_start: bounceStart,
      bounce_start_end: bounceStartEnd,
      end_elastic: inElastic,
      start_elastic: outElastic,
      both_elastic: inOutElastic,
    };

    for (const name of tweenNames) {
      const table = expected[name];
      if (!table) throw new Error(`missing golden values for ${name}`);
      samples.forEach((n, index) => {
        expect(tweens[name](n)).toBeCloseTo(table[index] as number, 9);
      });
    }
  });

  test("in_elastic/in_out_elastic (and their aliases) clamp exactly to 0 at n=0", () => {
    // The raw trigonometric formula produces a tiny nonzero value at n=0;
    // the source deliberately clamps `n === 0` (and `n === 1`) to exactly
    // the input value for boundary safety. out_elastic needs no such clamp
    // because its raw formula already lands on exactly 0 via a trig
    // identity.
    expect(tweens.in_elastic(0)).toBe(0);
    expect(tweens.end_elastic(0)).toBe(0);
    expect(tweens.in_out_elastic(0)).toBe(0);
    expect(tweens.both_elastic(0)).toBe(0);
  });

  test("aliases delegate to the tween they wrap across the full domain", () => {
    for (let n = 0; n <= 1; n += 0.1) {
      expect(tweens.end_elastic(n)).toBe(tweens.in_elastic(n));
      expect(tweens.start_elastic(n)).toBe(tweens.out_elastic(n));
      expect(tweens.both_elastic(n)).toBe(tweens.in_out_elastic(n));
    }
  });

  test("linear, accelerate, decelerate, and accel_decel are monotonically non-decreasing on [0,1]", () => {
    const monotonic: Array<keyof typeof tweens> = [
      "linear",
      "accelerate",
      "decelerate",
      "accel_decel",
    ];
    for (const name of monotonic) {
      let previous = tweens[name](0);
      for (let step = 1; step <= 20; step += 1) {
        const n = step / 20;
        const value = tweens[name](n);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });
});

describe("Animation error paths and edge cases", () => {
  test("throws ValueError when the target object has no such attribute", () => {
    // `y` is intentionally not a property of the target object -- this
    // exercises the runtime "missing attribute" guard, which TypeScript's
    // AnimationOptions<T> type would otherwise reject at compile time.
    const options = { y: 1 } as unknown as { x?: number };
    expect(() => new Animation({ x: 0 }, options)).toThrow(
      /has no attribute y/,
    );
    expect(() => new Animation({ x: 0 }, options)).toThrow(ValueError);
  });

  test("throws RangeError for a negative duration", () => {
    expect(() => new Animation({ x: 0 }, { x: 1, duration: -1 })).toThrow(
      RangeError,
    );
  });

  test("throws TypeError for a non-finite duration", () => {
    expect(() => new Animation({ x: 0 }, { x: 1, duration: NaN })).toThrow(
      TypeError,
    );
    expect(() => new Animation({ x: 0 }, { x: 1, duration: Infinity })).toThrow(
      TypeError,
    );
  });

  test("duration: 0 completes immediately on the first tick, regardless of dt", () => {
    const clock = new Clock();
    const target = { x: 0 };
    let finishedCalls = 0;
    new Animation(
      target,
      {
        x: 10,
        duration: 0,
        on_finished: () => {
          finishedCalls += 1;
        },
      },
      clock,
    );
    clock.tick(0);
    expect(target.x).toBe(10);
    expect(finishedCalls).toBe(1);
  });
});

describe("Animation", () => {
  test("animate moves scalar targets with the shared clock path", () => {
    const target = { x: 0 };
    const animation = animate(target, { x: 10, duration: 1 });
    animation.update(0.5);
    expect(target.x).toBe(5);
    animation.stop(true);
    expect(target.x).toBe(10);
  });

  test("animates tuple and array targets", () => {
    const clock = new Clock();
    const target = { pos: [0, 10] };
    new Animation(target, { pos: [10, 30], duration: 1 }, clock);
    clock.tick(0.25);
    expect(target.pos).toEqual([2.5, 15]);
  });

  test("replaces an existing animation on the same target property", () => {
    const clock = new Clock();
    const target = { x: 0, y: 0 };
    const first = new Animation(target, { x: 10, y: 10, duration: 1 }, clock);
    const second = new Animation(target, { x: 100, duration: 1 }, clock);
    clock.tick(0.5);
    expect(first.running).toBe(true);
    expect(second.running).toBe(true);
    expect(target.x).toBe(50);
    expect(target.y).toBe(5);
    clock.tick(0.5);
    expect(first.running).toBe(false);
    expect(second.running).toBe(false);
    expect(target).toEqual({ x: 100, y: 10 });
  });

  test("stop(false), stop(true), and natural finish have distinct behavior", () => {
    const clock = new Clock();
    const stopped = { x: 0 };
    const stoppedAnimation = new Animation(
      stopped,
      { x: 10, duration: 1 },
      clock,
    );
    clock.tick(0.25);
    stoppedAnimation.stop(false);
    expect(stopped.x).toBe(2.5);
    clock.tick(1);
    expect(stopped.x).toBe(2.5);

    const completed = { x: 0 };
    const completedAnimation = new Animation(
      completed,
      { x: 10, duration: 1 },
      clock,
    );
    clock.tick(0.25);
    completedAnimation.stop(true);
    expect(completed.x).toBe(10);

    const finished = { x: 0 };
    let calls = 0;
    const natural = new Animation(
      finished,
      {
        x: 10,
        duration: 0.5,
        on_finished: () => {
          calls += 1;
        },
      },
      clock,
    );
    clock.tick(0.5);
    expect(finished.x).toBe(10);
    expect(natural.running).toBe(false);
    expect(calls).toBe(1);
  });
});
