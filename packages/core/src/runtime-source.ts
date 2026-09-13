import { Actor, type ActorOptions } from "./actor";
import { Animation, animate } from "./animation";
import type { AssetLoaders } from "./assets";
import { createBrowserSoundAsset, type MusicPlayer } from "./audio";
import { Clock } from "./clock";
import { Rect, ZRect } from "./geometry";
import { KeyboardState, keymods, keys, mouse } from "./input";
import { Screen } from "./rendering";
import {
  diagnoseSource,
  RUNTIME_CONFIGURATION_NAMES,
  RUNTIME_SOURCE_HOOK_NAMES,
} from "./runtime-diagnostics";
import type { GameModule, RuntimeDiagnostic } from "./runtime-contracts";
import { scanSource } from "./source-scan";
import { Storage } from "./storage";
import type { ToneGenerator } from "./tone";

export type SourceEvaluationContext = {
  readonly screen: Screen;
  readonly clock: Clock;
  readonly keyboard: KeyboardState;
  readonly loaders: AssetLoaders;
  readonly music: MusicPlayer;
  readonly storage: Storage;
  readonly tone: ToneGenerator;
  stop: (() => void) | null;
};

const builtinGlobals: Record<string, unknown> = {
  Array,
  Boolean,
  Date,
  Error,
  Infinity,
  JSON,
  Map,
  Math,
  NaN,
  Number,
  Object,
  Promise,
  RangeError,
  RegExp,
  Set,
  String,
  TypeError,
  console,
  parseFloat,
  parseInt,
  undefined,
};

const sourceResultFields = [
  ...RUNTIME_CONFIGURATION_NAMES.map((name) => `${name}: ${name}`),
  ...RUNTIME_SOURCE_HOOK_NAMES.map(
    (name) => `${name}: typeof ${name} === "function" ? ${name} : undefined`,
  ),
].join(",\n");

export type SourceInspector = {
  bindings(): readonly string[];
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
  runFunction: unknown,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): SourceEvaluation {
  diagnoseSource(source, emit);
  const scan = scanSource(source);
  const functionNames = new Set(scan.topLevelFunctions);
  const bindingNames = scan.complete
    ? scan.topLevelAssignments.filter((name) => !functionNames.has(name))
    : [];

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
      });
    }
  }

  const globals = {
    Animation,
    animate,
    Clock,
    KeyboardState,
    Rect,
    ZRect,
    Screen,
    Storage,
    Actor: RuntimeActor,
    screen: context.screen,
    clock: context.clock,
    keyboard: context.keyboard,
    keymods,
    keys,
    mouse,
    images: context.loaders.images,
    sounds: context.loaders.sounds,
    music: context.music,
    createBrowserSoundAsset,
    storage: context.storage,
    tone: context.tone,
    run: runFunction,
    exit: () => context.stop?.(),
  };
  const scopeTarget: Record<string, unknown> = { ...globals };
  const scope = new Proxy(scopeTarget, {
    has(_target, property) {
      return property !== Symbol.unscopables;
    },
    get(target, property) {
      if (property === Symbol.unscopables) return undefined;
      if (typeof property !== "string") return undefined;
      if (property in target) return target[property];
      if (property in builtinGlobals) return builtinGlobals[property];
      return undefined;
    },
    set(target, property, value) {
      if (typeof property === "string") target[property] = value;
      return true;
    },
  });

  const factory = new Function(
    "scope",
    wrapSource(source, String(sourceResultFields), bindingNames),
  );
  const evaluated = factory(scope) as EvaluatedSource;
  const bindings = Object.freeze([...bindingNames]);
  return {
    module: evaluated.module,
    inspector: {
      bindings: () => bindings,
      read(name: string): unknown {
        if (!bindings.includes(name)) {
          throw new TypeError(`Unknown game-state binding: ${name}`);
        }
        return evaluated.readers[name]?.();
      },
    },
  };
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

type FrameCalibration = { readonly marker: string; readonly offset: number };
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

/**
 * Learns how this engine numbers lines inside `new Function` code by throwing
 * from a one-line source through the real wrapper: the frame's file token
 * (`<anonymous>` on V8) identifies game frames, and its line number minus one
 * is the wrapper's offset.
 */
function calibrateFrames(): FrameCalibration | null {
  try {
    const factory = new Function(
      "scope",
      wrapSource('throw new Error("calibrate");', "", []),
    );
    factory({});
  } catch (error) {
    const first =
      error instanceof Error && error.stack
        ? frames(error.stack)[0]
        : undefined;
    if (first && first.line >= 1)
      return { marker: first.file, offset: first.line - 1 };
  }
  return null;
}

/**
 * The 1-based line in the game source where `error` was thrown, or undefined
 * when the stack has no game frame (the error came from the library, or the
 * engine gives no usable stack).
 */
export function sourceLineOf(error: unknown): number | undefined {
  const stack = error instanceof Error ? error.stack : undefined;
  if (!stack) return undefined;
  calibration ??= calibrateFrames();
  if (!calibration) return undefined;
  const { marker, offset } = calibration;
  const frame = frames(stack).find((candidate) => candidate.file === marker);
  if (!frame) return undefined;
  const line = frame.line - offset;
  return line >= 1 ? line : undefined;
}
