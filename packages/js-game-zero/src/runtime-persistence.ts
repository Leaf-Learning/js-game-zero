import { hasUnsavedChanges, Storage } from "./storage";

const AUTOSAVE_DEBOUNCE_MS = 250;
/** However often a game writes, a change is saved within this long. */
const AUTOSAVE_MAX_WAIT_MS = 1000;

type PersistenceDiagnostic = {
  readonly code: "runtime-error";
  readonly severity: "warning";
  readonly phase: "storage";
  readonly recoverable: true;
  readonly message: string;
};

type PersistenceDiagnosticEmitter = (diagnostic: PersistenceDiagnostic) => void;

export type Autosave = {
  /**
   * Cancels any pending debounce timer and saves immediately, if anything
   * changed since the last save or load, inside stored objects and lists too.
   */
  flush(): Promise<void>;
  /** Unsubscribes from storage changes and browser lifecycle events. */
  detach(): void;
};

/**
 * Coordinates debounced and lifecycle-triggered persistence for one runtime.
 * Writes are serialized and mutations that arrive while a save is active are
 * folded into a subsequent write.
 */
export function attachAutosave(
  storage: Storage,
  emit: PersistenceDiagnosticEmitter,
): Autosave {
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** When the oldest change not yet saved was made. */
  let pendingSince: number | null = null;
  let dirty = false;
  let writing: Promise<void> | null = null;

  const reportSaveFailure = (error: unknown): void => {
    emit(storageWarning(`Failed to auto-save storage: ${errorMessage(error)}`));
  };

  const flush = (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingSince = null;
    if (writing) return writing;
    writing = (async () => {
      // Compares the JSON instead of trusting `dirty` alone, which only a
      // top-level set/delete/clear raises, so `storage.highScores.push(...)`
      // is saved too. A failed save leaves the JSON changed for the next try.
      do {
        dirty = false;
        if (hasUnsavedChanges(storage)) await storage.save();
      } while (dirty);
    })().finally(() => {
      writing = null;
    });
    return writing;
  };

  // Each change waits for a quiet moment before saving, but a game that
  // writes every frame never has one, so the wait is capped.
  const unsubscribe = storage.onChange(() => {
    dirty = true;
    const now = Date.now();
    pendingSince ??= now;
    if (timer !== null) clearTimeout(timer);
    const delay = Math.max(
      0,
      Math.min(AUTOSAVE_DEBOUNCE_MS, pendingSince + AUTOSAVE_MAX_WAIT_MS - now),
    );
    timer = setTimeout(() => {
      timer = null;
      void flush().catch(reportSaveFailure);
    }, delay);
  });

  const hasWindow =
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function";
  const pagehideHandler = hasWindow
    ? () => void flush().catch(reportSaveFailure)
    : undefined;
  const visibilityHandler =
    hasWindow && typeof document !== "undefined"
      ? () => {
          if (document.visibilityState === "hidden") {
            void flush().catch(reportSaveFailure);
          }
        }
      : undefined;
  if (hasWindow && pagehideHandler) {
    window.addEventListener("pagehide", pagehideHandler);
  }
  if (hasWindow && visibilityHandler && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", visibilityHandler);
  }

  return {
    flush,
    detach() {
      unsubscribe();
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (hasWindow && pagehideHandler) {
        window.removeEventListener("pagehide", pagehideHandler);
      }
      if (hasWindow && visibilityHandler && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
    },
  };
}

/** Loads exactly once, preferring an adapter's truly synchronous path. */
export function primeStorage(
  storage: Storage,
  emit: PersistenceDiagnosticEmitter,
): { state: { current: boolean }; promise: Promise<void> } {
  const state = { current: false };
  try {
    if (storage.loadSync()) {
      state.current = true;
      return { state, promise: Promise.resolve() };
    }
  } catch (error) {
    emit(storageWarning(`Failed to load storage: ${errorMessage(error)}`));
    state.current = true;
    return { state, promise: Promise.resolve() };
  }
  const promise = storage
    .load()
    .catch((error: unknown) => {
      emit(storageWarning(`Failed to load storage: ${errorMessage(error)}`));
    })
    .then(() => {
      state.current = true;
    });
  return { state, promise };
}

function storageWarning(message: string): PersistenceDiagnostic {
  return {
    code: "runtime-error",
    severity: "warning",
    phase: "storage",
    recoverable: true,
    message,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
