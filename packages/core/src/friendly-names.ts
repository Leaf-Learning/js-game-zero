/**
 * Lets learners reach library names however they guess to spell them. The
 * library's own names follow Pygame Zero (`filled_circle`, `angle_to`,
 * `colliderect`), but most JavaScript learners try camelCase first
 * (`filledCircle`, `angleTo`, `collideRect`). Both spellings reach the same
 * member, and on the service globals a genuine misspelling fails with a
 * suggestion instead of `undefined is not a function`.
 *
 * The extra spellings are deliberately not part of the typed API: TypeScript
 * users see one name, and the docs teach one style.
 */
import { closestName } from "./util";

/**
 * camelCase spellings for Pygame Zero names that run words together, which
 * a mechanical snake_case conversion can't split.
 */
const runTogetherAliases: ReadonlyMap<string, string> = new Map(
  Object.entries({
    collidepoint: "collidePoint",
    colliderect: "collideRect",
    collidelist: "collideList",
    collidelistall: "collideListAll",
    collidedict: "collideDict",
    collidedictall: "collideDictAll",
    unionall: "unionAll",
    unionall_ip: "unionAllIp",
    topleft: "topLeft",
    topright: "topRight",
    bottomleft: "bottomLeft",
    bottomright: "bottomRight",
    midtop: "midTop",
    midleft: "midLeft",
    midright: "midRight",
    midbottom: "midBottom",
    centerx: "centerX",
    centery: "centerY",
    fadeout: "fadeOut",
    setdefault: "setDefault",
  }),
);

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

/** `filled_circle` → `filledCircle`, `collidepoint` → `collidePoint`. */
export function camelCaseAlias(name: string): string | undefined {
  const runTogether = runTogetherAliases.get(name);
  if (runTogether !== undefined) return runTogether;
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(name)) return undefined;
  return name.replace(/_([a-z0-9])/g, (_match, letter: string) =>
    letter.toUpperCase(),
  );
}

/**
 * Defines a camelCase alias on `prototype` for each of its own snake_case
 * methods and accessors (`angle_to` → `angleTo`, `topleft` → `topLeft`).
 * Aliases are non-enumerable and never replace an existing member.
 */
export function addCamelCaseAliases(prototype: object): void {
  for (const name of Object.getOwnPropertyNames(prototype)) {
    const alias = camelCaseAlias(name);
    if (alias === undefined || alias in prototype) continue;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor) continue;
    Object.defineProperty(prototype, alias, {
      ...descriptor,
      enumerable: false,
    });
  }
}

/** Case- and underscore-insensitive form used to match guessed spellings. */
function looseName(name: string): string {
  return name.toLowerCase().replaceAll("_", "");
}

function memberNames(target: object): string[] {
  const names = new Set<string>();
  for (
    let current: object | null = target;
    current && current !== Object.prototype && current !== Function.prototype;
    current = Object.getPrototypeOf(current) as object | null
  ) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name !== "constructor" && !name.startsWith("_")) names.add(name);
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
   * Suggestions for guesses that belong somewhere else, by loose name:
   * `{ drawrect: "screen.draw.rect" }` answers `screen.drawRect`.
   */
  readonly hints?: Readonly<Record<string, string>>;
};

const friendlyServices = new WeakMap<object, object>();

/**
 * Wraps a library service (`screen`, `clock`, `keys`, ...) so any spelling
 * of a member that differs only in case or underscores reaches it
 * (`filledCircle`, `keys.space`), and reading a member that doesn't exist
 * throws `screen.draw.cirlce doesn't exist. Did you mean screen.draw.circle?`.
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
  let byLooseName: Map<string, string> | null = null;
  const resolve = (property: string): string | undefined => {
    if (hidden.has(property)) return undefined;
    if (property in target) return property;
    byLooseName ??= new Map(
      visibleNames().map((name) => [looseName(name), name]),
    );
    return byLooseName.get(looseName(property));
  };
  const bound = new Map<string, unknown>();
  const proxy = new Proxy(target, {
    get(proxyTarget, property) {
      if (typeof property !== "string") {
        return Reflect.get(proxyTarget, property, proxyTarget);
      }
      const name = resolve(property);
      if (name === undefined) {
        if (toolingProperties.has(property) || property in Object.prototype) {
          return undefined;
        }
        const hint = options.hints?.[looseName(property)];
        const suggestion = closestName(property, visibleNames());
        const meant =
          hint ??
          (suggestion === undefined ? undefined : `${label}.${suggestion}`);
        throw new TypeError(
          `${label}.${property} doesn't exist.${
            meant === undefined ? "" : ` Did you mean ${meant}?`
          }`,
        );
      }
      const value = Reflect.get(proxyTarget, name, proxyTarget) as unknown;
      const descriptor = Object.getOwnPropertyDescriptor(proxyTarget, name);
      // A frozen member must be returned exactly as it is (a Proxy invariant).
      if (descriptor && !descriptor.configurable && !descriptor.writable) {
        return value;
      }
      if (typeof value === "function") {
        const cachedMethod = bound.get(name);
        if (cachedMethod !== undefined) return cachedMethod;
        const method = (value as (...args: unknown[]) => unknown).bind(
          proxyTarget,
        );
        bound.set(name, method);
        return method;
      }
      if (nested.has(name) && isPlainObject(value)) {
        return friendlyService(value, `${label}.${name}`, {
          hints: options.hints ?? {},
        });
      }
      return value;
    },
    set(proxyTarget, property, value) {
      const name =
        typeof property === "string"
          ? (resolve(property) ?? property)
          : property;
      return Reflect.set(proxyTarget, name, value, proxyTarget);
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
