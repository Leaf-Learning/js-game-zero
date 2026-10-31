/**
 * Repeatable randomness for a run that asks for it (`run(source, { seed })`),
 * and the random source the helpers read while a run is active. The CLI's
 * `--seed` passes its seed to the same `run()` option, so one seed gives the
 * same sequence in the CLI and in a host page.
 */

export type RandomSource = () => number;

/** A seed a host can pass: a string, or a number read as its digits. */
export type RandomSeed = string | number;

/**
 * The 32-bit state for a seed. Up to nine plain digits are used as the number
 * they spell, so a seed chosen for one harness reproduces the same sequence in
 * another; anything else is hashed (FNV-1a). A number is read as `String(n)`,
 * so `42` and `"42"` are the same seed.
 */
export function hashSeed(seed: RandomSeed): number {
  if (typeof seed === "number" && !Number.isFinite(seed)) {
    throw new TypeError(
      `seed must be a finite number or a string, not ${seed}.`,
    );
  }
  if (typeof seed !== "string" && typeof seed !== "number") {
    throw new TypeError(
      `seed must be a string or a number, not ${typeof seed}.`,
    );
  }
  const value = String(seed);
  if (/^\d{1,9}$/.test(value)) return Number(value) >>> 0;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A repeatable stand-in for `Math.random`: numbers from 0 up to 1, the same
 * sequence for the same seed (Mulberry32 over `hashSeed(seed)`).
 */
export function createSeededRandom(seed: RandomSeed): RandomSource {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A `Math` for one game's scope whose `random` is that game's source. Every
 * other member is the real `Math`'s, so `Math.floor` and `Math.PI` read as
 * usual, and the page's own `Math.random` is untouched.
 */
export function mathWithRandom(random: RandomSource): Math {
  return Object.freeze(
    Object.create(Math, {
      random: { value: random, enumerable: false },
    }) as Math,
  );
}

let activeRandom: RandomSource | null = null;

/** Installs the running game's random source; returns the previous one. */
export function setActiveRandom(
  random: RandomSource | null,
): RandomSource | null {
  const previous = activeRandom;
  activeRandom = random;
  return previous;
}

/** The active run's random source, or `Math.random` outside a run. */
export function random(): number {
  return activeRandom ? activeRandom() : Math.random();
}
