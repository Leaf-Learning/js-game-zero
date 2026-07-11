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
  return new Proxy({} as T, {
    get(_proxyTarget, property) {
      const target = getActive();
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
}
