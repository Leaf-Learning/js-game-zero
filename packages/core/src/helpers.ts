/**
 * Small helpers for the things almost every game hand-writes: a random
 * whole number, a random pick from a list, and keeping a value in range.
 */

/**
 * A random whole number from `min` to `max`, including both ends:
 * `random_int(1, 6)` rolls a die.
 */
export function random_int(min: number, max: number): number {
  requireNumber(min, "random_int", "min");
  requireNumber(max, "random_int", "max");
  const low = Math.ceil(min);
  const high = Math.floor(max);
  if (low > high) {
    throw new RangeError(
      `random_int(${min}, ${max}) has no whole numbers to pick from: put the smaller number first.`,
    );
  }
  return low + Math.floor(Math.random() * (high - low + 1));
}

/** A random item from a list: `random_choice(["red", "green", "blue"])`. */
export function random_choice<T>(items: readonly T[]): T {
  if (!Array.isArray(items)) {
    throw new TypeError(
      "random_choice needs a list, like random_choice([1, 2, 3]).",
    );
  }
  if (items.length === 0) {
    throw new RangeError("random_choice needs a list with at least one item.");
  }
  return items[Math.floor(Math.random() * items.length)] as T;
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
