import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  JsonStorageError,
  Storage,
  createLocalStorageAdapter,
  createSandboxFileStorageAdapter,
  createStorage,
  type BrowserStorageLike,
  type StorageAdapter,
} from "@js-game-zero/core";

class MemoryAdapter implements StorageAdapter {
  readonly path: string;
  text: string | null;

  constructor(path = "memory", text: string | null = null) {
    this.path = path;
    this.text = text;
  }

  load(): string | null {
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
  test("empty load, set/get, setdefault, proxy access, and clear", async () => {
    const adapter = new MemoryAdapter();
    const store = proxy(createStorage({ adapter }));

    await store.load();
    expect(store.get("score")).toBeUndefined();
    store.set("score", 10);
    expect(store.get("score")).toBe(10);
    expect(store.setdefault("score", 20)).toBe(10);
    expect(store.setdefault("lives", 3)).toBe(3);
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

    const store = createStorage({ adapter: new MemoryAdapter() });
    store.set("profile", { nested: { callback: () => "nope" } });
    await expect(store.save()).rejects.toMatchObject({
      path: "storage.profile.nested.callback",
    });

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    store.clear();
    store.set("circular", circular);
    await expect(store.save()).rejects.toMatchObject({
      path: "storage.circular.self",
    });
  });
});

describe("storage adapters", () => {
  test("browser localStorage adapter scopes keys by project and path", async () => {
    const localStorage = new MemoryLocalStorage();
    const first = createStorage({
      adapter: createLocalStorageAdapter({
        projectId: "phase_four",
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
      localStorage.values.get("js-game-zero:phase_four:save/high_score"),
    ).toBe('{"score":500}');
    expect(
      localStorage.values.get("js-game-zero:other_project:save/high_score"),
    ).toBe('{"score":10}');
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
