import { Actor, Rect, ZRect } from "@js-game-zero/core";

const MAX_DEPTH = 6;
const MAX_COLLECTION_SIZE = 100;
const MAX_STRING_LENGTH = 10_000;

type JsonSafe =
  | null
  | boolean
  | number
  | string
  | JsonSafe[]
  | { readonly [key: string]: JsonSafe };

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
