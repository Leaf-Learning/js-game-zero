import { describe, expect, test } from "bun:test";
import { Clock } from "@js-game-zero/core";

describe("Clock scheduling", () => {
  test("fires one-shot callbacks in due-time and insertion order", () => {
    const clock = new Clock();
    const calls: string[] = [];
    clock.schedule(() => calls.push("second"), 1);
    clock.schedule(() => calls.push("first-a"), 0.5);
    clock.schedule(() => calls.push("first-b"), 0.5);
    clock.tick(0.5);
    expect(calls).toEqual(["first-a", "first-b"]);
    clock.tick(0.5);
    expect(calls).toEqual(["first-a", "first-b", "second"]);
  });

  test("repeats intervals deterministically across large dt jumps", () => {
    const clock = new Clock();
    let count = 0;
    clock.scheduleInterval(() => {
      count += 1;
    }, 0.25);
    clock.tick(1.1);
    expect(count).toBe(4);
    clock.tick(0.15);
    expect(count).toBe(5);
  });

  test("scheduleUnique replaces pending timers, and scheduleInterval repeats until unscheduled", () => {
    const clock = new Clock();
    let count = 0;
    const callback = () => {
      count += 1;
    };
    // Two already-pending schedule() calls plus a scheduleUnique() leave only
    // the latest timer, so the callback fires once (at 0.3s), not three times.
    clock.schedule(callback, 0.1);
    clock.schedule(callback, 0.2);
    clock.scheduleUnique(callback, 0.3);
    clock.tick(0.29);
    expect(count).toBe(0);
    clock.tick(0.01);
    expect(count).toBe(1);

    // scheduleInterval repeats on a fixed cadence, and the resulting timer is
    // cancelable through unschedule(). A fresh clock keeps the interval timing
    // independent of the ticks above.
    const intervalClock = new Clock();
    let intervalCount = 0;
    const interval = () => {
      intervalCount += 1;
    };
    intervalClock.scheduleInterval(interval, 0.1);
    intervalClock.tick(0.35);
    expect(intervalCount).toBe(3);
    intervalClock.unschedule(interval);
    intervalClock.tick(1);
    expect(intervalCount).toBe(3);
  });

  test("unschedule removes all matching one-shot, interval, and per-tick callbacks", () => {
    const clock = new Clock();
    let calls = 0;
    const callback = () => {
      calls += 1;
    };
    clock.schedule(callback, 0.1);
    clock.scheduleInterval(callback, 0.1);
    clock.eachTick(callback);
    clock.unschedule(callback);
    clock.tick(1);
    expect(calls).toBe(0);
  });

  test("a callback that schedules itself with a delay of 0 runs once a tick, not forever", () => {
    const clock = new Clock({
      onError(error) {
        throw error;
      },
    });
    let calls = 0;
    function blink() {
      calls += 1;
      if (calls > 100) throw new Error("still looping in one tick");
      clock.schedule(blink, 0);
    }
    clock.schedule(blink, 0);
    clock.tick(1 / 60);
    expect(calls).toBe(1);
    clock.tick(1 / 60);
    expect(calls).toBe(2);
    // So does one rescheduled with scheduleUnique, and a one-shot scheduled
    // during a tick waits for the next one even when it's due already.
    const unique = () => {
      calls += 1;
      clock.scheduleUnique(unique, 0);
    };
    calls = 0;
    clock.unschedule(blink);
    clock.schedule(unique, 0);
    clock.tick(0);
    expect(calls).toBe(1);
    clock.tick(0);
    expect(calls).toBe(2);
  });

  test("per-tick callbacks receive dt each tick", () => {
    const clock = new Clock();
    const dts: number[] = [];
    clock.eachTick((dt) => dts.push(dt));
    clock.tick(0.16);
    clock.tick(0.34);
    expect(dts).toEqual([0.16, 0.34]);
  });

  test("a throwing scheduled callback is logged and auto-unscheduled without aborting the frame", () => {
    const clock = new Clock();
    const calls: string[] = [];
    const originalConsoleError = console.error;
    const loggedErrors: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      loggedErrors.push(args);
    };
    try {
      clock.schedule(() => {
        throw new Error("boom");
      }, 0.1);
      clock.schedule(() => calls.push("safe"), 0.1);
      clock.tick(0.1);
      expect(calls).toEqual(["safe"]);
      expect(loggedErrors.length).toBe(1);

      let intervalCalls = 0;
      clock.scheduleInterval(() => {
        intervalCalls += 1;
        if (intervalCalls === 2) throw new Error("interval boom");
      }, 0.1);
      clock.tick(0.1);
      expect(intervalCalls).toBe(1);
      clock.tick(0.1);
      expect(intervalCalls).toBe(2);
      // The offending interval callback should be unscheduled after throwing,
      // so it must not fire again on subsequent ticks.
      clock.tick(0.5);
      expect(intervalCalls).toBe(2);
      expect(loggedErrors.length).toBe(2);
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("a throwing eachTick callback is logged and auto-unscheduled while others keep running", () => {
    const clock = new Clock();
    const originalConsoleError = console.error;
    const loggedErrors: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      loggedErrors.push(args);
    };
    try {
      let throwingCalls = 0;
      let safeCalls = 0;
      clock.eachTick(() => {
        throwingCalls += 1;
        throw new Error("eachTick boom");
      });
      clock.eachTick(() => {
        safeCalls += 1;
      });
      clock.tick(0.1);
      expect(throwingCalls).toBe(1);
      expect(safeCalls).toBe(1);
      expect(loggedErrors.length).toBe(1);

      clock.tick(0.1);
      expect(throwingCalls).toBe(1);
      expect(safeCalls).toBe(2);
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("clear removes all scheduled and eachTick callbacks", () => {
    const clock = new Clock();
    let scheduledCalls = 0;
    let intervalCalls = 0;
    let tickCalls = 0;
    clock.schedule(() => {
      scheduledCalls += 1;
    }, 0.1);
    clock.scheduleInterval(() => {
      intervalCalls += 1;
    }, 0.1);
    clock.eachTick(() => {
      tickCalls += 1;
    });
    clock.clear();
    clock.tick(1);
    expect(scheduledCalls).toBe(0);
    expect(intervalCalls).toBe(0);
    expect(tickCalls).toBe(0);
  });

  test("clear called inside an active interval cancels that interval before it can be requeued", () => {
    const clock = new Clock();
    let intervalCalls = 0;
    let laterCalls = 0;
    clock.scheduleInterval(() => {
      intervalCalls += 1;
      clock.clear();
    }, 0.1);
    clock.schedule(() => {
      laterCalls += 1;
    }, 0.2);

    clock.tick(1);
    clock.tick(1);

    expect(intervalCalls).toBe(1);
    expect(laterCalls).toBe(0);
  });

  test("now() starts at 0 and advances by the sum of tick(dt) calls", () => {
    const clock = new Clock();
    expect(clock.now()).toBe(0);
    clock.tick(0.5);
    expect(clock.now()).toBe(0.5);
    clock.tick(0.25);
    expect(clock.now()).toBe(0.75);
    clock.tick(0);
    expect(clock.now()).toBe(0.75);
  });

  test("a schedule given something other than a function says to drop the brackets, naming the call used", () => {
    const clock = new Clock();
    const loose = clock as unknown as Record<string, (...a: unknown[]) => void>;
    expect(() => loose.scheduleInterval!(undefined, 1)).toThrow(
      "clock.scheduleInterval needs a function to call later, but got undefined. Give the function's name without brackets: clock.scheduleInterval(spawn, 1), not clock.scheduleInterval(spawn(), 1).",
    );
    expect(() => loose.scheduleInterval!(3, 1)).toThrow(
      "clock.scheduleInterval needs a function to call later, but got 3.",
    );
    expect(() => loose.schedule!("spawn", 1)).toThrow(
      'clock.schedule needs a function to call later, but got "spawn".',
    );
    expect(() => loose.scheduleUnique!(null, 1)).toThrow(
      "clock.scheduleUnique needs a function to call later",
    );
    expect(() => loose.scheduleUnique!(null, 1)).toThrow(TypeError);
    expect(() => loose.eachTick!(undefined)).toThrow(
      "clock.eachTick needs a function to call later, but got undefined. Give the function's name without brackets: clock.eachTick(spawn), not clock.eachTick(spawn()).",
    );
    expect(() => loose.schedule_interval!(() => {}, 1)).toThrow(
      "clock.schedule_interval doesn't exist. Did you mean clock.scheduleInterval?",
    );
  });

  test("schedule rejects a negative delay with RangeError and a non-finite delay with TypeError", () => {
    const clock = new Clock();
    expect(() => clock.schedule(() => {}, -1)).toThrow(RangeError);
    expect(() => clock.schedule(() => {}, -1)).toThrow(
      /delay must be non-negative/,
    );
    expect(() => clock.schedule(() => {}, Number.NaN)).toThrow(TypeError);
    expect(() => clock.schedule(() => {}, Number.NaN)).toThrow(
      /delay must be a finite number/,
    );
    expect(() => clock.schedule(() => {}, Number.POSITIVE_INFINITY)).toThrow(
      TypeError,
    );
  });

  test("scheduleInterval rejects a negative interval with RangeError, a non-finite interval with TypeError, and an interval of exactly 0 with a distinct RangeError", () => {
    const clock = new Clock();
    expect(() => clock.scheduleInterval(() => {}, -1)).toThrow(RangeError);
    expect(() => clock.scheduleInterval(() => {}, -1)).toThrow(
      /interval must be non-negative/,
    );
    expect(() => clock.scheduleInterval(() => {}, Number.NaN)).toThrow(
      TypeError,
    );
    expect(() =>
      clock.scheduleInterval(() => {}, Number.POSITIVE_INFINITY),
    ).toThrow(TypeError);
    expect(() => clock.scheduleInterval(() => {}, 0)).toThrow(RangeError);
    expect(() => clock.scheduleInterval(() => {}, 0)).toThrow(
      /interval must be greater than 0/,
    );
  });
});
