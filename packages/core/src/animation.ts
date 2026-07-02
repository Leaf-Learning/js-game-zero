// The tween easing curves below are ported from Pygame Zero's animation
// module (LGPL-3.0), which in turn credits: "Easing Functions ported from
// the Clutter Project via kivy.org".
import { Clock, clock } from "./clock";

export type TweenName = keyof typeof tweens;

export type AnimationOptions<T extends object> = Partial<
  Record<keyof T, unknown>
> & {
  tween?: TweenName | string;
  duration?: number;
  on_finished?: () => void;
};

type TargetValue = number | number[];

const animationsByTarget = new WeakMap<
  object,
  Map<string, Animation<object>>
>();
let activeAnimationClock: Clock | null = null;

export const tweens = Object.freeze({
  linear(n: number): number {
    return n;
  },
  accelerate(n: number): number {
    return n * n;
  },
  decelerate(n: number): number {
    return -n * (n - 2);
  },
  accel_decel(n: number): number {
    const p = n * 2;
    if (p < 1) return 0.5 * p * p;
    const q = p - 1;
    return -0.5 * (q * (q - 2) - 1);
  },
  in_elastic(n: number): number {
    const period = 0.3;
    const shift = period / 4;
    if (n === 0 || n === 1) return n;
    const q = n - 1;
    return -(2 ** (10 * q) * Math.sin(((q - shift) * (2 * Math.PI)) / period));
  },
  out_elastic(n: number): number {
    const period = 0.3;
    const shift = period / 4;
    if (n === 0 || n === 1) return n;
    return (
      2 ** (-10 * n) * Math.sin(((n - shift) * (2 * Math.PI)) / period) + 1
    );
  },
  in_out_elastic(n: number): number {
    const period = 0.45;
    const shift = period / 4;
    const p = n * 2;
    if (p === 0) return 0;
    if (p === 2) return 1;
    if (p < 1) {
      const q = p - 1;
      return (
        -0.5 *
        (2 ** (10 * q) * Math.sin(((q - shift) * (2 * Math.PI)) / period))
      );
    }
    const q = p - 1;
    return (
      0.5 *
        (2 ** (-10 * q) * Math.sin(((q - shift) * (2 * Math.PI)) / period)) +
      1
    );
  },
  bounce_end(n: number): number {
    return outBounce(n);
  },
  bounce_start(n: number): number {
    return 1 - outBounce(1 - n);
  },
  bounce_start_end(n: number): number {
    const p = n * 2;
    if (p < 1) return (1 - outBounce(1 - p)) * 0.5;
    return outBounce(p - 1) * 0.5 + 0.5;
  },
  end_elastic(n: number): number {
    return tweens.in_elastic(n);
  },
  start_elastic(n: number): number {
    return tweens.out_elastic(n);
  },
  both_elastic(n: number): number {
    return tweens.in_out_elastic(n);
  },
});

export const tweenNames = Object.freeze(Object.keys(tweens) as TweenName[]);

export class Animation<T extends object = object> {
  on_finished: (() => void) | undefined;
  readonly object: T;
  readonly duration: number;
  readonly tween: TweenName;
  private elapsed = 0;
  private targetValues = new Map<string, TargetValue>();
  private initialValues = new Map<string, TargetValue>();
  private readonly scheduler: Clock;
  private readonly tickCallback = (dt: number) => this.update(dt);
  private _running = true;

  constructor(
    object: T,
    options: AnimationOptions<T>,
    scheduler: Clock = getAnimationClock(),
  ) {
    if (typeof object !== "object" || object === null) {
      throw new TypeError("Animation target must be an object.");
    }
    const { tween = "linear", duration = 1, on_finished, ...targets } = options;
    this.object = object;
    this.duration = validateDuration(duration);
    this.tween = resolveTween(tween);
    this.on_finished = on_finished;
    this.scheduler = scheduler;

    const targetEntries = Object.entries(targets).filter(
      ([, value]) => value !== undefined,
    );
    if (targetEntries.length === 0) {
      throw new TypeError("Animation requires at least one target property.");
    }

    for (const [property, targetValue] of targetEntries) {
      if (!(property in object)) {
        throw new ValueError(`object has no attribute ${property} to animate`);
      }
      const initialValue = normalizeTargetValue(
        (object as Record<string, unknown>)[property],
        property,
      );
      const finalValue = normalizeTargetValue(
        targetValue,
        property,
        initialValue,
      );
      this.initialValues.set(property, initialValue);
      this.targetValues.set(property, finalValue);
      replaceExistingAnimation(object, property, this as Animation<object>);
    }

    this.scheduler.each_tick(this.tickCallback);
  }

  get running(): boolean {
    return this._running;
  }

  update(dt: number): void {
    if (!this._running) return;
    this.elapsed += dt;
    const progress =
      this.duration === 0 ? 1 : Math.min(1, this.elapsed / this.duration);
    if (progress >= 1) {
      this.completeNaturally();
      return;
    }
    this.apply(tweens[this.tween](progress));
  }

  stop(complete = false): void {
    if (!this._running) return;
    if (complete) {
      this.apply(1);
    }
    this._running = false;
    for (const property of [...this.targetValues.keys()]) {
      this.removeTarget(property, false);
    }
    this.scheduler.unschedule(this.tickCallback);
  }

  removeTarget(property: string, stopIfEmpty = true): void {
    this.targetValues.delete(property);
    this.initialValues.delete(property);
    const registry = animationsByTarget.get(this.object);
    if (registry?.get(property) === this) {
      registry.delete(property);
      if (registry.size === 0) animationsByTarget.delete(this.object);
    }
    if (this.targetValues.size === 0 && stopIfEmpty) {
      this.stop(false);
    }
  }

  private completeNaturally(): void {
    this.apply(1);
    const onFinished = this.on_finished;
    this.stop(false);
    onFinished?.();
  }

  private apply(progress: number): void {
    for (const [property, target] of this.targetValues) {
      const start = this.initialValues.get(property);
      if (start === undefined) continue;
      (this.object as Record<string, unknown>)[property] = interpolateValue(
        progress,
        start,
        target,
      );
    }
  }
}

export class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValueError";
  }
}

export function animate<T extends object>(
  object: T,
  options: AnimationOptions<T>,
): Animation<T> {
  return new Animation(object, options);
}

export function withAnimationClock<T>(scheduler: Clock, callback: () => T): T {
  const previous = activeAnimationClock;
  activeAnimationClock = scheduler;
  try {
    return callback();
  } finally {
    activeAnimationClock = previous;
  }
}

function getAnimationClock(): Clock {
  return activeAnimationClock ?? clock;
}

function replaceExistingAnimation(
  object: object,
  property: string,
  animation: Animation<object>,
): void {
  let registry = animationsByTarget.get(object);
  if (!registry) {
    registry = new Map();
    animationsByTarget.set(object, registry);
  }
  const previous = registry.get(property);
  if (previous && previous !== animation) {
    previous.removeTarget(property);
  }
  registry.set(property, animation);
}

function validateDuration(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("duration must be a finite number.");
  }
  if (value < 0) throw new RangeError("duration must be non-negative.");
  return value;
}

function resolveTween(name: string): TweenName {
  if (name in tweens) return name as TweenName;
  const suggestion = nearestTween(name);
  if (suggestion) {
    throw new Error(
      `No tween called ${name} found, did you mean ${suggestion}?`,
    );
  }
  throw new Error(`No tween called ${name} found.`);
}

function nearestTween(name: string): string | null {
  let bestName: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of tweenNames) {
    const distance = levenshtein(name, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = candidate;
    }
  }
  return bestDistance <= 3 ? bestName : null;
}

function normalizeTargetValue(
  value: unknown,
  property: string,
  sameShapeAs?: TargetValue,
): TargetValue {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (sameShapeAs !== undefined && Array.isArray(sameShapeAs)) {
      throw new TypeError(
        `${property} target must match the existing tuple shape.`,
      );
    }
    return value;
  }
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  ) {
    if (
      sameShapeAs !== undefined &&
      (!Array.isArray(sameShapeAs) || sameShapeAs.length !== value.length)
    ) {
      throw new TypeError(
        `${property} target must match the existing tuple shape.`,
      );
    }
    return [...value];
  }
  throw new TypeError(`${property} must be a finite number or numeric tuple.`);
}

function interpolateValue(
  progress: number,
  start: TargetValue,
  target: TargetValue,
): TargetValue {
  if (typeof start === "number" && typeof target === "number") {
    return start + (target - start) * progress;
  }
  if (Array.isArray(start) && Array.isArray(target)) {
    return start.map(
      (value, index) => value + ((target[index] ?? value) - value) * progress,
    );
  }
  throw new TypeError("Cannot interpolate mismatched values.");
}

function outBounce(n: number): number {
  if (n < 1 / 2.75) return 7.5625 * n * n;
  if (n < 2 / 2.75) {
    const p = n - 1.5 / 2.75;
    return 7.5625 * p * p + 0.75;
  }
  if (n < 2.5 / 2.75) {
    const p = n - 2.25 / 2.75;
    return 7.5625 * p * p + 0.9375;
  }
  const p = n - 2.625 / 2.75;
  return 7.5625 * p * p + 0.984375;
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      current[j + 1] = Math.min(
        (current[j] ?? 0) + 1,
        (previous[j + 1] ?? 0) + 1,
        (previous[j] ?? 0) + (a[i] === b[j] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length] ?? 0;
}
