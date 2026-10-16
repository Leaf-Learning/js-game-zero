/**
 * Reading a running game's state from outside it: the paths a host names
 * (`player.x`, `fish[0].y`), and the JSON-safe form every value is reported
 * in. The CLI's `inspect` and a host page's `getGameInspector` share these,
 * so one game reads the same through both.
 */
import { Actor } from "./actor";
import { Rect, ZRect } from "./geometry";
import type { GameHandle } from "./runtime";
import { drawnOn, type Screen } from "./rendering";
import { getSourceInspector } from "./runtime";
import type { SourceInspector } from "./runtime-source";

const MAX_DEPTH = 6;
const MAX_COLLECTION_SIZE = 100;
const MAX_STRING_LENGTH = 10_000;

/** A value as inspection reports it: JSON, with `$type` tags for the rest. */
export type JsonSafe =
  | null
  | boolean
  | number
  | string
  | JsonSafe[]
  | { readonly [key: string]: JsonSafe };

/**
 * A game value as JSON: numbers, strings, booleans, arrays and plain objects
 * as they are (objects with sorted keys); anything else tagged with `$type`,
 * such as `{ $type: "Actor", x, y, … }`, `{ $type: "Undefined" }` or
 * `{ $type: "Number", value: "NaN" }`. Deep, long or circular values are cut
 * short with `{ $type: "Truncated" }` or `{ $type: "Circular" }`.
 */
export function serializeGameValue(value: unknown): JsonSafe {
  return serialize(value, 0, new WeakSet<object>());
}

function serialize(
  value: unknown,
  depth: number,
  ancestors: WeakSet<object>,
): JsonSafe {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.length <= MAX_STRING_LENGTH
      ? value
      : `${value.slice(0, MAX_STRING_LENGTH)}…`;
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return tagged("Number", { value: "NaN" });
    if (value === Infinity) return tagged("Number", { value: "Infinity" });
    if (value === -Infinity) return tagged("Number", { value: "-Infinity" });
    if (Object.is(value, -0)) return tagged("Number", { value: "-0" });
    return value;
  }
  if (value === undefined) return tagged("Undefined");
  if (typeof value === "bigint") {
    return tagged("BigInt", { value: String(value) });
  }
  if (typeof value === "symbol") {
    return tagged("Symbol", { value: value.description ?? "" });
  }
  if (typeof value === "function") {
    return tagged("Function", { name: value.name || "anonymous" });
  }
  if (depth >= MAX_DEPTH) return tagged("Truncated", { reason: "depth" });
  if (ancestors.has(value)) return tagged("Circular");

  ancestors.add(value);
  try {
    if (value instanceof Actor) return serializeActor(value, depth, ancestors);
    if (value instanceof ZRect) return serializeRect(value, "ZRect");
    if (value instanceof Rect) return serializeRect(value, "Rect");
    if (value instanceof Date) {
      return tagged("Date", {
        value: Number.isNaN(value.getTime())
          ? "Invalid Date"
          : value.toISOString(),
      });
    }
    if (value instanceof Error) {
      return tagged("Error", { name: value.name, message: value.message });
    }
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_COLLECTION_SIZE)
        .map((item) => serialize(item, depth + 1, ancestors));
      if (value.length > MAX_COLLECTION_SIZE) {
        items.push(
          tagged("Truncated", {
            reason: "collection",
            omitted: value.length - MAX_COLLECTION_SIZE,
          }),
        );
      }
      return items;
    }
    if (value instanceof Set) {
      return tagged("Set", {
        values: serializeCollection([...value], depth, ancestors),
        size: value.size,
      });
    }
    if (value instanceof Map) {
      const entries = [...value.entries()]
        .slice(0, MAX_COLLECTION_SIZE)
        .map(
          ([key, item]) =>
            [
              serialize(key, depth + 1, ancestors),
              serialize(item, depth + 1, ancestors),
            ] as JsonSafe[],
        );
      return tagged("Map", {
        entries,
        size: value.size,
        ...(value.size > MAX_COLLECTION_SIZE
          ? { omitted: value.size - MAX_COLLECTION_SIZE }
          : {}),
      });
    }
    return serializeObject(value, depth, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

const actorInternalKeys = new Set([
  "loader",
  "screen",
  "_image",
  "_surface",
  "_pos",
  "_anchor",
  "_angle",
  "_opacity",
  "_scale",
  "_native",
  "sizeSource",
  "positionSource",
  "imageLoadPromise",
]);

function serializeActor(
  actor: Actor,
  depth: number,
  ancestors: WeakSet<object>,
): JsonSafe {
  let rect: Rect | null = null;
  try {
    rect = actor.rect();
  } catch {
    // A not-yet-loaded actor is still useful to inspect without a rectangle.
  }
  const properties: Record<string, JsonSafe> = {};
  for (const key of Object.keys(actor).sort()) {
    if (actorInternalKeys.has(key)) continue;
    properties[key] = readProperty(actor, key, depth + 1, ancestors);
  }
  return tagged("Actor", {
    image: actor.image,
    pos: actor.pos,
    x: actor.x,
    y: actor.y,
    width: safeNumber(() => actor.width),
    height: safeNumber(() => actor.height),
    angle: actor.angle,
    opacity: actor.opacity,
    scale: actor.scale,
    anchor: [...actor.anchor],
    rect: rect ? serializeRect(rect, "Rect") : null,
    properties,
  });
}

function serializeRect(rect: Rect, type: "Rect" | "ZRect"): JsonSafe {
  return tagged(type, {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    center: [...rect.center],
  });
}

function serializeObject(
  value: object,
  depth: number,
  ancestors: WeakSet<object>,
): JsonSafe {
  const output: Record<string, JsonSafe> = {};
  const keys = Object.keys(value).sort();
  for (const key of keys.slice(0, MAX_COLLECTION_SIZE)) {
    output[key] = readProperty(value, key, depth + 1, ancestors);
  }
  if (keys.length > MAX_COLLECTION_SIZE) {
    output.$truncated = tagged("Truncated", {
      reason: "collection",
      omitted: keys.length - MAX_COLLECTION_SIZE,
    });
  }
  const prototype = Object.getPrototypeOf(value) as {
    constructor?: { name?: unknown };
  } | null;
  const constructorName = prototype?.constructor?.name;
  if (
    prototype !== Object.prototype &&
    prototype !== null &&
    typeof constructorName === "string" &&
    constructorName !== "Object"
  ) {
    return tagged(constructorName || "Object", { properties: output });
  }
  return output;
}

function readProperty(
  value: object,
  key: string,
  depth: number,
  ancestors: WeakSet<object>,
): JsonSafe {
  try {
    return serialize(Reflect.get(value, key), depth, ancestors);
  } catch (error) {
    return tagged("Unreadable", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function serializeCollection(
  values: readonly unknown[],
  depth: number,
  ancestors: WeakSet<object>,
): JsonSafe[] {
  const serialized = values
    .slice(0, MAX_COLLECTION_SIZE)
    .map((value) => serialize(value, depth + 1, ancestors));
  if (values.length > MAX_COLLECTION_SIZE) {
    serialized.push(
      tagged("Truncated", {
        reason: "collection",
        omitted: values.length - MAX_COLLECTION_SIZE,
      }),
    );
  }
  return serialized;
}

function safeNumber(read: () => number): JsonSafe {
  try {
    return serializeGameValue(read());
  } catch {
    return tagged("Unavailable");
  }
}

function tagged(
  type: string,
  fields: Record<string, JsonSafe | number | string> = {},
): { readonly [key: string]: JsonSafe } {
  return { $type: type, ...fields } as { readonly [key: string]: JsonSafe };
}

/** A binding and the property names and indexes under it: `fish[0].y`. */
export type StatePath = {
  readonly source: string;
  readonly binding: string;
  readonly segments: readonly (string | number)[];
};

const identifier = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*/u;
const unsafeProperties = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Reads a state path: a top-level binding, then `.name` for a property and
 * `[n]` for an index, as in `player.x` or `fish[0].y`. Throws a TypeError for
 * anything else, and for `__proto__`, `prototype` and `constructor`.
 */
export function parseStatePath(source: string): StatePath {
  const invalid = (): never => {
    throw new TypeError(
      `Invalid state path: ${JSON.stringify(source)}. Use a binding with .name and [index] after it, such as player.x or fish[0].y.`,
    );
  };
  if (typeof source !== "string") invalid();
  const bindingMatch = identifier.exec(source);
  if (!bindingMatch) invalid();
  const binding = bindingMatch![0];
  const segments: (string | number)[] = [];
  let cursor = binding.length;
  while (cursor < source.length) {
    if (source[cursor] === ".") {
      const match = identifier.exec(source.slice(cursor + 1));
      if (!match) invalid();
      if (unsafeProperties.has(match![0])) invalid();
      segments.push(match![0]);
      cursor += match![0].length + 1;
      continue;
    }
    if (source[cursor] === "[") {
      const end = source.indexOf("]", cursor + 1);
      if (end === -1) invalid();
      const raw = source.slice(cursor + 1, end);
      if (!/^\d+$/.test(raw)) invalid();
      const index = Number(raw);
      if (!Number.isSafeInteger(index)) invalid();
      segments.push(index);
      cursor = end + 1;
      continue;
    }
    invalid();
  }
  if (unsafeProperties.has(binding)) invalid();
  return { source, binding, segments };
}

/** Host access to a zero-boilerplate game's live top-level bindings. */
export type GameInspector = {
  /** Non-function top-level declarations and assignments, in source order. */
  bindings(): readonly string[];
  /** Top-level function declarations and function-valued bindings. */
  functions(): readonly string[];
  /** The live value at a binding or a path (`score`, `fish[0].y`), as it is. */
  read(path: string | StatePath): unknown;
  /**
   * The value at a path as JSON (`serializeGameValue`), as the CLI's `inspect`
   * reports it; with no path, every binding's value by name.
   */
  inspect(path?: string | StatePath): JsonSafe;
};

/**
 * The name a path starts with to read what the game's last `draw()` drew,
 * rather than one of its bindings: `$drawn`, a list of things, each with its
 * `kind` and what it is and where (`{ kind: "actor", image: "robot", x, y }`).
 */
export const DRAWN = "$drawn";

/**
 * The host inspector over a game's source bindings, and, given its screen,
 * what it drew (`$drawn`).
 */
export function createGameInspector(
  source: SourceInspector,
  screen?: Screen,
): GameInspector {
  const read = (path: string | StatePath): unknown => {
    const parsed = typeof path === "string" ? parseStatePath(path) : path;
    let value =
      parsed.binding === DRAWN && screen
        ? drawnOn(screen)
        : source.read(parsed.binding);
    for (const segment of parsed.segments) {
      if (
        value === null ||
        (typeof value !== "object" && typeof value !== "function")
      ) {
        throw new TypeError(
          `Cannot read ${parsed.source}: ${String(segment)} has no parent value.`,
        );
      }
      value = Reflect.get(value, segment);
    }
    return value;
  };
  return {
    bindings: () => source.bindings(),
    functions: () => source.functions(),
    read,
    inspect(path) {
      if (path !== undefined) return serializeGameValue(read(path));
      const snapshot: Record<string, JsonSafe> = {};
      for (const binding of source.bindings()) {
        try {
          snapshot[binding] = serializeGameValue(source.read(binding));
        } catch (error) {
          snapshot[binding] = serializeGameValue(error);
        }
      }
      return snapshot;
    },
  };
}

const hostInspectors = new WeakMap<SourceInspector, GameInspector>();

/**
 * A live inspector for a running zero-boilerplate game, or null for an
 * import-mode game and a stopped one (a failed game keeps its inspector, so a
 * host can read the state at the crash).
 */
export function getGameInspector(handle: GameHandle): GameInspector | null {
  const source = getSourceInspector(handle);
  if (!source) return null;
  let inspector = hostInspectors.get(source);
  if (!inspector) {
    inspector = createGameInspector(source, handle.screen);
    hostInspectors.set(source, inspector);
  }
  return inspector;
}
