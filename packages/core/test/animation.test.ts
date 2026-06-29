import { describe, expect, test } from "bun:test";
import {
  Animation,
  Clock,
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
