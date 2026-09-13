import { watch, type FSWatcher } from "node:fs";

export type ProjectWatcher = { close(): void };

export function watchProject(
  projectRoot: string,
  onChange: () => void,
  debounceMs = 120,
): ProjectWatcher {
  const debounced = createDebouncedCallback(onChange, debounceMs);
  const watcher: FSWatcher = watch(
    projectRoot,
    { recursive: true },
    (_event, filename) => {
      if (filename && ignored(String(filename))) return;
      debounced.trigger();
    },
  );
  return {
    close() {
      debounced.close();
      watcher.close();
    },
  };
}

export function createDebouncedCallback(
  callback: () => void,
  debounceMs: number,
): { trigger(): void; close(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    trigger() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        callback();
      }, debounceMs);
    },
    close() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

function ignored(path: string): boolean {
  return (
    path.startsWith(".git/") ||
    path.includes("/node_modules/") ||
    path.startsWith("node_modules/") ||
    path.endsWith(".swp") ||
    path.endsWith("~")
  );
}
