/**
 * Well-known brand answered by every active-service proxy's `get` trap.
 * Lets callers (e.g. `RunOptions` resolvers) detect "this is the ambient
 * public export" and treat it as "use the default" instead of installing it
 * as its own backing target, which would otherwise resolve back to itself
 * and recurse infinitely.
 */
export const activeServiceProxyBrand = Symbol("activeServiceProxy");

/** True when `value` is a proxy created by {@link createActiveServiceProxy}. */
export function isActiveServiceProxy(value: unknown): boolean {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[activeServiceProxyBrand] === true
  );
}

/**
 * Creates the process-level compatibility proxy used by learner-facing
 * singleton services. Runtime callbacks choose the active run-scoped target;
 * property access outside a callback falls back through `getActive`.
 *
 * Keeping the complete proxy behavior here prevents clock, input, audio,
 * rendering, and storage from drifting apart as new reflective operations are
 * added. Methods are bound to the resolved target so private fields and class
 * receivers continue to work through the proxy.
 */
export function createActiveServiceProxy<T extends object>(
  getActive: () => T,
): T {
  const proxy: T = new Proxy({} as T, {
    get(_proxyTarget, property) {
      if (property === activeServiceProxyBrand) return true;
      const target = getActive();
      if ((target as unknown) === proxy) {
        // Defense in depth: resolveStorage/setActiveStorage-style callers
        // should already unwrap the proxy before installing it as the
        // active target, but if that ever regresses, fail loudly instead of
        // recursing infinitely.
        throw new Error(
          "Active-service resolution returned the ambient proxy itself. " +
            "The public singleton export cannot be installed as its own " +
            "backing target; pass a concrete instance instead.",
        );
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(_proxyTarget, property, value) {
      const target = getActive();
      return Reflect.set(target, property, value, target);
    },
    deleteProperty(_proxyTarget, property) {
      return Reflect.deleteProperty(getActive(), property);
    },
    has(_proxyTarget, property) {
      if (property === activeServiceProxyBrand) return true;
      return Reflect.has(getActive(), property);
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(getActive());
    },
    ownKeys() {
      return Reflect.ownKeys(getActive());
    },
    getOwnPropertyDescriptor(_proxyTarget, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(
        getActive(),
        property,
      );
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
  return proxy;
}
