import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  JsonStorageError,
  Storage,
  storage,
  type StorageAdapter,
} from "@js-game-zero/core";
import {
  createLocalStorageAdapter,
  createStorage,
  type BrowserStorageLike,
} from "@js-game-zero/core/host";
import { createSandboxFileStorageAdapter } from "@js-game-zero/core/node";
import { attachAutosave } from "../src/runtime-persistence";
import { getActiveStorage, setActiveStorage } from "../src/storage";

class MemoryAdapter implements StorageAdapter {
  readonly path: string;
  text: string | null;
  loadCalls = 0;
  loadSyncCalls = 0;

  constructor(path = "memory", text: string | null = null) {
    this.path = path;
    this.text = text;
  }

  async load(): Promise<string | null> {
    this.loadCalls += 1;
    return this.text;
  }

  loadSync(): string | null {
    this.loadSyncCalls += 1;
    return this.text;
  }

  save(text: string): void {
    this.text = text;
  }
}

class MemoryLocalStorage implements BrowserStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function proxy(storage: Storage): Storage & Record<string, unknown> {
  return storage as Storage & Record<string, unknown>;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

describe("JSON storage map and proxy API", () => {
  test("empty load, set/get, setDefault, proxy access, and clear", async () => {
    const adapter = new MemoryAdapter();
    const store = proxy(createStorage({ adapter }));

    await store.load();
    expect(store.get("score")).toBeUndefined();
    store.set("score", 10);
    expect(store.get("score")).toBe(10);
    expect(store.setDefault("score", 20)).toBe(10);
    expect(store.setDefault("lives", 3)).toBe(3);
    store.player = "Ada";
    expect(store.player).toBe("Ada");
    expect("player" in store).toBe(true);
    expect(store.keys()).toEqual(["lives", "player", "score"]);

    delete store.player;
    expect(store.has("player")).toBe(false);
    store.clear();
    expect(store.keys()).toEqual([]);
  });

  test("saves and loads JSON object state", async () => {
    const adapter = new MemoryAdapter();
    const store = createStorage({ adapter });
    store.set("high_score", 1200);
    store.set("settings", { sound: true, names: ["a", "b"] });

    await store.save();
    expect(adapter.text).toBe(
      JSON.stringify({
        high_score: 1200,
        settings: { sound: true, names: ["a", "b"] },
      }),
    );

    const loaded = createStorage({ adapter });
    await loaded.load();
    expect(loaded.get("high_score")).toBe(1200);
    expect(loaded.get("settings")).toEqual({
      sound: true,
      names: ["a", "b"],
    });
  });

  test("corrupt JSON and non-serializable values reject with failing paths", async () => {
    const corrupt = createStorage({
      adapter: new MemoryAdapter("memory", "{bad json"),
    });
    await expect(corrupt.load()).rejects.toBeInstanceOf(JsonStorageError);

    // A value changed after it was stored, inside a stored object.
    const store = createStorage({ adapter: new MemoryAdapter() });
    const profile: Record<string, Record<string, unknown>> = { nested: {} };
    store.set("profile", profile);
    profile.nested!.callback = () => "nope";
    await expect(store.save()).rejects.toMatchObject({
      path: "storage.profile.nested.callback",
    });

    const circular: Record<string, unknown> = {};
    store.clear();
    store.set("circular", circular);
    circular.self = circular;
    await expect(store.save()).rejects.toMatchObject({
      path: "storage.circular.self",
    });
  });

  test("a value JSON can't hold throws where it's stored, naming the key, and never gets in", async () => {
    const adapter = new MemoryAdapter();
    const store = proxy(createStorage({ adapter }));
    expect(() => store.set("speed", Number.NaN)).toThrow(JsonStorageError);
    expect(() => store.set("speed", Number.NaN)).toThrow(
      "NaN is not a JSON value at storage.speed",
    );
    expect(() => {
      store.lastSpeed = 0 / 0;
    }).toThrow("NaN is not a JSON value at storage.lastSpeed");
    expect(() => store.setDefault("best", Infinity)).toThrow(
      "Infinity is not a JSON value at storage.best",
    );
    expect(() => store.set("stats", { speed: [1, Number.NaN] })).toThrow(
      "NaN is not a JSON value at storage.stats.speed[1]",
    );
    expect(() => store.set("score", undefined)).toThrow(
      "undefined is not a JSON value at storage.score",
    );
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => store.set("loop", circular)).toThrow(
      "Circular references are not JSON values at storage.loop.self",
    );
    expect(store.keys()).toEqual([]);

    store.highScore = 999;
    await store.save();
    expect(adapter.text).toBe('{"highScore":999}');
  });
});

describe("storage adapters", () => {
  test("browser localStorage adapter scopes keys by project and path", async () => {
    const localStorage = new MemoryLocalStorage();
    const first = createStorage({
      adapter: createLocalStorageAdapter({
        projectId: "test_project",
        path: "save/high_score",
        localStorage,
      }),
    });
    const second = createStorage({
      adapter: createLocalStorageAdapter({
        projectId: "other_project",
        path: "save/high_score",
        localStorage,
      }),
    });

    first.set("score", 500);
    second.set("score", 10);
    await first.save();
    await second.save();

    expect(
      localStorage.values.get("js-game-zero:test_project:save/high_score"),
    ).toBe('{"score":500}');
    expect(
      localStorage.values.get("js-game-zero:other_project:save/high_score"),
    ).toBe('{"score":10}');
  });

  test("createLocalStorageAdapter rejects an invalid projectId with a TypeError", () => {
    // validateStorageProjectId requires /^[a-z][a-z0-9_-]*$/: lowercase,
    // starting with a letter, only letters/digits/underscore/hyphen.
    expect(() => createLocalStorageAdapter({ projectId: "" })).toThrow(
      TypeError,
    );
    expect(() => createLocalStorageAdapter({ projectId: "" })).toThrow(
      /projectId must be lowercase, start with a letter/,
    );
    // Uppercase letters are not allowed.
    expect(() => createLocalStorageAdapter({ projectId: "Sample4" })).toThrow(
      /projectId must be lowercase, start with a letter/,
    );
    // Must start with a letter, not a digit.
    expect(() => createLocalStorageAdapter({ projectId: "4sample" })).toThrow(
      /projectId must be lowercase, start with a letter/,
    );
  });

  test("createLocalStorageAdapter rejects an invalid path with a TypeError", () => {
    // normalizeStoragePath rejects empty/absolute/backslash paths outright...
    expect(() => createLocalStorageAdapter({ path: "" })).toThrow(TypeError);
    expect(() => createLocalStorageAdapter({ path: "" })).toThrow(
      /relative forward-slash path/,
    );
    expect(() => createLocalStorageAdapter({ path: "/absolute/save" })).toThrow(
      /relative forward-slash path/,
    );
    expect(() => createLocalStorageAdapter({ path: "back\\slash" })).toThrow(
      /relative forward-slash path/,
    );
    // ...and rejects "." / ".." traversal segments separately.
    expect(() =>
      createLocalStorageAdapter({ path: "saves/../outside" }),
    ).toThrow(/cannot include empty or traversal segments/);
    expect(() =>
      createLocalStorageAdapter({ path: "saves//high_score" }),
    ).toThrow(/cannot include empty or traversal segments/);
  });

  test("sandbox file adapter exposes scoped paths and rejects traversal", async () => {
    const writes: Array<{ path: string; text: string }> = [];
    const adapter = createSandboxFileStorageAdapter({
      projectRoot: "/tmp/js-game-zero-project",
      path: "saves/high_score.json",
      readText: () => null,
      writeText(path, text) {
        writes.push({ path, text });
      },
    });
    const store = createStorage({ adapter });
    store.set("score", 900);
    await store.save();

    expect(adapter.path).toBe(
      "/tmp/js-game-zero-project/saves/high_score.json",
    );
    expect(writes).toEqual([
      {
        path: "/tmp/js-game-zero-project/saves/high_score.json",
        text: '{"score":900}',
      },
    ]);
    expect(() =>
      createSandboxFileStorageAdapter({
        projectRoot: "/tmp/js-game-zero-project",
        path: "../outside.json",
      }),
    ).toThrow(TypeError);
    expect(() =>
      createSandboxFileStorageAdapter({
        projectRoot: "/tmp/js-game-zero-project",
        path: "/tmp/outside.json",
      }),
    ).toThrow(TypeError);
  });

  test("sandbox file adapter writes under root and rejects symlink escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "jgz-storage-root-"));
    const outside = await mkdtemp(join(tmpdir(), "jgz-storage-outside-"));
    try {
      const store = createStorage({
        adapter: createSandboxFileStorageAdapter({
          projectRoot: root,
          path: "saves/high_score.json",
        }),
      });
      store.set("score", 700);
      await store.save();
      expect(await readFile(join(root, "saves/high_score.json"), "utf8")).toBe(
        '{"score":700}',
      );

      const loaded = createStorage({
        adapter: createSandboxFileStorageAdapter({
          projectRoot: root,
          path: "saves/high_score.json",
        }),
      });
      await loaded.load();
      expect(loaded.get("score")).toBe(700);

      await symlink(outside, join(root, "link"), "dir");
      const escaped = createStorage({
        adapter: createSandboxFileStorageAdapter({
          projectRoot: root,
          path: "link/escape.json",
        }),
      });
      escaped.set("score", 999);
      await expect(escaped.save()).rejects.toThrow(/project root/);
      expect(await exists(join(outside, "escape.json"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe("synchronous load and change notifications (auto-load/auto-save primitives)", () => {
  test("loadSync populates values synchronously for a synchronous adapter", () => {
    const adapter = new MemoryAdapter("sync", JSON.stringify({ score: 3 }));
    const store = createStorage({ adapter });

    expect(store.loadSync()).toBe(true);
    expect(store.get("score")).toBe(3);
    expect(adapter.loadSyncCalls).toBe(1);
    expect(adapter.loadCalls).toBe(0);
  });

  test("loadSync does not probe an async adapter before the one async read", async () => {
    let loadCalls = 0;
    const asyncAdapter: StorageAdapter = {
      path: "async",
      async load() {
        loadCalls += 1;
        return JSON.stringify({ score: 9 });
      },
      async save() {},
    };
    const store = createStorage({ adapter: asyncAdapter });

    expect(store.loadSync()).toBe(false);
    expect(store.get("score")).toBeUndefined();
    expect(loadCalls).toBe(0);

    await store.load();
    expect(store.get("score")).toBe(9);
    expect(loadCalls).toBe(1);
  });

  test("loadSync treats an empty/missing sync value as empty storage", () => {
    const adapter = new MemoryAdapter("sync", null);
    const store = createStorage({ adapter });
    store.set("stale", true);

    expect(store.loadSync()).toBe(true);
    expect(store.has("stale")).toBe(false);
    expect(store.keys()).toEqual([]);
  });

  test("package storage proxy follows the active storage and restores the previous service", () => {
    const first = createStorage({ adapter: new MemoryAdapter("first") });
    const second = createStorage({ adapter: new MemoryAdapter("second") });
    setActiveStorage(null);
    try {
      expect(storage).toBeInstanceOf(Storage);
      expect(setActiveStorage(first)).toBeNull();
      storage.set("score", 10);
      expect(first.get("score")).toBe(10);
      expect(getActiveStorage()).toBe(first);

      expect(setActiveStorage(second)).toBe(first);
      expect(storage.get("score")).toBeUndefined();
      storage.set("score", 20);
      expect(second.get("score")).toBe(20);

      expect(setActiveStorage(first)).toBe(second);
      expect(storage.get("score")).toBe(10);
    } finally {
      setActiveStorage(null);
    }
  });

  test("onChange notifies on set/delete/clear/setDefault-insert but not on no-op mutations or load/save", async () => {
    const adapter = new MemoryAdapter();
    const store = createStorage({ adapter });
    let notifications = 0;
    const unsubscribe = store.onChange(() => {
      notifications += 1;
    });

    store.set("a", 1);
    expect(notifications).toBe(1);

    store.setDefault("a", 2); // already present: no notification
    expect(notifications).toBe(1);

    store.setDefault("b", 2); // newly inserted: notifies
    expect(notifications).toBe(2);

    expect(store.delete("missing")).toBe(false);
    expect(notifications).toBe(2);

    expect(store.delete("a")).toBe(true);
    expect(notifications).toBe(3);

    store.clear();
    expect(notifications).toBe(4);

    store.clear(); // already empty: no notification
    expect(notifications).toBe(4);

    await store.save();
    expect(notifications).toBe(4);
    await store.load();
    expect(notifications).toBe(4);

    unsubscribe();
    store.set("z", 1);
    expect(notifications).toBe(4);
  });

  test("proxy-style mutation (storage.key = value, delete storage.key) also triggers onChange", () => {
    const adapter = new MemoryAdapter();
    const store = proxy(createStorage({ adapter }));
    let notifications = 0;
    store.onChange(() => {
      notifications += 1;
    });

    store.score = 5;
    expect(notifications).toBe(1);

    delete store.score;
    expect(notifications).toBe(2);
  });
});

describe("auto-save of changes no set() announces", () => {
  test("a flush saves a change inside a stored object or list", async () => {
    const adapter = new MemoryAdapter(
      "memory",
      JSON.stringify({ highScores: [100] }),
    );
    const store = createStorage({ adapter });
    store.loadSync();
    const autosave = attachAutosave(store, () => {});
    try {
      (store.get("highScores") as number[]).push(250);
      await autosave.flush();
      expect(adapter.text).toBe('{"highScores":[100,250]}');

      (store.get("highScores") as number[])[0] = 300;
      await autosave.flush();
      expect(adapter.text).toBe('{"highScores":[300,250]}');
    } finally {
      autosave.detach();
    }
  });

  test("a flush writes nothing when nothing changed since the load or last save", async () => {
    const saves: string[] = [];
    const pretty = JSON.stringify({ score: 3 }, null, 2);
    const asyncAdapter: StorageAdapter = {
      path: "async",
      async load() {
        return pretty;
      },
      save(text) {
        saves.push(text);
      },
    };
    const store = createStorage({ adapter: asyncAdapter });
    const autosave = attachAutosave(store, () => {});
    try {
      await store.load();
      await autosave.flush();
      expect(saves).toEqual([]);

      store.set("score", 4);
      await autosave.flush();
      await autosave.flush();
      expect(saves).toEqual(['{"score":4}']);

      // Nothing stored at all: no file or localStorage key is made.
      const emptyAdapter = new MemoryAdapter();
      const empty = createStorage({ adapter: emptyAdapter });
      empty.loadSync();
      const emptyAutosave = attachAutosave(empty, () => {});
      await emptyAutosave.flush();
      emptyAutosave.detach();
      expect(emptyAdapter.text).toBeNull();
    } finally {
      autosave.detach();
    }
  });

  test("a stored value changed into one JSON can't hold fails the save, naming it", async () => {
    const adapter = new MemoryAdapter();
    const store = createStorage({ adapter });
    const autosave = attachAutosave(store, () => {});
    try {
      const stats = { speed: 1 };
      store.set("stats", stats);
      stats.speed = Number.NaN;
      await expect(autosave.flush()).rejects.toThrow(
        "NaN is not a JSON value at storage.stats.speed",
      );
      expect(adapter.text).toBeNull();
    } finally {
      autosave.detach();
    }
  });
});
