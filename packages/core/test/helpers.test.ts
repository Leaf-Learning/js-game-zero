import { afterEach, describe, expect, test } from "bun:test";
import { clamp, random_choice, random_int } from "@js-game-zero/core";

const realRandom = Math.random;

function withRandom(value: number): void {
  Math.random = () => value;
}

afterEach(() => {
  Math.random = realRandom;
});

describe("random_int", () => {
  test("includes both ends of the range", () => {
    withRandom(0);
    expect(random_int(1, 6)).toBe(1);
    withRandom(0.9999999);
    expect(random_int(1, 6)).toBe(6);
    withRandom(0.5);
    expect(random_int(-3, 3)).toBe(0);
    expect(random_int(4, 4)).toBe(4);
  });

  test("stays within whole numbers inside a fractional range", () => {
    withRandom(0);
    expect(random_int(0.5, 3.5)).toBe(1);
    withRandom(0.9999999);
    expect(random_int(0.5, 3.5)).toBe(3);
  });

  test("explains a backwards range or a non-number", () => {
    expect(() => random_int(6, 1)).toThrow("put the smaller number first");
    expect(() => random_int(1, "6" as never)).toThrow(
      "random_int's max must be a number",
    );
  });
});

describe("random_choice", () => {
  test("picks any item, first to last", () => {
    withRandom(0);
    expect(random_choice(["red", "green", "blue"])).toBe("red");
    withRandom(0.9999999);
    expect(random_choice(["red", "green", "blue"])).toBe("blue");
  });

  test("explains an empty list or a non-list", () => {
    expect(() => random_choice([])).toThrow("at least one item");
    expect(() => random_choice("abc" as never)).toThrow("needs a list");
  });
});

describe("clamp", () => {
  test("moves a value into range and leaves values inside alone", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(4, 0, 10)).toBe(4);
  });

  test("explains a backwards range", () => {
    expect(() => clamp(4, 10, 0)).toThrow("smallest allowed value comes first");
    expect(() => clamp(Number.NaN, 0, 1)).toThrow("clamp's value");
  });
});
