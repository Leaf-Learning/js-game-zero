import { describe, expect, test } from "bun:test";
import {
  DocumentSession,
  type DocumentSnapshot,
  type SaveState,
} from "../client/document-session";
import { LatestOperation } from "../client/latest-operation";

type Deferred = {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("DocumentSession", () => {
  test("serializes writes and coalesces queued edits to the newest revision", async () => {
    const snapshots: DocumentSnapshot[] = [];
    const writes: Deferred[] = [];
    let active = 0;
    let maximumActive = 0;
    const session = new DocumentSession({
      write: async (snapshot) => {
        snapshots.push(snapshot);
        const pending = deferred();
        writes.push(pending);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await pending.promise;
        active -= 1;
      },
      debounceMs: 60_000,
    });

    session.edit("demo", "main.js", "first");
    const flushing = session.flush();
    expect(snapshots.map((snapshot) => snapshot.content)).toEqual(["first"]);

    session.edit("demo", "main.js", "second");
    session.edit("demo", "main.js", "third");
    expect(snapshots).toHaveLength(1);
    writes[0]!.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshots.map((snapshot) => snapshot.content)).toEqual([
      "first",
      "third",
    ]);
    writes[1]!.resolve();
    await flushing;

    expect(maximumActive).toBe(1);
    expect(session.pendingSnapshot()).toBeNull();
    expect(session.state).toBe("saved");
  });

  test("retains failed dirty content and retries it before reporting saved", async () => {
    const states: SaveState[] = [];
    const failure = new Error("save failed");
    let attempts = 0;
    const session = new DocumentSession({
      write: async () => {
        attempts += 1;
        if (attempts === 1) throw failure;
      },
      onStateChange: (state) => states.push(state),
      debounceMs: 60_000,
    });

    session.edit("demo", "main.js", "important work");
    await expect(session.flush()).rejects.toBe(failure);
    expect(session.state).toBe("error");
    expect(session.pendingSnapshot()?.content).toBe("important work");

    await session.flush();
    expect(attempts).toBe(2);
    expect(session.pendingSnapshot()).toBeNull();
    expect(session.state).toBe("saved");
    expect(states).toEqual(["unsaved", "saving", "error", "saving", "saved"]);
  });

  test("a newer edit supersedes failed in-flight content", async () => {
    const first = deferred();
    const contents: string[] = [];
    const session = new DocumentSession({
      write: async (snapshot) => {
        contents.push(snapshot.content);
        if (contents.length === 1) await first.promise;
      },
      debounceMs: 60_000,
    });

    session.edit("demo", "main.js", "old");
    const flushing = session.flush();
    session.edit("demo", "main.js", "new");
    first.reject(new Error("old failed"));
    await expect(flushing).rejects.toThrow("old failed");

    await session.flush();
    expect(contents).toEqual(["old", "new"]);
    expect(session.state).toBe("saved");
  });

  test("a stale obsolete revision drains onward without acknowledging it", async () => {
    const acknowledged: string[] = [];
    let first = true;
    const session = new DocumentSession({
      write: async () => {
        if (first) {
          first = false;
          return "stale";
        }
        return "written";
      },
      onAcknowledge: ({ content }) => acknowledged.push(content),
      debounceMs: 60_000,
    });

    session.edit("demo", "main.js", "old");
    const flushing = session.flush();
    session.edit("demo", "main.js", "new");
    await flushing;

    expect(acknowledged).toEqual(["new"]);
    expect(session.pendingSnapshot()).toBeNull();
    expect(session.state).toBe("saved");
  });

  test("discard drops unsaved revisions so the next flush writes nothing", async () => {
    const contents: string[] = [];
    const session = new DocumentSession({
      write: async ({ content }) => {
        contents.push(content);
      },
      debounceMs: 60_000,
    });

    session.edit("demo", "main.js", "doomed");
    session.discard();
    expect(session.state).toBe("saved");
    expect(session.pendingSnapshot()).toBeNull();

    await session.flush();
    expect(contents).toEqual([]);
  });

  test("discard clears a failed snapshot retained for retry", async () => {
    let attempts = 0;
    const session = new DocumentSession({
      write: async () => {
        attempts += 1;
        throw new Error("conflict");
      },
      debounceMs: 60_000,
    });

    session.edit("demo", "main.js", "conflicted");
    await expect(session.flush()).rejects.toThrow("conflict");
    expect(session.state).toBe("error");

    session.discard();
    await session.flush();
    expect(attempts).toBe(1);
    expect(session.state).toBe("saved");
  });

  test("flush is an idle barrier for navigation and play actions", async () => {
    const write = deferred();
    let navigated = false;
    const session = new DocumentSession({
      write: async () => write.promise,
      debounceMs: 60_000,
    });
    session.edit("demo", "main.js", "work in progress");

    const navigation = session.flush().then(() => {
      navigated = true;
    });
    await Promise.resolve();
    expect(navigated).toBe(false);

    write.resolve();
    await navigation;
    expect(navigated).toBe(true);
    expect(session.state).toBe("saved");
  });

  test("unload delegates only the newest revision to the versioned terminal transport", async () => {
    const active = deferred();
    const normalWrites: DocumentSnapshot[] = [];
    const unloadWrites: DocumentSnapshot[] = [];
    const session = new DocumentSession({
      write: async (snapshot) => {
        normalWrites.push(snapshot);
        if (normalWrites.length === 1) await active.promise;
      },
      writeForUnload: (snapshot) => unloadWrites.push(snapshot),
      debounceMs: 60_000,
    });

    session.edit("demo", "main.js", "REVISION_ONE");
    const flushing = session.flush();
    session.edit("demo", "main.js", "REVISION_TWO");
    session.flushForUnload();

    expect(normalWrites.map(({ content }) => content)).toEqual([
      "REVISION_ONE",
    ]);
    expect(
      unloadWrites.map(({ content, revision }) => ({
        content,
        revision,
      })),
    ).toEqual([{ content: "REVISION_TWO", revision: 2 }]);

    active.resolve();
    await flushing;
    expect(normalWrites.map(({ content }) => content)).toEqual([
      "REVISION_ONE",
      "REVISION_TWO",
    ]);
  });
});

describe("LatestOperation", () => {
  test("invalidates stale asynchronous selections", () => {
    const operations = new LatestOperation();
    const first = operations.begin();
    const second = operations.begin();
    expect(operations.isCurrent(first)).toBe(false);
    expect(operations.isCurrent(second)).toBe(true);
    operations.invalidate();
    expect(operations.isCurrent(second)).toBe(false);
  });
});
