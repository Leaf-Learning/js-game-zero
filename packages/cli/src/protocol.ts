export const DEFAULT_STEP = 1 / 60;
export const DEFAULT_TIMEOUT = 15_000;
export const MAX_STEP_COUNT = 100_000;

export type RequestId = string | number | null;

export type StatePath = {
  readonly source: string;
  readonly binding: string;
  readonly segments: readonly (string | number)[];
};

export const MAX_PLAY_ACTIONS = 200;
export const MAX_INSPECT_PATHS = 12;

/** Input and time commands a `play` request may batch. */
export type PlayAction = Extract<
  ProtocolCommand,
  { command: "step" | "key" | "mouse" | "wheel" }
>;

export type ProtocolCommand =
  | { readonly command: "status"; readonly pixels?: boolean }
  | { readonly command: "step"; readonly dt: number; readonly count: number }
  | {
      readonly command: "key";
      readonly action: "down" | "up" | "tap";
      readonly key: string;
    }
  | {
      readonly command: "mouse";
      readonly action: "move" | "down" | "up" | "click";
      readonly x?: number;
      readonly y?: number;
      readonly button?: "left" | "middle" | "right";
    }
  | {
      readonly command: "wheel";
      readonly direction: "up" | "down";
      readonly x?: number;
      readonly y?: number;
    }
  | { readonly command: "inspect"; readonly path?: StatePath }
  | { readonly command: "call"; readonly binding: string }
  | {
      readonly command: "play";
      readonly actions: readonly PlayAction[];
      /** Reload the project from disk and wait for one frame before the actions. */
      readonly restart?: boolean;
      /** A state path, several (answered as a map keyed by path), or `true` for everything. */
      readonly inspect?: StatePath | readonly StatePath[] | true;
      readonly screenshot?: boolean;
    }
  | {
      readonly command: "screenshot";
      readonly path?: string;
      readonly inline?: boolean;
    }
  | { readonly command: "restart" }
  | { readonly command: "help" }
  | { readonly command: "quit" };

export type DecodedCommand = {
  readonly id?: RequestId;
  readonly value: ProtocolCommand;
};

export class ProtocolError extends Error {
  constructor(
    readonly code:
      | "invalid_request"
      | "unknown_command"
      | "invalid_state_path"
      | "command_failed",
    message: string,
    readonly id?: RequestId,
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}

export function decodeJsonLine(line: string): DecodedCommand {
  let input: unknown;
  try {
    input = JSON.parse(line);
  } catch {
    throw new ProtocolError("invalid_request", "Input must be valid JSON.");
  }
  if (!isRecord(input)) {
    throw new ProtocolError("invalid_request", "A request must be an object.");
  }
  const id = decodeRequestId(input.id);
  try {
    return {
      ...(input.id !== undefined ? { id } : {}),
      value: decodeCommandRecord(input),
    };
  } catch (error) {
    if (error instanceof ProtocolError) {
      throw new ProtocolError(error.code, error.message, id);
    }
    throw error;
  }
}

export function decodeTextLine(line: string): DecodedCommand {
  const words = splitWords(line);
  const command = words[0]?.toLowerCase();
  if (!command) {
    throw new ProtocolError("invalid_request", "Enter a command.");
  }
  switch (command) {
    case "status":
      requireWordCount(words, 1, "status");
      return { value: { command: "status" } };
    case "step":
      if (words.length > 3) usage("step [dt] [count]");
      return {
        value: {
          command: "step",
          dt:
            words[1] === undefined
              ? DEFAULT_STEP
              : finiteNumber(words[1], "dt", 0),
          count:
            words[2] === undefined
              ? 1
              : integer(words[2], "count", 1, MAX_STEP_COUNT),
        },
      };
    case "key":
      if (words.length !== 3) usage("key down|up|tap <key>");
      return {
        value: {
          command: "key",
          action: keyAction(words[1]),
          key: requiredString(words[2], "key"),
        },
      };
    case "mouse":
      return { value: decodeTextMouse(words) };
    case "wheel": {
      if (words.length !== 2 && words.length !== 4) {
        usage("wheel up|down [x y]");
      }
      return {
        value: {
          command: "wheel",
          direction: wheelDirection(words[1]),
          ...(words.length === 4
            ? {
                x: finiteNumber(words[2], "x"),
                y: finiteNumber(words[3], "y"),
              }
            : {}),
        },
      };
    }
    case "inspect":
    case "state":
      if (words.length > 2) usage(`${command} [path]`);
      return {
        value: {
          command: "inspect",
          ...(words[1] ? { path: parseStatePath(words[1]) } : {}),
        },
      };
    case "call":
      if (words.length !== 2) usage("call <binding>");
      return {
        value: { command: "call", binding: bindingName(words[1]) },
      };
    case "play":
      throw new ProtocolError(
        "invalid_request",
        "play is only available in --json mode.",
      );
    case "screenshot":
      if (words.length > 2) usage("screenshot [path]");
      return {
        value: {
          command: "screenshot",
          ...(words[1] ? { path: words[1] } : {}),
        },
      };
    case "restart":
    case "help":
    case "quit":
      requireWordCount(words, 1, command);
      return { value: { command } } as DecodedCommand;
    default:
      throw new ProtocolError("unknown_command", `Unknown command: ${command}`);
  }
}

function decodeCommandRecord(input: Record<string, unknown>): ProtocolCommand {
  const command = requiredString(input.command, "command").toLowerCase();
  switch (command) {
    case "status":
      return {
        command,
        ...(optionalBoolean(input.pixels, "pixels") ? { pixels: true } : {}),
      };
    case "restart":
    case "help":
    case "quit":
      return { command };
    case "step":
      return {
        command,
        dt:
          input.dt === undefined
            ? DEFAULT_STEP
            : finiteNumber(input.dt, "dt", 0),
        count:
          input.count === undefined
            ? 1
            : integer(input.count, "count", 1, MAX_STEP_COUNT),
      };
    case "key":
      return {
        command,
        action: keyAction(input.action),
        key: requiredString(input.key, "key"),
      };
    case "mouse": {
      const action = mouseAction(input.action);
      const coordinates = optionalCoordinates(input);
      if ((action === "move" || action === "click") && !("x" in coordinates)) {
        throw new ProtocolError(
          "invalid_request",
          `mouse ${action} requires x and y.`,
        );
      }
      return {
        command,
        action,
        ...coordinates,
        ...(action === "move"
          ? {}
          : { button: mouseButton(input.button ?? "left") }),
      };
    }
    case "wheel":
      return {
        command,
        direction: wheelDirection(input.direction),
        ...optionalCoordinates(input),
      };
    case "inspect": {
      if (input.path !== undefined && typeof input.path !== "string") {
        throw new ProtocolError("invalid_request", "path must be a string.");
      }
      return {
        command,
        ...(typeof input.path === "string" && input.path.length > 0
          ? { path: parseStatePath(input.path) }
          : {}),
      };
    }
    case "state":
      return { command: "inspect" };
    case "call":
      return {
        command,
        binding: bindingName(requiredString(input.binding, "binding")),
      };
    case "play":
      return decodePlay(input);
    case "screenshot": {
      if (input.path !== undefined && typeof input.path !== "string") {
        throw new ProtocolError("invalid_request", "path must be a string.");
      }
      if (input.path === "") {
        throw new ProtocolError("invalid_request", "path must not be empty.");
      }
      return {
        command,
        ...(typeof input.path === "string" ? { path: input.path } : {}),
        ...(optionalBoolean(input.inline, "inline") ? { inline: true } : {}),
      };
    }
    default:
      throw new ProtocolError("unknown_command", `Unknown command: ${command}`);
  }
}

const playActions = new Set(["step", "key", "mouse", "wheel"]);

function decodePlay(input: Record<string, unknown>): ProtocolCommand {
  const restart = optionalBoolean(input.restart, "restart");
  if (input.actions === undefined && restart) input = { ...input, actions: [] };
  if (!Array.isArray(input.actions)) {
    throw new ProtocolError("invalid_request", "actions must be an array.");
  }
  if (input.actions.length === 0 && !restart) {
    throw new ProtocolError(
      "invalid_request",
      "actions must be a non-empty array unless restart is true.",
    );
  }
  if (input.actions.length > MAX_PLAY_ACTIONS) {
    throw new ProtocolError(
      "invalid_request",
      `actions may hold at most ${MAX_PLAY_ACTIONS} entries.`,
    );
  }
  const actions = input.actions.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new ProtocolError(
        "invalid_request",
        `actions[${index}] must be an object.`,
      );
    }
    const action = decodeCommandRecord(entry);
    if (!playActions.has(action.command)) {
      throw new ProtocolError(
        "invalid_request",
        `actions[${index}]: play accepts step, key, mouse and wheel only.`,
      );
    }
    return action as PlayAction;
  });
  let inspect: StatePath | StatePath[] | true | undefined;
  if (input.inspect === true) inspect = true;
  else if (typeof input.inspect === "string" && input.inspect.length > 0) {
    inspect = parseStatePath(input.inspect);
  } else if (
    Array.isArray(input.inspect) &&
    input.inspect.every((p) => typeof p === "string" && p.length > 0)
  ) {
    if (input.inspect.length > MAX_INSPECT_PATHS) {
      throw new ProtocolError(
        "invalid_request",
        `inspect may hold at most ${MAX_INSPECT_PATHS} paths.`,
      );
    }
    inspect = input.inspect.map((p) => parseStatePath(p as string));
  } else if (input.inspect !== undefined && input.inspect !== false) {
    throw new ProtocolError(
      "invalid_request",
      "inspect must be true, a state path, or a list of state paths.",
    );
  }
  return {
    command: "play",
    actions,
    ...(restart ? { restart: true } : {}),
    ...(inspect === undefined ? {} : { inspect }),
    ...(optionalBoolean(input.screenshot, "screenshot")
      ? { screenshot: true }
      : {}),
  };
}

function bindingName(value: unknown): string {
  const name = requiredString(value, "binding");
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
    throw new ProtocolError(
      "invalid_request",
      `binding must be a plain identifier: ${name}`,
    );
  }
  assertSafeProperty(name, name);
  return name;
}

function optionalBoolean(value: unknown, name: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new ProtocolError("invalid_request", `${name} must be a boolean.`);
  }
  return value;
}

function decodeTextMouse(words: readonly string[]): ProtocolCommand {
  const action = mouseAction(words[1]);
  if (action === "move") {
    if (words.length !== 4) usage("mouse move <x> <y>");
    return {
      command: "mouse",
      action,
      x: finiteNumber(words[2], "x"),
      y: finiteNumber(words[3], "y"),
    };
  }
  const button = mouseButton(words[2]);
  if (action === "click") {
    if (words.length !== 5) {
      usage("mouse click <left|middle|right> <x> <y>");
    }
    return {
      command: "mouse",
      action,
      button,
      x: finiteNumber(words[3], "x"),
      y: finiteNumber(words[4], "y"),
    };
  }
  if (words.length !== 3 && words.length !== 5) {
    usage(`mouse ${action} <left|middle|right> [x y]`);
  }
  return {
    command: "mouse",
    action,
    button,
    ...(words.length === 5
      ? {
          x: finiteNumber(words[3], "x"),
          y: finiteNumber(words[4], "y"),
        }
      : {}),
  };
}

export function parseStatePath(source: string): StatePath {
  const bindingMatch = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*/u.exec(
    source,
  );
  if (!bindingMatch) invalidStatePath(source);
  const binding = bindingMatch[0];
  const segments: (string | number)[] = [];
  let cursor = binding.length;
  while (cursor < source.length) {
    if (source[cursor] === ".") {
      const match = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*/u.exec(
        source.slice(cursor + 1),
      );
      if (!match) invalidStatePath(source);
      assertSafeProperty(match[0], source);
      segments.push(match[0]);
      cursor += match[0].length + 1;
      continue;
    }
    if (source[cursor] === "[") {
      const end = source.indexOf("]", cursor + 1);
      if (end === -1) invalidStatePath(source);
      const raw = source.slice(cursor + 1, end);
      if (!/^\d+$/.test(raw)) invalidStatePath(source);
      const index = Number(raw);
      if (!Number.isSafeInteger(index)) invalidStatePath(source);
      segments.push(index);
      cursor = end + 1;
      continue;
    }
    invalidStatePath(source);
  }
  assertSafeProperty(binding, source);
  return { source, binding, segments };
}

const unsafeProperties = new Set(["__proto__", "prototype", "constructor"]);

function assertSafeProperty(property: string, source: string): void {
  if (unsafeProperties.has(property)) invalidStatePath(source);
}

function invalidStatePath(source: string): never {
  throw new ProtocolError(
    "invalid_state_path",
    `Invalid read-only state path: ${source}`,
  );
}

function optionalCoordinates(
  input: Record<string, unknown>,
): { readonly x: number; readonly y: number } | Record<string, never> {
  if (input.x === undefined && input.y === undefined) return {};
  if (input.x === undefined || input.y === undefined) {
    throw new ProtocolError(
      "invalid_request",
      "x and y must be provided together.",
    );
  }
  return {
    x: finiteNumber(input.x, "x"),
    y: finiteNumber(input.y, "y"),
  };
}

function splitWords(line: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const character of line.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/u.test(character)) {
      if (current) words.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (quote || escaped) {
    throw new ProtocolError("invalid_request", "Unterminated quote or escape.");
  }
  if (current) words.push(current);
  return words;
}

function decodeRequestId(value: unknown): RequestId {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value ?? null;
  }
  throw new ProtocolError(
    "invalid_request",
    "id must be a string, finite number, or null.",
  );
}

function finiteNumber(value: unknown, name: string, minimum?: number): number {
  const number = typeof value === "string" && value ? Number(value) : value;
  if (
    typeof number !== "number" ||
    !Number.isFinite(number) ||
    (minimum !== undefined && number < minimum)
  ) {
    throw new ProtocolError(
      "invalid_request",
      `${name} must be a finite number${minimum === undefined ? "" : ` >= ${minimum}`}.`,
    );
  }
  return number;
}

function integer(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const number = finiteNumber(value, name, minimum);
  if (!Number.isSafeInteger(number) || number > maximum) {
    throw new ProtocolError(
      "invalid_request",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return number;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProtocolError(
      "invalid_request",
      `${name} must be a non-empty string.`,
    );
  }
  return value;
}

function keyAction(value: unknown): "down" | "up" | "tap" {
  if (value === "down" || value === "up" || value === "tap") return value;
  throw new ProtocolError(
    "invalid_request",
    "key action must be down, up, or tap.",
  );
}

function mouseAction(value: unknown): "move" | "down" | "up" | "click" {
  if (
    value === "move" ||
    value === "down" ||
    value === "up" ||
    value === "click"
  ) {
    return value;
  }
  throw new ProtocolError(
    "invalid_request",
    "mouse action must be move, down, up, or click.",
  );
}

function mouseButton(value: unknown): "left" | "middle" | "right" {
  if (value === "left" || value === "middle" || value === "right") return value;
  throw new ProtocolError(
    "invalid_request",
    "mouse button must be left, middle, or right.",
  );
}

function wheelDirection(value: unknown): "up" | "down" {
  if (value === "up" || value === "down") return value;
  throw new ProtocolError(
    "invalid_request",
    "wheel direction must be up or down.",
  );
}

function requireWordCount(
  words: readonly string[],
  count: number,
  syntax: string,
): void {
  if (words.length !== count) usage(syntax);
}

function usage(syntax: string): never {
  throw new ProtocolError("invalid_request", `Usage: ${syntax}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
