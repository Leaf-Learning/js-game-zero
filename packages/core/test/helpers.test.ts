import { afterEach, describe, expect, test } from "bun:test";
import { clamp, randomChoice, randomInt } from "@js-game-zero/core";

const realRandom = Math.random;

function withRandom(value: number): void {
  Math.random = () => value;
}

afterEach(() => {
  Math.random = realRandom;
});

describe("randomInt", () => {
  test("includes both ends of the range", () => {
    withRandom(0);
    expect(randomInt(1, 6)).toBe(1);
    withRandom(0.9999999);
    expect(randomInt(1, 6)).toBe(6);
    withRandom(0.5);
    expect(randomInt(-3, 3)).toBe(0);
    expect(randomInt(4, 4)).toBe(4);
  });

  test("stays within whole numbers inside a fractional range", () => {
    withRandom(0);
    expect(randomInt(0.5, 3.5)).toBe(1);
    withRandom(0.9999999);
    expect(randomInt(0.5, 3.5)).toBe(3);
  });

  test("explains a backwards range or a non-number", () => {
    expect(() => randomInt(6, 1)).toThrow("put the smaller number first");
    expect(() => randomInt(1, "6" as never)).toThrow(
      "randomInt's max must be a number",
    );
  });
});

describe("randomChoice", () => {
  test("picks any item, first to last", () => {
    withRandom(0);
    expect(randomChoice(["red", "green", "blue"])).toBe("red");
    withRandom(0.9999999);
    expect(randomChoice(["red", "green", "blue"])).toBe("blue");
  });

  test("explains an empty list or a non-list", () => {
    expect(() => randomChoice([])).toThrow("at least one item");
    expect(() => randomChoice("abc" as never)).toThrow("needs a list");
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
