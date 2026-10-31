// The tweens' curves are Robert Penner's easing equations (MIT License,
// copyright 2001 Robert Penner; see LICENSE), each with a start of 0, a
// change of 1 and a duration of 1, so it maps progress from 0 to 1 onto
// eased progress. The tween names are Pygame Zero's for those curves.
import { Clock, clock } from "./clock";
import { guardedMember, guardSpellings } from "./friendly-names";
import { didYouMean, levenshtein, looseName } from "./util";

export type TweenName = keyof typeof tweens;

export type AnimationOptions<T extends object> = Partial<
  Record<keyof T, unknown>
> & {
  tween?: TweenName | string;
  duration?: number;
  onFinished?: () => void;
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
    return easeInQuad(n);
  },
  decelerate(n: number): number {
    return easeOutQuad(n);
  },
  accelDecel(n: number): number {
    return easeInOutQuad(n);
  },
  inElastic(n: number): number {
    return easeInElastic(n);
  },
  outElastic(n: number): number {
    return easeOutElastic(n);
  },
  inOutElastic(n: number): number {
    return easeInOutElastic(n);
  },
  bounceEnd(n: number): number {
    return easeOutBounce(n);
  },
  bounceStart(n: number): number {
    return easeInBounce(n);
  },
  bounceStartEnd(n: number): number {
    return easeInOutBounce(n);
  },
  endElastic(n: number): number {
    return tweens.inElastic(n);
  },
  startElastic(n: number): number {
    return tweens.outElastic(n);
  },
  bothElastic(n: number): number {
    return tweens.inOutElastic(n);
  },
  // Plain-language names: CSS's easing words, and what the motion looks like.
  easeIn(n: number): number {
    return tweens.accelerate(n);
  },
  easeOut(n: number): number {
    return tweens.decelerate(n);
  },
  easeInOut(n: number): number {
    return tweens.accelDecel(n);
  },
  bounce(n: number): number {
    return tweens.bounceEnd(n);
  },
  spring(n: number): number {
    return tweens.outElastic(n);
  },
});

export const tweenNames = Object.freeze(Object.keys(tweens) as TweenName[]);

export class Animation<T extends object = object> {
  onFinished: (() => void) | undefined;
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
    const { tween = "linear", duration = 1, onFinished, ...targets } = options;
    this.object = object;
    this.duration = validateDuration(duration);
    this.tween = resolveTween(tween);
    this.onFinished = onFinished;
    this.scheduler = scheduler;

    const targetEntries = Object.entries(targets).filter(
      ([, value]) => value !== undefined,
    );
    if (targetEntries.length === 0) {
      throw new TypeError("Animation requires at least one target property.");
    }

    for (const [property, targetValue] of targetEntries) {
      if (!(property in object)) {
        throw new ValueError(
          `object has no attribute ${property} to animate.${didYouMean(
            property,
            ["duration", "tween", "onFinished", ...propertyNames(object)],
          )}`,
        );
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

    this.scheduler.eachTick(this.tickCallback);
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
    const onFinished = this.onFinished;
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

guardSpellings(Animation.prototype, "animation", ["onFinished"]);

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

/**
 * `Animation` and `animate` as a game's code gets them: they run on the
 * game's own clock wherever they're called, so one started outside a hook,
 * as in a promise callback, doesn't go to a clock that never ticks.
 */
export function animationsOn(scheduler: Clock): {
  readonly Animation: typeof Animation;
  readonly animate: typeof animate;
} {
  class GameAnimation<T extends object = object> extends Animation<T> {
    constructor(
      object: T,
      options: AnimationOptions<T>,
      clock: Clock = scheduler,
    ) {
      super(object, options, clock);
    }
  }
  return {
    Animation: GameAnimation,
    animate: (object, options) => new GameAnimation(object, options),
  };
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

/** Own and inherited property names, including an Actor's x/y/angle getters. */
function propertyNames(object: object): string[] {
  const names: string[] = [];
  for (
    let current: object | null = object;
    current && current !== Object.prototype;
    current = Object.getPrototypeOf(current) as object | null
  ) {
    names.push(...Object.getOwnPropertyNames(current));
  }
  return names.filter((name) => guardedMember(object, name) === undefined);
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
  const respelled = tweenNames.find(
    (candidate) => looseName(candidate) === looseName(name),
  );
  if (respelled) return respelled;
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

// Penner's easing equations, by his names, for t from 0 to 1.

const TAU = 2 * Math.PI;

function easeInQuad(t: number): number {
  return t * t;
}

function easeOutQuad(t: number): number {
  return -t * (t - 2);
}

function easeInOutQuad(t: number): number {
  const half = t * 2;
  if (half < 1) return 0.5 * half * half;
  const u = half - 1;
  return -0.5 * (u * (u - 2) - 1);
}

// The elastics swing with amplitude 1 and Penner's default period: 0.3 of
// the duration, or 0.45 in and out. Both ends are pinned exactly, where the
// sine alone would leave one of them a hair off.
function easeInElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  const period = 0.3;
  const u = t - 1;
  return -(2 ** (10 * u) * Math.sin(((u - period / 4) * TAU) / period));
}

function easeOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  const period = 0.3;
  return 2 ** (-10 * t) * Math.sin(((t - period / 4) * TAU) / period) + 1;
}

function easeInOutElastic(t: number): number {
  if (t === 0 || t === 1) return t;
  const period = 0.45;
  const u = t * 2 - 1;
  const wave = Math.sin(((u - period / 4) * TAU) / period);
  if (u < 0) return -0.5 * (2 ** (10 * u) * wave);
  return 0.5 * (2 ** (-10 * u) * wave) + 1;
}

// Four parabolic arcs, each bounce lower than the last.
function easeOutBounce(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) {
    const u = t - 1.5 / 2.75;
    return 7.5625 * u * u + 0.75;
  }
  if (t < 2.5 / 2.75) {
    const u = t - 2.25 / 2.75;
    return 7.5625 * u * u + 0.9375;
  }
  const u = t - 2.625 / 2.75;
  return 7.5625 * u * u + 0.984375;
}

function easeInBounce(t: number): number {
  return 1 - easeOutBounce(1 - t);
}

function easeInOutBounce(t: number): number {
  if (t < 0.5) return easeInBounce(t * 2) * 0.5;
  return easeOutBounce(t * 2 - 1) * 0.5 + 0.5;
}
