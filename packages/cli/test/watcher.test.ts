import { expect, test } from "bun:test";
import { setTimeout as delay } from "node:timers/promises";
import { createDebouncedCallback } from "../src/watcher";

test("debounces a burst of project changes", async () => {
  let changes = 0;
  const debounced = createDebouncedCallback(() => {
    changes += 1;
  }, 20);
  try {
    debounced.trigger();
    debounced.trigger();
    debounced.trigger();
    await delay(80);
    expect(changes).toBe(1);
  } finally {
    debounced.close();
  }
});
