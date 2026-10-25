import { Actor, type ActorOptions } from "./actor";
import { animationsOn } from "./animation";
import type { AssetLoaders } from "./assets";
import type { MusicPlayer } from "./audio";
import { Clock } from "./clock";
import { rgb } from "./color";
import { friendlyService, guardedMember } from "./friendly-names";
import { Rect, ZRect } from "./geometry";
import { clamp, randomChoice, randomInt } from "./helpers";
import {
  createLiveMouse,
  type KeyboardState,
  keymods,
  keys,
  type MouseState,
} from "./input";
import { mathWithRandom, type RandomSource } from "./random";
import { resizeScreen, Screen } from "./rendering";
import {
  diagnoseSource,
  isValidRuntimeDimension,
  RUNTIME_CONFIGURATION_NAMES,
  RUNTIME_SOURCE_HOOK_NAMES,
} from "./runtime-diagnostics";
import type { GameModule, RuntimeDiagnostic } from "./runtime-contracts";
import { scanSource, tokenizeSource } from "./source-scan";
import { Storage } from "./storage";
import type { ToneGenerator } from "./tone";
import { didYouMean, looseName } from "./util";

export type SourceEvaluationContext = {
  readonly screen: Screen;
  readonly clock: Clock;
  readonly keyboard: KeyboardState;
  readonly mouseState: MouseState;
  readonly loaders: AssetLoaders;
  readonly music: MusicPlayer;
  readonly storage: Storage;
  readonly tone: ToneGenerator;
  /** The run's seeded random source, or null to leave `Math` as it is. */
  readonly random: RandomSource | null;
  stop: (() => void) | null;
};

/**
 * What a game sees of the page's global scope: ECMAScript's globals, and the
 * web's few that are about the language rather than the page. Everything else
 * the page has stays out; the names a game might reach for say what to use
 * instead (`unavailableGlobalHints`). One this engine lacks is left out.
 * `globalThis` is the game's own, made with its scope.
 */
const builtinGlobals: Record<string, unknown> = Object.fromEntries(
  [
    // ECMAScript's global values and functions
    "Infinity",
    "NaN",
    "undefined",
    "eval",
    "isFinite",
    "isNaN",
    "parseFloat",
    "parseInt",
    "decodeURI",
    "decodeURIComponent",
    "encodeURI",
    "encodeURIComponent",
    // its constructors
    "AggregateError",
    "Array",
    "ArrayBuffer",
    "BigInt",
    "BigInt64Array",
    "BigUint64Array",
    "Boolean",
    "DataView",
    "Date",
    "Error",
    "EvalError",
    "FinalizationRegistry",
    "Float16Array",
    "Float32Array",
    "Float64Array",
    "Function",
    "Int8Array",
    "Int16Array",
    "Int32Array",
    "Iterator",
    "Map",
    "Number",
    "Object",
    "Promise",
    "Proxy",
    "RangeError",
    "ReferenceError",
    "RegExp",
    "Set",
    "SharedArrayBuffer",
    "String",
    "Symbol",
    "SyntaxError",
    "TypeError",
    "Uint8Array",
    "Uint8ClampedArray",
    "Uint16Array",
    "Uint32Array",
    "URIError",
    "WeakMap",
    "WeakRef",
    "WeakSet",
    // its namespaces, and ECMA-402's
    "Atomics",
    "Intl",
    "JSON",
    "Math",
    "Reflect",
    // the web's
    "console",
    "structuredClone",
    "queueMicrotask",
    "atob",
    "btoa",
    "TextDecoder",
    "TextEncoder",
  ]
    .filter((name) => name in globalThis)
    .map((name) => [name, (globalThis as Record<string, unknown>)[name]]),
);

const drawMethods = [
  "line",
  "circle",
  "filledCircle",
  "polygon",
  "filledPolygon",
  "rect",
  "filledRect",
  "text",
  "textbox",
  "image",
];

/**
 * Where guesses at drawing methods belong: `screen.drawRect`,
 * `screen.polygon` and `screen.draw.fillRect` all point at the real
 * `screen.draw` method. (`screen.circle`, `screen.rect`, `screen.line` and
 * `screen.text` are real short forms, so another spelling of one, such as
 * `screen.Circle`, points at the short form instead.) There is no
 * `screen.draw.triangle`, so it points at the short form.
 */
const screenHints: Record<string, string> = Object.fromEntries([
  ...drawMethods.flatMap((name) => {
    const loose = looseName(name);
    return [
      [`draw${loose}`, `screen.draw.${name}`],
      [loose, `screen.draw.${name}`],
    ];
  }),
  ["fillrect", "screen.draw.filledRect"],
  ["fillcircle", "screen.draw.filledCircle"],
  ["fillpolygon", "screen.draw.filledPolygon"],
  ["rectangle", "screen.draw.rect"],
  ["filledrectangle", "screen.draw.filledRect"],
  ["fillrectangle", "screen.draw.filledRect"],
  ["drawrectangle", "screen.draw.rect"],
  ["triangle", "screen.triangle"],
  ["filledtriangle", "screen.triangle"],
]);

/**
 * A class a game sees beside the service it makes (`Screen` beside `screen`):
 * reading one of the service's members on the class, as in
 * `Screen.fill("navy")` with a capital S, says which name was meant instead
 * of failing as "Screen.fill is not a function". Everything the class itself
 * has, and constructing it, is unchanged.
 */
function pointToService<T extends object>(
  cls: T,
  className: string,
  serviceName: string,
  service: object,
): T {
  return new Proxy(cls, {
    get(target, property, receiver) {
      if (
        typeof property === "string" &&
        !(property in target) &&
        property in service
      ) {
        const member = guardedMember(service, property) ?? property;
        throw new TypeError(
          `${className}.${property} doesn't exist. Did you mean ${serviceName}.${member}?`,
        );
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
}

/** Screen's internal drawing helpers, which take different arguments. */
const screenInternals = [
  "drawSurface",
  "drawLine",
  "drawCircle",
  "drawPolygon",
  "drawRect",
  "drawText",
  "drawTextbox",
];

/**
 * Browser globals a game cannot reach, with what to use instead. Games run
 * in their own scope, so without these hints `setTimeout(...)` would fail
 * with a bare "setTimeout is not a function".
 */
const unavailableGlobalHints: Record<string, string> = {
  setTimeout:
    "Use clock.schedule(callback, seconds) instead. It takes seconds, not milliseconds, and pauses with the game.",
  setInterval:
    "Use clock.scheduleInterval(callback, seconds) instead. It takes seconds, not milliseconds, and pauses with the game.",
  clearTimeout:
    "Use clock.unschedule(callback) to cancel something scheduled with clock.",
  clearInterval:
    "Use clock.unschedule(callback) to cancel something scheduled with clock.",
  requestAnimationFrame:
    "The game already calls update() and draw() for you on every frame.",
  alert:
    "Show a message with screen.draw.text() inside draw(), or print it with console.log().",
  confirm:
    "Show a question with screen.draw.text() and read the answer in onKeyDown() or onMouseDown().",
  prompt:
    "Show a question with screen.draw.text() and read the answer in onKeyDown() or onMouseDown().",
  window:
    "Games draw on their canvas with screen, and read input with keyboard and hooks like onKeyDown().",
  document:
    "Games draw on their canvas with screen, and read input with keyboard and hooks like onKeyDown().",
  localStorage: 'Use storage instead, for example storage.set("score", 10).',
  sessionStorage: 'Use storage instead, for example storage.set("score", 10).',
  Image:
    'Use new Actor("name") or screen.blit("name", [x, y]) to show a picture from images/.',
  Audio:
    'Use sounds.name.play() for a sound in sounds/, or music.play("name") for music.',
  run: "A game file runs by itself: put WIDTH, HEIGHT and hooks like function draw() {} at its top level.",
};

const sourceResultFields = [
  ...RUNTIME_CONFIGURATION_NAMES.map((name) => `${name}: ${name}`),
  ...RUNTIME_SOURCE_HOOK_NAMES.map(
    (name) => `${name}: typeof ${name} === "function" ? ${name} : undefined`,
  ),
].join(",\n");

export type SourceInspector = {
  /** Non-function top-level declarations and assignments. */
  bindings(): readonly string[];
  /** Top-level function declarations and function-valued bindings. */
  functions(): readonly string[];
  read(name: string): unknown;
};

type SourceEvaluation = {
  readonly module: GameModule;
  readonly inspector: SourceInspector;
};

type EvaluatedSource = {
  readonly module: GameModule;
  readonly readers: Record<string, () => unknown>;
};

/** Evaluates one zero-boilerplate script inside its run-owned service scope. */
export function executeZeroBoilerplateSource(
  source: string,
  context: SourceEvaluationContext,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): SourceEvaluation {
  diagnoseSource(source, emit);
  const scan = scanSource(source);
  const functionNames = new Set(scan.topLevelFunctions);
  const bindingNames = scan.complete
    ? scan.topLevelAssignments.filter((name) => !functionNames.has(name))
    : [];
  const callableNames = scan.complete ? [...functionNames] : [];

  class RuntimeActor extends Actor {
    constructor(
      image: string,
      pos?: ConstructorParameters<typeof Actor>[1],
      options: ActorOptions = {},
    ) {
      super(image, pos as never, {
        ...options,
        screen: context.screen,
        loader: context.loaders.images,
        clock: context.clock,
      });
    }
  }

  const globals = {
    // On this game's clock even when started outside a hook.
    ...animationsOn(context.clock),
    Clock: pointToService(Clock, "Clock", "clock", context.clock),
    Rect,
    ZRect,
    Screen: pointToService(Screen, "Screen", "screen", context.screen),
    Storage: pointToService(Storage, "Storage", "storage", context.storage),
    Actor: RuntimeActor,
    // A misspelled service member fails with a suggestion. Storage, keyboard
    // and the asset loaders treat unknown names as data, keys, or assets.
    screen: friendlyService(context.screen, "screen", {
      hidden: screenInternals,
      nested: ["draw"],
      hints: screenHints,
    }),
    clock: friendlyService(context.clock, "clock"),
    keyboard: context.keyboard,
    keymods: friendlyService(keymods, "keymods"),
    keys: friendlyService(keys, "keys"),
    mouse: friendlyService(
      createLiveMouse(context.mouseState, () => [
        context.screen.width / 2,
        context.screen.height / 2,
      ]),
      "mouse",
    ),
    images: context.loaders.images,
    sounds: context.loaders.sounds,
    music: friendlyService(context.music, "music"),
    storage: context.storage,
    tone: friendlyService(context.tone, "tone"),
    randomInt,
    randomChoice,
    clamp,
    rgb,
    exit: () => context.stop?.(),
    // A seeded run gives the game a Math of its own, so its sequence is
    // repeatable and no other game or page script can draw from it.
    ...(context.random ? { Math: mathWithRandom(context.random) } : {}),
  };
  const scopeTarget: Record<string, unknown> = { ...globals };
  // The game's own global object: what it assigns at the top level, and the
  // built-ins. The page's `window` stays out of reach, as it does by name.
  scopeTarget.globalThis = new Proxy(scopeTarget, {
    get(target, property, receiver) {
      if (typeof property === "string" && !(property in target)) {
        return builtinGlobals[property];
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
    has: (target, property) => property in target || property in builtinGlobals,
  });
  // The runtime sizes the canvas from WIDTH and HEIGHT once top-level code
  // has run, so while it runs the screen follows them as they're set, from
  // the runtime's default size: top-level code sees the screen that update()
  // and draw() will. The runtime still settles the density, and warns about
  // an unusable size, afterwards.
  let topLevel = false;
  function sizeScreen(): void {
    resizeScreen(
      context.screen,
      configuredSize("WIDTH", 800),
      configuredSize("HEIGHT", 600),
      context.screen.density,
    );
  }
  function configuredSize(name: "WIDTH" | "HEIGHT", fallback: number): number {
    const value = scopeTarget[name];
    return isValidRuntimeDimension(value) ? Math.floor(value) : fallback;
  }
  // Reading a name nothing defined is a ReferenceError, like in any other
  // JavaScript, instead of a silent undefined that only fails later as
  // "undefined is not an object". The runtime's own reads of optional hooks
  // and settings, and the script's `typeof name` checks, stay quiet.
  const optionalNames = new Set<string>([
    ...RUNTIME_CONFIGURATION_NAMES,
    ...RUNTIME_SOURCE_HOOK_NAMES,
    ...bindingNames,
    ...callableNames,
    ...typeofOperands(source),
  ]);
  const scope = new Proxy(scopeTarget, {
    has(_target, property) {
      return property !== Symbol.unscopables;
    },
    get(target, property) {
      if (property === Symbol.unscopables) return undefined;
      if (typeof property !== "string") return undefined;
      if (property in target) return target[property];
      if (property in builtinGlobals) return builtinGlobals[property];
      if (optionalNames.has(property)) return undefined;
      throw undefinedNameError(property, source, target);
    },
    set(target, property, value) {
      if (typeof property === "string") target[property] = value;
      if (topLevel && (property === "WIDTH" || property === "HEIGHT")) {
        sizeScreen();
      }
      return true;
    },
  });

  let factory: (scope: unknown) => unknown;
  try {
    factory = new Function(
      "scope",
      wrapSource(source, String(sourceResultFields), [
        ...bindingNames,
        ...callableNames,
      ]),
    ) as (scope: unknown) => unknown;
  } catch (error) {
    // V8 places no syntax error in `new Function` code, so find its line here.
    if (error instanceof SyntaxError && sourceLineOf(error) === undefined) {
      const line = syntaxErrorLine(source, error.message);
      if (line !== undefined) syntaxLines.set(error, line);
    }
    throw error;
  }
  topLevel = true;
  sizeScreen();
  let evaluated: EvaluatedSource;
  try {
    evaluated = factory(scope) as EvaluatedSource;
  } finally {
    topLevel = false;
  }
  const bindings = Object.freeze([...bindingNames]);
  const callables = Object.freeze(callableNames);
  return {
    module: evaluated.module,
    inspector: {
      bindings: () => bindings,
      functions: () => callables,
      read(name: string): unknown {
        if (!bindings.includes(name) && !callables.includes(name)) {
          throw new TypeError(`Unknown game-state binding: ${name}`);
        }
        return evaluated.readers[name]?.();
      },
    },
  };
}

function typeofOperands(source: string): string[] {
  const tokens = tokenizeSource(source) ?? [];
  const operands: string[] = [];
  tokens.forEach((token, index) => {
    const next = tokens[index + 1];
    if (token.value === "typeof" && next?.type === "identifier") {
      operands.push(next.value);
    }
  });
  return operands;
}

function undefinedNameError(
  name: string,
  source: string,
  scope: Record<string, unknown>,
): ReferenceError {
  const hint = unavailableGlobalHints[name];
  if (hint !== undefined) {
    return new ReferenceError(
      `${name} isn't available in js-game-zero games. ${hint}`,
    );
  }
  const tokens = tokenizeSource(source) ?? [];
  const sourceNames = tokens
    .filter(
      (token, index) =>
        token.type === "identifier" && tokens[index - 1]?.value !== ".",
    )
    .map((token) => token.value);
  const candidates = new Set([
    ...Object.keys(scope),
    ...Object.keys(builtinGlobals),
    ...sourceNames,
  ]);
  const error = new ReferenceError(
    `${name} is not defined.${didYouMean(name, candidates)}`,
  );
  const line = onlyLineOf(name, source);
  if (line !== undefined) nameLines.set(error, line);
  return error;
}

/**
 * The one line of `source` that reads `name` (outside strings and comments,
 * and not as a property after a dot), or undefined when it's on none or on
 * more than one.
 */
export function onlyLineOf(name: string, source: string): number | undefined {
  const escaped = name.replace(/[$]/g, "\\$");
  const read = new RegExp(`(^|[^\\w$.])${escaped}(?![\\w$])`);
  const lines = source
    .split("\n")
    .map((line) =>
      line
        .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""')
        .replace(/\/\/.*$/, ""),
    );
  const found = lines.flatMap((line, i) => (read.test(line) ? [i + 1] : []));
  return found.length === 1 ? found[0] : undefined;
}

/**
 * The wrapper every zero-boilerplate source is compiled in. It lives in one
 * place so the line calibration below sees exactly what the game sees.
 */
function wrapSource(
  source: string,
  resultFields: string,
  bindingNames: readonly string[] = [],
): string {
  const readerFields = bindingNames
    .map((name) => `${JSON.stringify(name)}: () => ${name}`)
    .join(",\n");
  return `return (function() {
      with (scope) {
        ${source}
        return {
          module: { ${resultFields} },
          readers: { ${readerFields} }
        };
      };
    })();`;
}

/**
 * How this engine numbers lines in `new Function` code: from the file token of
 * a stack frame (V8, SpiderMonkey), or, where a frame there has no location
 * (JavaScriptCore), from the error's own `line`.
 */
export type FrameCalibration =
  | { readonly kind: "stack"; readonly marker: string; readonly offset: number }
  | {
      readonly kind: "line";
      readonly offset: number;
      /** The `sourceURL` errors from game code carry: none, on JavaScriptCore. */
      readonly url: string | undefined;
    };
let calibration: FrameCalibration | null | undefined;

/** `file:line:col` at the end of a stack frame, with or without a closing paren. */
const FRAME_RE = /([^\s()]+):(\d+):(\d+)\)?\s*$/;

function frames(stack: string): { file: string; line: number }[] {
  const out: { file: string; line: number }[] = [];
  for (const raw of stack.split("\n")) {
    const match = FRAME_RE.exec(raw);
    if (match) out.push({ file: match[1]!, line: Number(match[2]) });
  }
  return out;
}

/** JavaScriptCore's own position for an error: where it was thrown, and in what script. */
const ownLine = (error: Error) => {
  const { line, sourceURL } = error as Error & {
    line?: unknown;
    sourceURL?: unknown;
  };
  return {
    line: typeof line === "number" ? line : undefined,
    url: typeof sourceURL === "string" ? sourceURL : undefined,
  };
};

/**
 * The calibration a throw from the first line of game source gives. The
 * throwing frame is the stack's first frame, after V8's `Error: message` line:
 * when it has a location, its file token marks game frames; when it has none
 * (JavaScriptCore's `anonymous@`), the error's own `line` is used instead.
 */
export function readCalibration(error: unknown): FrameCalibration | null {
  if (!(error instanceof Error) || !error.stack) return null;
  const lines = error.stack.split("\n");
  const throwing = lines[0]?.startsWith(String(error)) ? lines[1] : lines[0];
  const match = throwing ? FRAME_RE.exec(throwing) : null;
  if (match) {
    const line = Number(match[2]);
    return line >= 1
      ? { kind: "stack", marker: match[1]!, offset: line - 1 }
      : null;
  }
  const own = ownLine(error);
  return own.line !== undefined && own.line >= 1
    ? { kind: "line", offset: own.line - 1, url: own.url }
    : null;
}

/**
 * Learns how this engine numbers lines inside `new Function` code by throwing
 * from a one-line source through the real wrapper.
 */
function calibrateFrames(): FrameCalibration | null {
  try {
    const factory = new Function(
      "scope",
      wrapSource('throw new Error("calibrate");', "", []),
    );
    factory({});
  } catch (error) {
    return readCalibration(error);
  }
  return null;
}

/** The game source's line for `error` under `calibration`, or undefined when it wasn't thrown there. */
export function lineWith(
  calibration: FrameCalibration,
  error: unknown,
): number | undefined {
  if (!(error instanceof Error) || !error.stack) return undefined;
  let line: number | undefined;
  if (calibration.kind === "stack") {
    const frame = frames(error.stack).find(
      (candidate) => candidate.file === calibration.marker,
    );
    line = frame && frame.line - calibration.offset;
  } else {
    // Thrown in game code: its own position is in the same script as the calibration's.
    const own = ownLine(error);
    if (own.line !== undefined && own.url === calibration.url)
      line = own.line - calibration.offset;
  }
  return line !== undefined && line >= 1 ? line : undefined;
}

/** Syntax errors in game source, with the line `syntaxErrorLine` found for each. */
const syntaxLines = new WeakMap<object, number>();
/**
 * Undefined names, with the one line that reads each: their line where the
 * engine gives none (JavaScriptCore, since the error is thrown in the scope).
 */
const nameLines = new WeakMap<object, number>();

/** A syntax error's message that means the source ended inside something still open. */
const AT_END = /end of (input|script)/i;

/** The syntax error compiling `source` gives, or undefined when it compiles. */
function compileProblem(source: string): string | undefined {
  try {
    new Function("scope", source);
    return undefined;
  } catch (error) {
    return error instanceof SyntaxError ? error.message : undefined;
  }
}

/**
 * The 1-based line of the syntax error `message` in `source`, for engines that
 * give none: the first line whose prefix of the source fails with the same
 * message. An error at the end of the source (something left open) is placed
 * on the line after the last prefix that compiles, where the open part starts.
 */
export function syntaxErrorLine(
  source: string,
  message: string,
): number | undefined {
  const lines = source.split("\n");
  const atEnd = AT_END.test(message);
  let compiles = 0;
  for (let k = 1; k <= lines.length; k += 1) {
    const problem = compileProblem(lines.slice(0, k).join("\n"));
    if (problem === undefined) compiles = k;
    else if (!atEnd && problem === message) return k;
  }
  return atEnd && compiles < lines.length ? compiles + 1 : undefined;
}

/**
 * The 1-based line in the game source where `error` was thrown, or undefined
 * when it wasn't thrown in game code (the error came from the library, or the
 * engine gives no usable position).
 */
export function sourceLineOf(error: unknown): number | undefined {
  const known =
    typeof error === "object" && error ? syntaxLines.get(error) : undefined;
  if (known !== undefined) return known;
  calibration ??= calibrateFrames();
  const line = calibration ? lineWith(calibration, error) : undefined;
  return (
    line ??
    (typeof error === "object" && error ? nameLines.get(error) : undefined)
  );
}
