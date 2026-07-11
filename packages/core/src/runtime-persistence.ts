import { Storage } from "./storage";

const AUTOSAVE_DEBOUNCE_MS = 250;

type PersistenceDiagnostic = {
  readonly code: "runtime-error";
  readonly severity: "warning";
  readonly phase: "storage";
  readonly recoverable: true;
  readonly message: string;
};

type PersistenceDiagnosticEmitter = (diagnostic: PersistenceDiagnostic) => void;

export type Autosave = {
  /** Cancels any pending debounce timer and saves immediately, if dirty. */
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
    if (writing) return writing;
    writing = (async () => {
      while (dirty) {
        dirty = false;
        try {
          await storage.save();
        } catch (error) {
          dirty = true;
          throw error;
        }
      }
    })().finally(() => {
      writing = null;
    });
    return writing;
  };

  const unsubscribe = storage.onChange(() => {
    dirty = true;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush().catch(reportSaveFailure);
    }, AUTOSAVE_DEBOUNCE_MS);
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
