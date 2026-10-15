/**
 * Small helpers for the things almost every game hand-writes: a random
 * whole number, a random pick from a list, and keeping a value in range.
 * The random ones read the running game's random source, so a seeded run
 * (`run(source, { seed })`) repeats them too.
 */
import { random } from "./random";

/**
 * A random whole number from `min` to `max`, including both ends:
 * `randomInt(1, 6)` rolls a die.
 */
export function randomInt(min: number, max: number): number {
  return pickInt(min, max, "randomInt");
}

/** A random item from a list: `randomChoice(["red", "green", "blue"])`. */
export function randomChoice<T>(items: readonly T[]): T {
  return pickFrom(items, "randomChoice");
}

function pickInt(min: number, max: number, name: string): number {
  requireNumber(min, name, "min");
  requireNumber(max, name, "max");
  const low = Math.ceil(min);
  const high = Math.floor(max);
  if (low > high) {
    throw new RangeError(
      `${name}(${min}, ${max}) has no whole numbers to pick from: put the smaller number first.`,
    );
  }
  return low + Math.floor(random() * (high - low + 1));
}

function pickFrom<T>(items: readonly T[], name: string): T {
  if (!Array.isArray(items)) {
    throw new TypeError(`${name} needs a list, like ${name}([1, 2, 3]).`);
  }
  if (items.length === 0) {
    throw new RangeError(`${name} needs a list with at least one item.`);
  }
  return items[Math.floor(random() * items.length)] as T;
}

/**
 * `value`, moved inside `min`..`max` if it's outside:
 * `player.x = clamp(player.x, 0, WIDTH)`.
 */
export function clamp(value: number, min: number, max: number): number {
  requireNumber(value, "clamp", "value");
  requireNumber(min, "clamp", "min");
  requireNumber(max, "clamp", "max");
  if (min > max) {
    throw new RangeError(
      `clamp(value, ${min}, ${max}): the smallest allowed value comes first.`,
    );
  }
  return Math.min(max, Math.max(min, value));
}

function requireNumber(value: unknown, name: string, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(
      `${name}'s ${label} must be a number, but got ${String(value)}.`,
    );
  }
}
