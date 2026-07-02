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
    clock.schedule_interval(() => {
      count += 1;
    }, 0.25);
    clock.tick(1.1);
    expect(count).toBe(4);
    clock.tick(0.15);
    expect(count).toBe(5);
  });

  test("schedule_unique replaces all existing callbacks and aliases are available", () => {
    const clock = new Clock();
    let count = 0;
    const callback = () => {
      count += 1;
    };
    clock.schedule(callback, 0.1);
    clock.schedule(callback, 0.2);
    clock.scheduleUnique(callback, 0.3);
    clock.tick(0.29);
    expect(count).toBe(0);
    clock.tick(0.01);
    expect(count).toBe(1);
    clock.scheduleInterval(callback, 0.1);
    clock.unschedule(callback);
    clock.tick(1);
    expect(count).toBe(1);
  });

  test("unschedule removes all matching one-shot, interval, and per-tick callbacks", () => {
    const clock = new Clock();
    let calls = 0;
    const callback = () => {
      calls += 1;
    };
    clock.schedule(callback, 0.1);
    clock.schedule_interval(callback, 0.1);
    clock.each_tick(callback);
    clock.unschedule(callback);
    clock.tick(1);
    expect(calls).toBe(0);
  });

  test("per-tick callbacks receive dt each tick", () => {
    const clock = new Clock();
    const dts: number[] = [];
    clock.each_tick((dt) => dts.push(dt));
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
      clock.schedule_interval(() => {
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

  test("a throwing each_tick callback is logged and auto-unscheduled while others keep running", () => {
    const clock = new Clock();
    const originalConsoleError = console.error;
    const loggedErrors: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      loggedErrors.push(args);
    };
    try {
      let throwingCalls = 0;
      let safeCalls = 0;
      clock.each_tick(() => {
        throwingCalls += 1;
        throw new Error("each_tick boom");
      });
      clock.each_tick(() => {
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

  test("clear removes all scheduled and each_tick callbacks", () => {
    const clock = new Clock();
    let scheduledCalls = 0;
    let intervalCalls = 0;
    let tickCalls = 0;
    clock.schedule(() => {
      scheduledCalls += 1;
    }, 0.1);
    clock.schedule_interval(() => {
      intervalCalls += 1;
    }, 0.1);
    clock.each_tick(() => {
      tickCalls += 1;
    });
    clock.clear();
    clock.tick(1);
    expect(scheduledCalls).toBe(0);
    expect(intervalCalls).toBe(0);
    expect(tickCalls).toBe(0);
  });
});
