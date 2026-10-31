import { guardSpellings } from "./friendly-names";
import {
  isFiniteNumber,
  isPair,
  requireFiniteNumber,
  requirePoint,
} from "./util";

export type Point = [number, number];
export type Size = [number, number];
export type RectTuple = [number, number, number, number];
export type RectLike =
  | Rect
  | RectTuple
  | readonly [number, number, number, number]
  | {
      left: number;
      top: number;
      width: number;
      height: number;
    }
  | {
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | {
      readonly rect: RectLike | (() => RectLike);
    };

/** A dictionary-like collision target: a `Map`, or a plain object keyed by string. */
export type RectDict<V> = Map<unknown, V> | Record<string, V>;

type PairLike = readonly [number, number];

export class Rect {
  left: number;
  top: number;
  width: number;
  height: number;

  constructor(left: number, top: number, width: number, height: number);
  constructor(topLeft: PairLike, size: PairLike);
  constructor(rect: RectLike);
  constructor(...args: unknown[]) {
    const [left, top, width, height] = parseRectArgs(args);
    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;
  }

  get x(): number {
    return this.left;
  }

  set x(value: number) {
    this.left = requireFiniteNumber(value, "x");
  }

  get y(): number {
    return this.top;
  }

  set y(value: number) {
    this.top = requireFiniteNumber(value, "y");
  }

  get w(): number {
    return this.width;
  }

  set w(value: number) {
    this.width = requireFiniteNumber(value, "w");
  }

  get h(): number {
    return this.height;
  }

  set h(value: number) {
    this.height = requireFiniteNumber(value, "h");
  }

  get right(): number {
    return this.left + this.width;
  }

  set right(value: number) {
    this.left = requireFiniteNumber(value, "right") - this.width;
  }

  get bottom(): number {
    return this.top + this.height;
  }

  set bottom(value: number) {
    this.top = requireFiniteNumber(value, "bottom") - this.height;
  }

  get centerX(): number {
    return this.left + this.width / 2;
  }

  set centerX(value: number) {
    this.left = requireFiniteNumber(value, "centerX") - this.width / 2;
  }

  get centerY(): number {
    return this.top + this.height / 2;
  }

  set centerY(value: number) {
    this.top = requireFiniteNumber(value, "centerY") - this.height / 2;
  }

  get topLeft(): Point {
    return [this.left, this.top];
  }

  set topLeft(value: PairLike) {
    const [x, y] = parsePair(value, "topLeft");
    this.left = x;
    this.top = y;
  }

  get topRight(): Point {
    return [this.right, this.top];
  }

  set topRight(value: PairLike) {
    const [x, y] = parsePair(value, "topRight");
    this.right = x;
    this.top = y;
  }

  get bottomLeft(): Point {
    return [this.left, this.bottom];
  }

  set bottomLeft(value: PairLike) {
    const [x, y] = parsePair(value, "bottomLeft");
    this.left = x;
    this.bottom = y;
  }

  get bottomRight(): Point {
    return [this.right, this.bottom];
  }

  set bottomRight(value: PairLike) {
    const [x, y] = parsePair(value, "bottomRight");
    this.right = x;
    this.bottom = y;
  }

  get midTop(): Point {
    return [this.centerX, this.top];
  }

  set midTop(value: PairLike) {
    const [x, y] = parsePair(value, "midTop");
    this.centerX = x;
    this.top = y;
  }

  get midLeft(): Point {
    return [this.left, this.centerY];
  }

  set midLeft(value: PairLike) {
    const [x, y] = parsePair(value, "midLeft");
    this.left = x;
    this.centerY = y;
  }

  get midRight(): Point {
    return [this.right, this.centerY];
  }

  set midRight(value: PairLike) {
    const [x, y] = parsePair(value, "midRight");
    this.right = x;
    this.centerY = y;
  }

  get midBottom(): Point {
    return [this.centerX, this.bottom];
  }

  set midBottom(value: PairLike) {
    const [x, y] = parsePair(value, "midBottom");
    this.centerX = x;
    this.bottom = y;
  }

  get center(): Point {
    return [this.centerX, this.centerY];
  }

  set center(value: PairLike) {
    const [x, y] = parsePair(value, "center");
    this.centerX = x;
    this.centerY = y;
  }

  get size(): Size {
    return [this.width, this.height];
  }

  set size(value: PairLike) {
    const [width, height] = parsePair(value, "size");
    this.width = width;
    this.height = height;
  }

  /** Index 0: `left`. Mirrors pygame/pgzero's `rect[0]`. */
  get 0(): number {
    return this.left;
  }

  /** Index 1: `top`. Mirrors pygame/pgzero's `rect[1]`. */
  get 1(): number {
    return this.top;
  }

  /** Index 2: `width`. Mirrors pygame/pgzero's `rect[2]`. */
  get 2(): number {
    return this.width;
  }

  /** Index 3: `height`. Mirrors pygame/pgzero's `rect[3]`. */
  get 3(): number {
    return this.height;
  }

  /** Iterates as `[left, top, width, height]`, so `[...rect]` works like pgzero's ZRect. */
  [Symbol.iterator](): Iterator<number> {
    const values: RectTuple = [this.left, this.top, this.width, this.height];
    return values[Symbol.iterator]();
  }

  copy(): Rect {
    const RectClass = this.constructor as new (
      left: number,
      top: number,
      width: number,
      height: number,
    ) => Rect;
    return new RectClass(this.left, this.top, this.width, this.height);
  }

  move(x: number, y: number): Rect;
  move(offset: PairLike): Rect;
  move(xOrOffset: number | PairLike, y?: number): Rect {
    const [x, yOffset] = parseOffset(xOrOffset, y, "move");
    const copy = this.copy();
    copy.moveIp(x, yOffset);
    return copy;
  }

  moveIp(x: number, y: number): void;
  moveIp(offset: PairLike): void;
  moveIp(xOrOffset: number | PairLike, y?: number): void {
    const [x, yOffset] = parseOffset(xOrOffset, y, "moveIp");
    this.left += x;
    this.top += yOffset;
  }

  inflate(x: number, y: number): Rect;
  inflate(size: PairLike): Rect;
  inflate(xOrSize: number | PairLike, y?: number): Rect {
    const [x, yAmount] = parseOffset(xOrSize, y, "inflate");
    const copy = this.copy();
    copy.inflateIp(x, yAmount);
    return copy;
  }

  inflateIp(x: number, y: number): void;
  inflateIp(size: PairLike): void;
  inflateIp(xOrSize: number | PairLike, y?: number): void {
    const [x, yAmount] = parseOffset(xOrSize, y, "inflateIp");
    this.left -= x / 2;
    this.top -= yAmount / 2;
    this.width += x;
    this.height += yAmount;
  }

  normalize(): void {
    if (this.width < 0) {
      this.left += this.width;
      this.width = -this.width;
    }
    if (this.height < 0) {
      this.top += this.height;
      this.height = -this.height;
    }
  }

  clamp(other: RectLike): Rect {
    const container = normalizedRect(other);
    const rect = this.copy();
    if (rect.width >= container.width) {
      rect.left = container.left + (container.width - rect.width) / 2;
    } else if (rect.left < container.left) {
      rect.left = container.left;
    } else if (rect.right > container.right) {
      rect.right = container.right;
    }

    if (rect.height >= container.height) {
      rect.top = container.top + (container.height - rect.height) / 2;
    } else if (rect.top < container.top) {
      rect.top = container.top;
    } else if (rect.bottom > container.bottom) {
      rect.bottom = container.bottom;
    }
    return rect;
  }

  /** Mutating form of {@link clamp}. */
  clampIp(other: RectLike): void {
    this.applyGeometry(this.clamp(other));
  }

  clip(other: RectLike): Rect {
    const a = normalizedRect(this);
    const b = normalizedRect(other);
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return new Rect(
      left,
      top,
      Math.max(0, right - left),
      Math.max(0, bottom - top),
    );
  }

  /** Mutating form of {@link clip}. */
  clipIp(other: RectLike): void {
    this.applyGeometry(this.clip(other));
  }

  union(other: RectLike): Rect {
    const a = normalizedRect(this);
    const b = normalizedRect(other);
    const left = Math.min(a.left, b.left);
    const top = Math.min(a.top, b.top);
    const right = Math.max(a.right, b.right);
    const bottom = Math.max(a.bottom, b.bottom);
    return new Rect(left, top, right - left, bottom - top);
  }

  /** Mutating form of {@link union}. */
  unionIp(other: RectLike): void {
    this.applyGeometry(this.union(other));
  }

  unionAll(others: RectLike[]): Rect {
    return others.reduce<Rect>(
      (accumulator, other) => accumulator.union(other),
      this.copy(),
    );
  }

  /** Mutating form of {@link unionAll}. */
  unionAllIp(others: RectLike[]): void {
    this.applyGeometry(this.unionAll(others));
  }

  fit(other: RectLike): Rect {
    const container = normalizedRect(other);
    const rect = normalizedRect(this);
    if (rect.width === 0 || rect.height === 0) {
      return new Rect(container.left, container.top, 0, 0);
    }
    const scale = Math.min(
      container.width / rect.width,
      container.height / rect.height,
    );
    const width = rect.width * scale;
    const height = rect.height * scale;
    return new Rect(
      container.left + (container.width - width) / 2,
      container.top + (container.height - height) / 2,
      width,
      height,
    );
  }

  contains(other: RectLike): boolean {
    const a = normalizedRect(this);
    const b = normalizedRect(other);
    return (
      b.left >= a.left &&
      b.top >= a.top &&
      b.right <= a.right &&
      b.bottom <= a.bottom
    );
  }

  collidePoint(point: PairLike): boolean;
  collidePoint(x: number, y: number): boolean;
  collidePoint(pointOrX: PairLike | number, y?: number): boolean {
    const [x, yPoint] = parseOffset(pointOrX, y, "collidePoint");
    const rect = normalizedRect(this);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      x >= rect.left &&
      x < rect.right &&
      yPoint >= rect.top &&
      yPoint < rect.bottom
    );
  }

  /**
   * True when this rectangle overlaps `target`: another rect (or anything
   * with a rect, like an Actor), or an `[x, y]` point inside it.
   */
  touches(target: RectLike | PairLike): boolean {
    return isPair(target)
      ? this.collidePoint(target)
      : this.collideRect(target as RectLike);
  }

  collideRect(other: RectLike): boolean {
    const a = normalizedRect(this);
    const b = normalizedRect(other);
    return (
      a.width > 0 &&
      a.height > 0 &&
      b.width > 0 &&
      b.height > 0 &&
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top
    );
  }

  collideList(others: RectLike[]): number {
    return others.findIndex((other) => this.collideRect(other));
  }

  collideListAll(others: RectLike[]): number[] {
    const indexes: number[] = [];
    others.forEach((other, index) => {
      if (this.collideRect(other)) indexes.push(index);
    });
    return indexes;
  }

  /**
   * Returns the first `[key, value]` entry of `dict` that collides with this
   * rect, or `undefined` if none do. By default the *values* are treated as
   * rect-likes (matching rect.py's `use_values=True`); pass `useValues:
   * false` to instead treat the *keys* as rect-likes (only meaningful for a
   * `Map` whose keys are themselves rect-likes, since plain object keys are
   * always strings).
   */
  collideDict<V>(
    dict: RectDict<V>,
    useValues = true,
  ): [unknown, V] | undefined {
    for (const [key, value] of dictEntries(dict)) {
      const candidate = (useValues ? value : key) as unknown as RectLike;
      if (this.collideRect(candidate)) return [key, value];
    }
    return undefined;
  }

  /** Same as {@link collideDict}, but returns every colliding entry. */
  collideDictAll<V>(dict: RectDict<V>, useValues = true): Array<[unknown, V]> {
    const results: Array<[unknown, V]> = [];
    for (const [key, value] of dictEntries(dict)) {
      const candidate = (useValues ? value : key) as unknown as RectLike;
      if (this.collideRect(candidate)) results.push([key, value]);
    }
    return results;
  }

  private applyGeometry(source: Rect): void {
    this.left = source.left;
    this.top = source.top;
    this.width = source.width;
    this.height = source.height;
  }
}

function* dictEntries<V>(dict: RectDict<V>): Iterable<[unknown, V]> {
  if (dict instanceof Map) {
    yield* dict.entries();
    return;
  }
  yield* Object.entries(dict) as unknown as Iterable<[unknown, V]>;
}

guardSpellings(Rect.prototype, "rect");

export class ZRect extends Rect {}

export function angleTo(from: PairLike, to: PairLike): number {
  const [fromX, fromY] = parsePair(from, "from");
  const [toX, toY] = parsePair(to, "to");
  return (Math.atan2(fromY - toY, toX - fromX) * 180) / Math.PI;
}

export function distanceTo(from: PairLike, to: PairLike): number {
  const [fromX, fromY] = parsePair(from, "from");
  const [toX, toY] = parsePair(to, "to");
  return Math.hypot(toX - fromX, toY - fromY);
}

function normalizedRect(rect: RectLike): Rect {
  const copy = rect instanceof Rect ? rect.copy() : new Rect(rect);
  copy.normalize();
  return copy;
}

function parseRectArgs(args: unknown[]): RectTuple {
  if (args.length === 4 && args.every(isFiniteNumber)) {
    return args as RectTuple;
  }

  if (args.length === 2 && isPair(args[0]) && isPair(args[1])) {
    const [left, top] = parsePair(args[0], "topLeft");
    const [width, height] = parsePair(args[1], "size");
    return [left, top, width, height];
  }

  if (args.length === 1) {
    return resolveRectLike(args[0], 0);
  }

  throw new TypeError(
    "Rect requires (left, top, width, height), ([left, top], [width, height]), another Rect, [left, top, width, height], or an object with a `.rect` property/method.",
  );
}

/**
 * Resolves a single constructor argument to a `[left, top, width, height]`
 * tuple, matching rect.py's `_handle_one_arg`: accepts a Rect, a 4-tuple, a
 * `{left,top,width,height}` or `{x,y,w,h}` object, or — recursively — any
 * object exposing a `.rect` property or method (e.g. an `Actor`), so that
 * `new Rect(actor)` works without `actor.ts` knowing anything about `Rect`.
 */
function resolveRectLike(value: unknown, depth: number): RectTuple {
  if (value instanceof Rect) {
    return [value.left, value.top, value.width, value.height];
  }
  if (isRectTuple(value)) {
    const [left, top, width, height] = value;
    return [left, top, width, height];
  }
  if (isRectObject(value)) {
    return [value.left, value.top, value.width, value.height];
  }
  if (isXywhObject(value)) {
    return [value.x, value.y, value.w, value.h];
  }
  if (isRecord(value) && "rect" in value) {
    if (depth > 16) {
      throw new TypeError(
        "Rect: exceeded recursion depth resolving a `.rect` reference.",
      );
    }
    const member = (value as { rect: unknown }).rect;
    const resolved = typeof member === "function" ? member.call(value) : member;
    return resolveRectLike(resolved, depth + 1);
  }

  throw new TypeError(
    "Rect requires (left, top, width, height), ([left, top], [width, height]), another Rect, [left, top, width, height], or an object with a `.rect` property/method.",
  );
}

function parseOffset(
  xOrOffset: number | PairLike,
  y: number | undefined,
  label: string,
): Point {
  if (isPair(xOrOffset) && y === undefined) {
    return parsePair(xOrOffset, label);
  }
  if (isFiniteNumber(xOrOffset) && isFiniteNumber(y)) {
    return [xOrOffset, y];
  }
  throw new TypeError(
    `${label} requires two finite numbers or a two-number tuple.`,
  );
}

function parsePair(value: unknown, label: string): Point {
  return requirePoint(value, label);
}

function isRectTuple(
  value: unknown,
): value is readonly [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1]) &&
    isFiniteNumber(value[2]) &&
    isFiniteNumber(value[3])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRectObject(
  value: unknown,
): value is { left: number; top: number; width: number; height: number } {
  return (
    isRecord(value) &&
    isFiniteNumber(value.left) &&
    isFiniteNumber(value.top) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  );
}

function isXywhObject(
  value: unknown,
): value is { x: number; y: number; w: number; h: number } {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.w) &&
    isFiniteNumber(value.h)
  );
}
