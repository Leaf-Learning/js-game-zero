import { createActiveServiceProxy } from "./active-service";
import { normalizeStoragePath } from "./storage-path";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

export type StorageAdapter = {
  readonly path: string;
  load(): Promise<string | null>;
  loadSync?(): string | null;
  save(text: string): Promise<void> | void;
};

export type BrowserStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type LocalStorageAdapterOptions = {
  readonly projectId?: string;
  readonly path?: string;
  readonly localStorage?: BrowserStorageLike;
};

export type StorageOptions = {
  readonly adapter?: StorageAdapter;
  readonly projectId?: string;
  readonly path?: string;
};

export class JsonStorageError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${message} at ${path}`);
    this.name = "JsonStorageError";
    this.path = path;
  }
}

export class Storage {
  private readonly adapter: StorageAdapter;
  private readonly values = new Map<string, unknown>();
  private readonly listeners = new Set<() => void>();

  constructor(options: StorageOptions = {}) {
    this.adapter =
      options.adapter ??
      createLocalStorageAdapter({
        ...(options.projectId !== undefined
          ? { projectId: options.projectId }
          : {}),
        ...(options.path !== undefined ? { path: options.path } : {}),
      });
    return new Proxy(this, storageProxyHandler) as Storage;
  }

  get path(): string {
    return this.adapter.path;
  }

  get(key: string, defaultValue?: unknown): unknown {
    requireStorageKey(key);
    return this.values.has(key) ? this.values.get(key) : defaultValue;
  }

  set(key: string, value: unknown): void {
    requireStorageKey(key);
    this.values.set(key, value);
    this.notify();
  }

  setdefault(key: string, defaultValue: unknown): unknown {
    requireStorageKey(key);
    if (!this.values.has(key)) {
      this.values.set(key, defaultValue);
      this.notify();
    }
    return this.values.get(key);
  }

  has(key: string): boolean {
    requireStorageKey(key);
    return this.values.has(key);
  }

  delete(key: string): boolean {
    requireStorageKey(key);
    const deleted = this.values.delete(key);
    if (deleted) this.notify();
    return deleted;
  }

  clear(): void {
    if (this.values.size === 0) return;
    this.values.clear();
    this.notify();
  }

  keys(): string[] {
    return [...this.values.keys()].sort();
  }

  toJSON(): Record<string, JsonValue> {
    return this.jsonObject();
  }

  /**
   * Subscribes to any mutation (set/delete/clear/setdefault-insert),
   * including mutations made through the PGZero-style proxy (e.g.
   * `storage.score = 5`). Returns an unsubscribe function. Used by the
   * runtime to drive debounced auto-save; loading does not notify.
   */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async save(): Promise<void> {
    await this.adapter.save(JSON.stringify(this.jsonObject()));
  }

  async load(): Promise<void> {
    const text = await this.adapter.load();
    this.applyLoadedText(text);
  }

  /**
   * Attempts a fully synchronous load when the adapter explicitly supports
   * one. Async adapters are never probed here, so falling back to `load()`
   * performs exactly one read.
   */
  loadSync(): boolean {
    if (!this.adapter.loadSync) return false;
    this.applyLoadedText(this.adapter.loadSync());
    return true;
  }

  private applyLoadedText(text: string | null): void {
    this.values.clear();
    if (text === null || text === "") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new JsonStorageError(
        this.path,
        error instanceof Error ? error.message : "Invalid JSON",
      );
    }
    validateJsonValue(parsed, "storage");
    if (!isPlainRecord(parsed)) {
      throw new JsonStorageError(
        "storage",
        "Storage data must be a JSON object",
      );
    }
    for (const [key, value] of Object.entries(parsed)) {
      this.values.set(key, value);
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private jsonObject(): Record<string, JsonValue> {
    const object: Record<string, unknown> = {};
    for (const [key, value] of this.values) object[key] = value;
    validateJsonValue(object, "storage");
    return object as Record<string, JsonValue>;
  }
}

export function createStorage(options: StorageOptions = {}): Storage {
  return new Storage(options);
}

export function createLocalStorageAdapter(
  options: LocalStorageAdapterOptions = {},
): StorageAdapter {
  const projectId = validateStorageProjectId(options.projectId ?? "default");
  const path = normalizeStoragePath(options.path ?? "storage");
  const scopedKey = `js-game-zero:${projectId}:${path}`;
  return {
    path: scopedKey,
    async load() {
      const localStorage = resolveLocalStorage(options.localStorage);
      return localStorage.getItem(scopedKey);
    },
    loadSync() {
      const localStorage = resolveLocalStorage(options.localStorage);
      return localStorage.getItem(scopedKey);
    },
    save(text) {
      const localStorage = resolveLocalStorage(options.localStorage);
      localStorage.setItem(scopedKey, text);
    },
  };
}

export function validateJsonValue(value: unknown, path = "value"): void {
  validateJsonValueInner(value, path, new WeakSet<object>());
}

function validateJsonValueInner(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new JsonStorageError(path, "Non-finite numbers are not JSON values");
  }
  if (typeof value !== "object") {
    throw new JsonStorageError(path, `${typeof value} is not a JSON value`);
  }
  if (seen.has(value)) {
    throw new JsonStorageError(path, "Circular references are not JSON values");
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateJsonValueInner(item, `${path}[${index}]`, seen);
    });
    seen.delete(value);
    return;
  }
  if (!isPlainRecord(value)) {
    throw new JsonStorageError(path, "Only plain objects can be saved as JSON");
  }
  for (const [key, item] of Object.entries(value)) {
    validateJsonValueInner(item, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

function requireStorageKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) {
    throw new TypeError("storage keys must be non-empty strings.");
  }
}

function validateStorageProjectId(projectId: string): string {
  if (!/^[a-z][a-z0-9_-]*$/.test(projectId)) {
    throw new TypeError(
      "storage projectId must be lowercase, start with a letter, and contain only letters, digits, underscores, or hyphens.",
    );
  }
  return projectId;
}

function resolveLocalStorage(
  localStorage: BrowserStorageLike | undefined,
): BrowserStorageLike {
  const resolved = localStorage ?? globalThis.localStorage;
  if (!resolved) {
    throw new Error("localStorage is not available in this environment.");
  }
  return resolved;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const storageProxyHandler: ProxyHandler<Storage> = {
  get(target, property, receiver) {
    if (typeof property !== "string") {
      return Reflect.get(target, property, receiver);
    }
    if (
      property === "then" ||
      property === "inspect" ||
      property === "toJSON"
    ) {
      return Reflect.get(target, property, receiver);
    }
    if (property in target) {
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
    return target.get(property);
  },
  set(target, property, value, receiver) {
    if (typeof property !== "string" || property in target) {
      return Reflect.set(target, property, value, receiver);
    }
    target.set(property, value);
    return true;
  },
  deleteProperty(target, property) {
    return typeof property === "string" ? target.delete(property) : false;
  },
  has(target, property) {
    return (
      Reflect.has(target, property) ||
      (typeof property === "string" && target.has(property))
    );
  },
  ownKeys(target) {
    return [...new Set([...Reflect.ownKeys(target), ...target.keys()])];
  },
  getOwnPropertyDescriptor(target, property) {
    if (typeof property === "string" && target.has(property)) {
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: target.get(property),
      };
    }
    return Reflect.getOwnPropertyDescriptor(target, property);
  },
};

/** Default backing instance used when no runtime-scoped storage is active. */
export const defaultStorage = createStorage();
let activeStorage: Storage | null = null;

export function setActiveStorage(nextStorage: Storage | null): Storage | null {
  const previous = activeStorage;
  activeStorage = nextStorage;
  return previous;
}

export function getActiveStorage(): Storage {
  return activeStorage ?? defaultStorage;
}

/**
 * PGZero-style process-level convenience proxy. Runtime callbacks scope this
 * proxy to their own Storage instance; outside a runtime it uses a default
 * local-storage-backed instance.
 */
export const storage = createActiveServiceProxy(getActiveStorage);
