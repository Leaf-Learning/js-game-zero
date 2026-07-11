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
  ...RUNTIME_CONFIGURATION_NAMES.map((name) => `${name}: scope.${name}`),
  ...RUNTIME_SOURCE_HOOK_NAMES.map(
    (name) =>
      `${name}: typeof ${name} === "function" ? ${name} : (typeof scope.${name} === "function" ? scope.${name} : undefined)`,
  ),
].join(",\n");

/** Evaluates one zero-boilerplate script inside its run-owned service scope. */
export function executeZeroBoilerplateSource(
  source: string,
  context: SourceEvaluationContext,
  runFunction: unknown,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): GameModule {
  diagnoseSource(source, emit);

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
    `return (function() {
      with (scope) {
        ${source}
      }
      return { ${sourceResultFields} };
    })();`,
  );
  return factory(scope) as GameModule;
}
