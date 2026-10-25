import { watch, type FSWatcher } from "node:fs";
import { relative, sep } from "node:path";

export type ProjectWatcher = { close(): void };

/** Calls `onChange` after main.js or a file in an asset folder changes. */
export function watchProject(
  projectRoot: string,
  assetRoot: string,
  onChange: () => void,
  debounceMs = 120,
): ProjectWatcher {
  const assetFolder = relative(projectRoot, assetRoot).split(sep).join("/");
  const debounced = createDebouncedCallback(onChange, debounceMs);
  const watcher: FSWatcher = watch(
    projectRoot,
    { recursive: true },
    (_event, filename) => {
      if (filename && !isGamePath(String(filename), assetFolder)) return;
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

const assetFolders = new Set(["images", "sounds", "music", "fonts"]);

/**
 * Whether a change at `path`, relative to the project, can change the game:
 * main.js, or something in one of the asset folders the project server serves
 * (beside main.js, or in `assetFolder`, "assets", in that layout). Anything
 * else, a screenshot saved into the project among them, is left alone, as are
 * editors' hidden and backup files.
 */
export function isGamePath(path: string, assetFolder = ""): boolean {
  if (path === "main.js") return true;
  const segments = path.split(/[\\/]/);
  if (assetFolder !== "") {
    if (segments[0] !== assetFolder) return false;
    // The assets folder itself, moved or removed.
    if (segments.length === 1) return true;
    segments.shift();
  }
  const name = segments[segments.length - 1] ?? "";
  return (
    assetFolders.has(segments[0] ?? "") &&
    !name.startsWith(".") &&
    !name.endsWith("~") &&
    !name.endsWith(".swp")
  );
}
