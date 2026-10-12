/**
 * Every library name has one spelling, its camelCase one (`filledCircle`,
 * `angleTo`, `collideRect`), and constants stay upper case (`keys.SPACE`).
 * Learners who know Pygame Zero, or who guess, write `filled_circle`,
 * `angle_to` or `colliderect` instead. These helpers make such a spelling
 * fail where it's written, naming the real member, instead of later as
 * `undefined is not a function`.
 */
import { closestName, looseName } from "./util";

/** Probes from tooling (promises, JSON, test matchers) that must not throw. */
const toolingProperties = new Set([
  "then",
  "toJSON",
  "constructor",
  "valueOf",
  "toString",
  "inspect",
  "asymmetricMatch",
  "nodeType",
  "$$typeof",
]);

/** The member each spelling guard stands in for, keyed by its accessor. */
const guardedMembers = new WeakMap<Function, string>();

/**
 * The lowercase spellings of a camelCase name, with or without an underscore
 * between each pair of its words: `collideListAll` gives `collidelistall`,
 * `collide_list_all`, `collidelist_all` and `collide_listall`. Pygame Zero's
 * names (`colliderect`, `angle_to`, `unionall_ip`) are all among them.
 */
export function otherSpellings(name: string): string[] {
  const words = name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g) ?? [];
  if (words.length < 2 || words.join("") !== name) return [];
  let spellings = [words[0]!.toLowerCase()];
  for (const word of words.slice(1)) {
    const lower = word.toLowerCase();
    spellings = spellings.flatMap((start) => [
      `${start}${lower}`,
      `${start}_${lower}`,
    ]);
  }
  return spellings;
}

/**
 * Makes the other spellings of `target`'s camelCase members throw when read
 * or written, naming the member: reading `actor.angle_to` throws
 * "actor.angle_to doesn't exist. Did you mean actor.angleTo?". `fields`
 * names members that each instance sets on itself rather than inheriting
 * from `target`. A spelling `target` already has is left alone, and guards
 * are non-enumerable, so they never show up as data.
 */
export function guardSpellings(
  target: object,
  label: string,
  fields: readonly string[] = [],
): void {
  const names = new Set([...Object.getOwnPropertyNames(target), ...fields]);
  for (const name of names) {
    if (name === "constructor" || name.startsWith("_")) continue;
    for (const spelling of otherSpellings(name)) {
      if (spelling in target) continue;
      const message = `${label}.${spelling} doesn't exist. Did you mean ${label}.${name}?`;
      const fail = (): never => {
        throw new TypeError(message);
      };
      guardedMembers.set(fail, name);
      Object.defineProperty(target, spelling, {
        get: fail,
        set: fail,
        enumerable: false,
        configurable: true,
      });
    }
  }
}

/**
 * The real member a spelling guard on `target` or its prototypes stands in
 * for (`colliderect` → `collideRect`), or undefined for any other name.
 */
export function guardedMember(
  target: object,
  property: string,
): string | undefined {
  for (
    let current: object | null = target;
    current !== null;
    current = Object.getPrototypeOf(current) as object | null
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(current, property);
    if (descriptor) {
      return descriptor.get ? guardedMembers.get(descriptor.get) : undefined;
    }
  }
  return undefined;
}

function isGuard(owner: object, name: string): boolean {
  const getter = Object.getOwnPropertyDescriptor(owner, name)?.get;
  return getter !== undefined && guardedMembers.has(getter);
}

function memberNames(target: object): string[] {
  const names = new Set<string>();
  for (
    let current: object | null = target;
    current && current !== Object.prototype && current !== Function.prototype;
    current = Object.getPrototypeOf(current) as object | null
  ) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === "constructor" || name.startsWith("_")) continue;
      if (!isGuard(current, name)) names.add(name);
    }
  }
  return [...names];
}

export type FriendlyServiceOptions = {
  /** Members learners shouldn't reach (internal helpers). */
  readonly hidden?: readonly string[];
  /** Plain-object members to wrap the same way (`screen.draw`). */
  readonly nested?: readonly string[];
  /**
   * Suggestions for guesses that belong somewhere else, by loose name
   * (lowercase, without underscores): `{ drawrect: "screen.draw.rect" }`
   * answers `screen.drawRect`.
   */
  readonly hints?: Readonly<Record<string, string>>;
};

const friendlyServices = new WeakMap<object, object>();

/**
 * Wraps a library service (`screen`, `clock`, `keys`, ...) so reading a
 * member it doesn't have throws
 * `screen.draw.cirlce doesn't exist. Did you mean screen.draw.circle?`,
 * including another spelling of a real member
 * (`screen.draw.filled_circle` suggests `screen.draw.filledCircle`).
 * Plain-object members (`screen.draw`) are wrapped the same way. Methods
 * stay bound to the service, so they can be passed around as callbacks.
 */
export function friendlyService<T extends object>(
  target: T,
  label: string,
  options: FriendlyServiceOptions = {},
): T {
  const cached = friendlyServices.get(target);
  if (cached) return cached as T;
  const hidden = new Set(options.hidden ?? []);
  const nested = new Set(options.nested ?? []);
  const visibleNames = (): string[] =>
    memberNames(target).filter((name) => !hidden.has(name));
  const bound = new Map<string, unknown>();
  const proxy = new Proxy(target, {
    get(proxyTarget, property) {
      if (typeof property !== "string") {
        return Reflect.get(proxyTarget, property, proxyTarget);
      }
      if (hidden.has(property) || !(property in proxyTarget)) {
        if (toolingProperties.has(property) || property in Object.prototype) {
          return undefined;
        }
        // Another spelling of a real member names it before any hint does.
        const names = visibleNames();
        const respelled = names.find(
          (name) => looseName(name) === looseName(property),
        );
        const suggestion = respelled ?? closestName(property, names);
        const hint = options.hints?.[looseName(property)];
        const meant =
          respelled === undefined && hint !== undefined
            ? hint
            : suggestion === undefined
              ? undefined
              : `${label}.${suggestion}`;
        throw new TypeError(
          `${label}.${property} doesn't exist.${
            meant === undefined ? "" : ` Did you mean ${meant}?`
          }`,
        );
      }
      // A spelling guard on the service throws its own suggestion here.
      const value = Reflect.get(proxyTarget, property, proxyTarget) as unknown;
      const descriptor = Object.getOwnPropertyDescriptor(proxyTarget, property);
      // A frozen member must be returned exactly as it is (a Proxy invariant).
      if (descriptor && !descriptor.configurable && !descriptor.writable) {
        return value;
      }
      if (typeof value === "function") {
        const cachedMethod = bound.get(property);
        if (cachedMethod !== undefined) return cachedMethod;
        const method = (value as (...args: unknown[]) => unknown).bind(
          proxyTarget,
        );
        bound.set(property, method);
        return method;
      }
      if (nested.has(property) && isPlainObject(value)) {
        return friendlyService(value, `${label}.${property}`, {
          hints: options.hints ?? {},
        });
      }
      return value;
    },
    set(proxyTarget, property, value) {
      return Reflect.set(proxyTarget, property, value, proxyTarget);
    },
    has(proxyTarget, property) {
      return Reflect.has(proxyTarget, property);
    },
  });
  friendlyServices.set(target, proxy);
  return proxy;
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
