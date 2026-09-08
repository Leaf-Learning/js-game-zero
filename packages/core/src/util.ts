/**
 * Internal cross-cutting utilities shared between core modules. This module
 * is intentionally NOT re-exported from `index.ts`, so none of these helpers
 * become part of the public package API. The only geometry dependency is a
 * type-only import, so there is no runtime import cycle.
 */
import type { Point } from "./geometry";

/** Standard Levenshtein edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  const previous = Array.from(
    { length: b.length + 1 },
    (_value, index) => index,
  );
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j < previous.length; j += 1) previous[j] = current[j] ?? 0;
  }
  return previous[b.length] ?? 0;
}

/**
 * Optimal string alignment distance: Levenshtein where swapping two adjacent
 * characters (`widht` for `width`) costs one edit instead of two.
 */
export function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_value, i) =>
    Array.from({ length: b.length + 1 }, (_cell, j) => (i === 0 ? j : i)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        (rows[i - 1]?.[j] ?? 0) + 1,
        (rows[i]?.[j - 1] ?? 0) + 1,
        (rows[i - 1]?.[j - 1] ?? 0) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (rows[i - 2]?.[j - 2] ?? 0) + 1);
      }
      (rows[i] as number[])[j] = best;
    }
  }
  return rows[a.length]?.[b.length] ?? 0;
}

/** True when `value` is a thenable (a Promise or Promise-like object). */
export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function requireFiniteNumber(value: unknown, label: string): number {
  if (isFiniteNumber(value)) return value;
  throw new TypeError(`${label} must be a finite number.`);
}

export function isPair(value: unknown): value is readonly [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

/**
 * Validates that `value` is a `[number, number]` tuple of finite numbers,
 * returning a fresh mutable `Point`. Shared by geometry/actor/assets/
 * rendering, which each used to define an identical private copy.
 */
export function requirePoint(value: unknown, label: string): Point {
  if (isPair(value)) return [value[0], value[1]];
  throw new TypeError(`${label} must be a two-number tuple.`);
}

export function horizontalAnchorOffset(
  value: number | "left" | "center" | "middle" | "right",
  width: number,
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === "left") return 0;
  if (value === "center" || value === "middle") return width / 2;
  if (value === "right") return width;
  throw new TypeError("invalid horizontal anchor.");
}

export function verticalAnchorOffset(
  value: number | "top" | "center" | "middle" | "bottom",
  height: number,
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === "top") return 0;
  if (value === "center" || value === "middle") return height / 2;
  if (value === "bottom") return height;
  throw new TypeError("invalid vertical anchor.");
}

/**
 * The compound Rect-anchor position keys (`topleft`…`center`), shared by the
 * actor, assets, and rendering modules for validating position keywords.
 */
export const rectPositionKeys = [
  "topleft",
  "topright",
  "bottomleft",
  "bottomright",
  "midtop",
  "midleft",
  "midright",
  "midbottom",
  "center",
] as const;

/** Recognized image asset file extensions. */
export const imageExtensions = [
  "png",
  "gif",
  "jpg",
  "jpeg",
  "bmp",
  "webp",
  "svg",
];

/** Recognized sound asset file extensions. */
export const soundExtensions = ["wav", "ogg", "mp3", "m4a"];
