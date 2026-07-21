export type SaveState = "saved" | "saving" | "unsaved" | "error";

export type DocumentSnapshot = {
  readonly project: string;
  readonly path: string;
  readonly content: string;
  readonly revision: number;
};

export type DocumentSessionOptions = {
  readonly write: (
    snapshot: DocumentSnapshot,
  ) => Promise<"written" | "stale" | void>;
  /** Terminal best-effort transport. The server must reject stale revisions. */
  readonly writeForUnload?: (snapshot: DocumentSnapshot) => void;
  readonly onStateChange?: (state: SaveState) => void;
  readonly onAcknowledge?: (snapshot: DocumentSnapshot) => void;
  readonly onError?: (error: unknown) => void;
  readonly debounceMs?: number;
};

export class StaleDocumentWriteError extends Error {
  constructor(readonly snapshot: DocumentSnapshot) {
    super("The file changed before this revision could be saved.");
    this.name = "StaleDocumentWriteError";
  }
}

/**
 * Owns the editor's save queue. There is never more than one write in flight,
 * and edits made while a write is pending are collapsed to the newest revision.
 */
export class DocumentSession {
  readonly #options: DocumentSessionOptions;
  #revision = 0;
  #queued: DocumentSnapshot | null = null;
  #latestUnacknowledged: DocumentSnapshot | null = null;
  #draining: Promise<void> | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #state: SaveState = "saved";

  constructor(options: DocumentSessionOptions) {
    this.#options = options;
  }

  get state(): SaveState {
    return this.#state;
  }

  edit(project: string, path: string, content: string): DocumentSnapshot {
    const snapshot = { project, path, content, revision: ++this.#revision };
    this.#queued = snapshot;
    this.#latestUnacknowledged = snapshot;
    this.#setState("unsaved");
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#ensureDrain().catch(() => undefined);
    }, this.#options.debounceMs ?? 600);
    return snapshot;
  }

  /** Forces any debounced edit into the queue and resolves only when idle. */
  async flush(): Promise<void> {
    this.#clearTimer();
    await this.#ensureDrain();
  }

  pendingSnapshot(): DocumentSnapshot | null {
    return this.#latestUnacknowledged;
  }

  /**
   * Drops every unsaved local revision, e.g. after the user chooses to reload
   * the server's copy of a conflicted file. The next flush is a no-op instead
   * of retrying the discarded content.
   */
  discard(): void {
    this.#clearTimer();
    this.#queued = null;
    this.#latestUnacknowledged = null;
    this.#setState("saved");
  }

  /**
   * Sends the newest dirty revision with unload-safe transport. Normal writes
   * remain serialized; the server's base-version/revision protocol makes this
   * terminal request authoritative if it races the active write.
   */
  flushForUnload(): void {
    this.#clearTimer();
    const snapshot = this.#latestUnacknowledged;
    if (snapshot) this.#options.writeForUnload?.(snapshot);
  }

  #ensureDrain(): Promise<void> {
    if (!this.#draining) {
      this.#draining = this.#drain().finally(() => {
        this.#draining = null;
      });
    }
    return this.#draining;
  }

  async #drain(): Promise<void> {
    while (this.#queued) {
      const snapshot = this.#queued;
      this.#queued = null;
      this.#setState("saving");
      try {
        const outcome = await this.#options.write(snapshot);
        if (outcome === "stale") {
          // A terminal/unload write may already have superseded this queued
          // snapshot. Only a stale result for the newest local revision is a
          // failed acknowledgement; older revisions can safely drain onward.
          if (this.#latestUnacknowledged?.revision !== snapshot.revision) {
            continue;
          }
          throw new StaleDocumentWriteError(snapshot);
        }
      } catch (error) {
        // A newer edit supersedes the failed content. Otherwise retain the
        // failed snapshot so the next manual/automatic flush retries it.
        if (!this.#queued) this.#queued = snapshot;
        this.#setState("error");
        this.#options.onError?.(error);
        throw error;
      }

      this.#options.onAcknowledge?.(snapshot);
      if (this.#latestUnacknowledged?.revision === snapshot.revision) {
        this.#latestUnacknowledged = null;
      }
    }
    this.#setState(this.#latestUnacknowledged ? "unsaved" : "saved");
  }

  #clearTimer(): void {
    if (!this.#timer) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #setState(state: SaveState): void {
    if (state === this.#state) return;
    this.#state = state;
    this.#options.onStateChange?.(state);
  }
}
