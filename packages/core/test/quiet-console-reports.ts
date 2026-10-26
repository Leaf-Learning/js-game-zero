import { afterEach, beforeEach } from "bun:test";

/**
 * A run started without a `diagnostics` callback reports to the console.
 * Tests that don't check those reports keep them out of the test output;
 * anything else written to the console still shows.
 */
export function quietConsoleReports(): void {
  const original = { warn: console.warn, error: console.error };
  beforeEach(() => {
    for (const level of ["warn", "error"] as const) {
      console[level] = (...args: unknown[]) => {
        if (typeof args[0] === "string" && args[0].startsWith("js-game-zero: "))
          return;
        original[level](...args);
      };
    }
  });
  afterEach(() => {
    console.warn = original.warn;
    console.error = original.error;
  });
}
