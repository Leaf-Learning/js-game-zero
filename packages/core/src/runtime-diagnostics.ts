import { validateAssetName } from "./assets";
import {
  getParameterNames,
  HOOK_PARAMETERS,
  INPUT_HOOK_NAMES,
  resolveHookParameters,
  takesWholeEvent,
  type Hook,
} from "./events";
import type {
  GameModule,
  RunOptions,
  RuntimeDiagnostic,
  RuntimeMode,
} from "./runtime-contracts";
import { scanSource } from "./source-scan";
import {
  closestName,
  imageExtensions,
  looseName,
  soundExtensions,
} from "./util";

export const RUNTIME_CONFIGURATION_NAMES = [
  "WIDTH",
  "HEIGHT",
  "PIXEL_DENSITY",
  "TITLE",
  "ICON",
  "TOUCH_CONTROLS",
] as const;

/** Every hook a zero-boilerplate script can define. */
export const RUNTIME_SOURCE_HOOK_NAMES = [
  "draw",
  "update",
  ...INPUT_HOOK_NAMES,
] as const;

const hookNames = RUNTIME_SOURCE_HOOK_NAMES;

export const RUNTIME_MODULE_OPTION_NAMES = [
  ...RUNTIME_CONFIGURATION_NAMES,
  ...hookNames,
] as const;

const constantNames = new Set<string>(RUNTIME_CONFIGURATION_NAMES);
const hookNameSet = new Set<string>(hookNames);

export function collectRuntimeDiagnostics(
  moduleOrSource: GameModule | string,
  options: RunOptions = {},
): RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = [];
  const emit = createDiagnosticEmitter(diagnostics);
  if (typeof moduleOrSource === "string") {
    diagnoseSource(moduleOrSource, emit);
    return diagnostics;
  }
  diagnoseGameModule(moduleOrSource, options, emit, "import");
  return diagnostics;
}

export function diagnoseGameModule(
  module: GameModule,
  options: RunOptions,
  emit: (diagnostic: RuntimeDiagnostic) => void,
  mode: RuntimeMode,
): void {
  const keys = Object.keys(module);
  const defined = new Set(keys);
  for (const key of keys) diagnoseIdentifier(key, "function", defined, emit);
  for (const key of RUNTIME_MODULE_OPTION_NAMES) {
    if (module[key] !== undefined && options[key] !== undefined) {
      emit({
        code: "duplicate-config",
        severity: "warning",
        name: key,
        message: `${key} appears in both the ${mode} module and run options.`,
      });
    }
  }
  warnHookParameters(module, emit);
  warnHookArity("draw", module.draw, 0, emit);
  warnHookArity("update", module.update, 1, emit);
  if (module.WIDTH !== undefined && !isValidRuntimeDimension(module.WIDTH)) {
    emit({
      code: "invalid-config",
      severity: "warning",
      name: "WIDTH",
      message: "WIDTH should be a positive finite number.",
    });
  }
  if (module.HEIGHT !== undefined && !isValidRuntimeDimension(module.HEIGHT)) {
    emit({
      code: "invalid-config",
      severity: "warning",
      name: "HEIGHT",
      message: "HEIGHT should be a positive finite number.",
    });
  }
}

/**
 * Static checks on zero-boilerplate source. Typo checks only look at what the
 * script defines at top level — a top-level function whose name is nearly a
 * hook name, or a top-level assignment whose name is nearly a configuration
 * constant — never at identifiers the script merely uses (`row`, `col`,
 * `rows[y]`), and never when the real name is also defined (`draw` plus a
 * `drawn` helper is not a typo). Asset-name checks scan every quoted string.
 */
export function diagnoseSource(
  source: string,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  const scan = scanSource(source);
  if (scan.complete) {
    const defined = new Set([
      ...scan.topLevelFunctions,
      ...scan.topLevelAssignments,
    ]);
    const functions = new Set(scan.topLevelFunctions);
    for (const name of functions)
      diagnoseIdentifier(name, "function", defined, emit);
    for (const name of scan.topLevelAssignments) {
      if (!functions.has(name))
        diagnoseIdentifier(name, "assignment", defined, emit);
    }
  }
  for (const match of source.matchAll(/["'`]([^"'`]+)["'`]/g)) {
    const name = match[1];
    if (name) diagnoseAssetName(name, emit);
  }
}

export function createDiagnosticEmitter(
  diagnostics: RuntimeDiagnostic[],
  callback?: (diagnostic: RuntimeDiagnostic) => void,
): (diagnostic: RuntimeDiagnostic) => void {
  return (diagnostic) => {
    diagnostics.push(diagnostic);
    callback?.(diagnostic);
  };
}

let activeDiagnosticEmit: ((diagnostic: RuntimeDiagnostic) => void) | null =
  null;

/**
 * Ambient diagnostic sink for whichever run is active at call time, mirroring
 * the active-service pattern used for loaders/storage/clock. Only valid for
 * the duration of the synchronous call that reads it — callers whose work
 * continues asynchronously (e.g. a loader promise that may reject later)
 * must capture the returned function and close over it rather than reading
 * the ambient value again once the run may have moved on.
 */
export function setActiveDiagnosticEmit(
  emit: ((diagnostic: RuntimeDiagnostic) => void) | null,
): ((diagnostic: RuntimeDiagnostic) => void) | null {
  const previous = activeDiagnosticEmit;
  activeDiagnosticEmit = emit;
  return previous;
}

export function getActiveDiagnosticEmit():
  ((diagnostic: RuntimeDiagnostic) => void) | null {
  return activeDiagnosticEmit;
}

export function describeRuntimeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isValidRuntimeDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function diagnoseIdentifier(
  name: string,
  kind: "function" | "assignment",
  defined: ReadonlySet<string>,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  if (constantNames.has(name) || hookNameSet.has(name)) return;
  const constantSuggestion =
    name !== name.toLowerCase()
      ? closestName(name, RUNTIME_CONFIGURATION_NAMES)
      : undefined;
  if (constantSuggestion && !defined.has(constantSuggestion)) {
    emit({
      code: "constant-typo",
      severity: "warning",
      name,
      suggestion: constantSuggestion,
      message: `Did you mean ${constantSuggestion} instead of ${name}?`,
    });
    return;
  }
  if (kind !== "function") return;
  const hookSuggestion = closestName(name, hookNames);
  if (hookSuggestion && !defined.has(hookSuggestion)) {
    // Another spelling of a hook (Pygame Zero's `on_key_down`) is never
    // called, which is worth saying outright rather than as a typo.
    const respelled = looseName(name) === looseName(hookSuggestion);
    emit({
      code: "hook-typo",
      severity: "warning",
      name,
      suggestion: hookSuggestion,
      message: respelled
        ? `${name} is never called. Hooks are named in camelCase, so rename it to ${hookSuggestion}.`
        : `Did you mean ${hookSuggestion} instead of ${name}?`,
    });
  }
}

function diagnoseAssetName(
  name: string,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  const extension = name.split(".").at(-1)?.toLowerCase();
  const kind =
    extension && imageExtensions.includes(extension)
      ? "image"
      : extension && soundExtensions.includes(extension)
        ? "sound"
        : null;
  if (!kind) return;
  const extensions = kind === "image" ? imageExtensions : soundExtensions;
  try {
    validateAssetName(kind, name, extensions);
  } catch (error) {
    emit({
      code: "asset-name",
      severity: "warning",
      name,
      message: describeRuntimeError(error),
    });
  }
}

/**
 * Input hooks are matched by parameter name, with any other name filled by
 * its place in the list. That keeps `onKeyDown(k)` working, but a learner
 * who wrote `onMouseDown(btn)` gets the position, not the button — so say
 * which value each unfamiliar name receives.
 */
function warnHookParameters(
  module: GameModule,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  for (const name of INPUT_HOOK_NAMES) {
    const hook = module[name];
    if (typeof hook !== "function") continue;
    if (takesWholeEvent(hook)) continue;
    const declared = getParameterNames(hook);
    const known = HOOK_PARAMETERS[name];
    const resolved = resolveHookParameters(declared, known);
    declared.forEach((parameter, index) => {
      if ((known as readonly string[]).includes(parameter)) return;
      const receives = resolved[index];
      const knownList = known.length > 0 ? known.join(", ") : "nothing";
      emit({
        code: "hook-parameter",
        severity: "warning",
        name,
        ...(receives === undefined ? {} : { suggestion: receives }),
        message:
          receives === undefined
            ? `${name} receives ${knownList}, so its ${parameter} parameter will always be undefined.`
            : `${name}'s ${parameter} parameter receives ${receives}, because it is in that place in the list. Rename it to ${receives} to make that clear (${name} receives ${knownList}).`,
      });
    });
  }
}

function warnHookArity(
  name: "draw" | "update",
  hook: Hook | undefined,
  maximum: number,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  if (!hook) return;
  const arity = getParameterNames(hook).length;
  if (arity > maximum) {
    emit({
      code: "hook-arity",
      severity: "warning",
      name,
      message:
        name === "draw"
          ? "draw should not declare parameters."
          : "update should accept either no parameters or one dt parameter.",
    });
  }
}
