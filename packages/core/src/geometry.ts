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
  constructor(topleft: PairLike, size: PairLike);
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

  get centerx(): number {
    return this.left + this.width / 2;
  }

  set centerx(value: number) {
    this.left = requireFiniteNumber(value, "centerx") - this.width / 2;
  }

  get centery(): number {
    return this.top + this.height / 2;
  }

  set centery(value: number) {
    this.top = requireFiniteNumber(value, "centery") - this.height / 2;
  }

  get topleft(): Point {
    return [this.left, this.top];
  }

  set topleft(value: PairLike) {
    const [x, y] = parsePair(value, "topleft");
    this.left = x;
    this.top = y;
  }

  get topright(): Point {
    return [this.right, this.top];
  }

  set topright(value: PairLike) {
    const [x, y] = parsePair(value, "topright");
    this.right = x;
    this.top = y;
  }

  get bottomleft(): Point {
    return [this.left, this.bottom];
  }

  set bottomleft(value: PairLike) {
    const [x, y] = parsePair(value, "bottomleft");
    this.left = x;
    this.bottom = y;
  }

  get bottomright(): Point {
    return [this.right, this.bottom];
  }

  set bottomright(value: PairLike) {
    const [x, y] = parsePair(value, "bottomright");
    this.right = x;
    this.bottom = y;
  }

  get midtop(): Point {
    return [this.centerx, this.top];
  }

  set midtop(value: PairLike) {
    const [x, y] = parsePair(value, "midtop");
    this.centerx = x;
    this.top = y;
  }

  get midleft(): Point {
    return [this.left, this.centery];
  }

  set midleft(value: PairLike) {
    const [x, y] = parsePair(value, "midleft");
    this.left = x;
    this.centery = y;
  }

  get midright(): Point {
    return [this.right, this.centery];
  }

  set midright(value: PairLike) {
    const [x, y] = parsePair(value, "midright");
    this.right = x;
    this.centery = y;
  }

  get midbottom(): Point {
    return [this.centerx, this.bottom];
  }

  set midbottom(value: PairLike) {
    const [x, y] = parsePair(value, "midbottom");
    this.centerx = x;
    this.bottom = y;
  }

  get center(): Point {
    return [this.centerx, this.centery];
  }

  set center(value: PairLike) {
    const [x, y] = parsePair(value, "center");
    this.centerx = x;
    this.centery = y;
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
    copy.move_ip(x, yOffset);
    return copy;
  }

  move_ip(x: number, y: number): void;
  move_ip(offset: PairLike): void;
  move_ip(xOrOffset: number | PairLike, y?: number): void {
    const [x, yOffset] = parseOffset(xOrOffset, y, "move_ip");
    this.left += x;
    this.top += yOffset;
  }

  inflate(x: number, y: number): Rect;
  inflate(size: PairLike): Rect;
  inflate(xOrSize: number | PairLike, y?: number): Rect {
    const [x, yAmount] = parseOffset(xOrSize, y, "inflate");
    const copy = this.copy();
    copy.inflate_ip(x, yAmount);
    return copy;
  }

  inflate_ip(x: number, y: number): void;
  inflate_ip(size: PairLike): void;
  inflate_ip(xOrSize: number | PairLike, y?: number): void {
    const [x, yAmount] = parseOffset(xOrSize, y, "inflate_ip");
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
  clamp_ip(other: RectLike): void {
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
  clip_ip(other: RectLike): void {
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
  union_ip(other: RectLike): void {
    this.applyGeometry(this.union(other));
  }

  unionall(others: RectLike[]): Rect {
    return others.reduce<Rect>(
      (accumulator, other) => accumulator.union(other),
      this.copy(),
    );
  }

  /** Mutating form of {@link unionall}. */
  unionall_ip(others: RectLike[]): void {
    this.applyGeometry(this.unionall(others));
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

  collidepoint(point: PairLike): boolean;
  collidepoint(x: number, y: number): boolean;
  collidepoint(pointOrX: PairLike | number, y?: number): boolean {
    const [x, yPoint] = parseOffset(pointOrX, y, "collidepoint");
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

  colliderect(other: RectLike): boolean {
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

  collidelist(others: RectLike[]): number {
    return others.findIndex((other) => this.colliderect(other));
  }

  collidelistall(others: RectLike[]): number[] {
    const indexes: number[] = [];
    others.forEach((other, index) => {
      if (this.colliderect(other)) indexes.push(index);
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
  collidedict<V>(
    dict: RectDict<V>,
    useValues = true,
  ): [unknown, V] | undefined {
    for (const [key, value] of dictEntries(dict)) {
      const candidate = (useValues ? value : key) as unknown as RectLike;
      if (this.colliderect(candidate)) return [key, value];
    }
    return undefined;
  }

  /** Same as {@link collidedict}, but returns every colliding entry. */
  collidedictall<V>(dict: RectDict<V>, useValues = true): Array<[unknown, V]> {
    const results: Array<[unknown, V]> = [];
    for (const [key, value] of dictEntries(dict)) {
      const candidate = (useValues ? value : key) as unknown as RectLike;
      if (this.colliderect(candidate)) results.push([key, value]);
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
    const [left, top] = parsePair(args[0], "topleft");
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
  if (isPair(value)) return [value[0], value[1]];
  throw new TypeError(`${label} must be a two-number tuple.`);
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (isFiniteNumber(value)) return value;
  throw new TypeError(`${label} must be a finite number.`);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPair(value: unknown): value is PairLike {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
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
