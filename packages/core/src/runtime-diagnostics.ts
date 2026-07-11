import { validateAssetName } from "./assets";
import { getParameterNames, HOOK_ALIASES, type Hook } from "./events";
import type {
  GameModule,
  RunOptions,
  RuntimeDiagnostic,
  RuntimeMode,
} from "./runtime-contracts";
import { imageExtensions, levenshtein, soundExtensions } from "./util";

export const RUNTIME_CONFIGURATION_NAMES = [
  "WIDTH",
  "HEIGHT",
  "TITLE",
  "ICON",
] as const;

export const RUNTIME_SOURCE_HOOK_NAMES = [
  "draw",
  "update",
  ...HOOK_ALIASES.map(([snakeName]) => snakeName),
] as const;

const camelHookNames = HOOK_ALIASES.map(([, camelName]) => camelName);
const hookNames = [...RUNTIME_SOURCE_HOOK_NAMES, ...camelHookNames] as const;

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
  for (const key of Object.keys(module)) diagnoseIdentifier(key, emit);
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
  warnDuplicateHookAliases(module, emit);
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

export function diagnoseSource(
  source: string,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  const stripped = stripCommentsAndStrings(source);
  const seen = new Set<string>();
  for (const match of stripped.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    const name = match[0];
    if (seen.has(name)) continue;
    seen.add(name);
    diagnoseIdentifier(name, emit);
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

export function describeRuntimeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isValidRuntimeDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function diagnoseIdentifier(
  name: string,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  if (constantNames.has(name) || hookNameSet.has(name)) return;
  const constantSuggestion =
    name !== name.toLowerCase()
      ? closestName(name, RUNTIME_CONFIGURATION_NAMES)
      : undefined;
  if (constantSuggestion) {
    emit({
      code: "constant-typo",
      severity: "warning",
      name,
      suggestion: constantSuggestion,
      message: `Did you mean ${constantSuggestion} instead of ${name}?`,
    });
    return;
  }
  const hookSuggestion = closestName(name, hookNames);
  if (hookSuggestion) {
    emit({
      code: "hook-typo",
      severity: "warning",
      name,
      suggestion: hookSuggestion,
      message: `Did you mean ${hookSuggestion} instead of ${name}?`,
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

function warnDuplicateHookAliases(
  module: GameModule,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): void {
  for (const [snake, camel] of HOOK_ALIASES) {
    if (module[snake] && module[camel]) {
      emit({
        code: "duplicate-hook-alias",
        severity: "warning",
        name: snake,
        suggestion: camel,
        message: `${snake} and ${camel} are both defined; ${snake} will run first.`,
      });
    }
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

function closestName(
  name: string,
  candidates: readonly string[],
): string | undefined {
  const lower = name.toLowerCase();
  let best: { name: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = levenshtein(lower, candidate.toLowerCase());
    if (distance > 2) continue;
    if (!best || distance < best.distance) best = { name: candidate, distance };
  }
  return best?.name;
}

function stripCommentsAndStrings(source: string): string {
  return source.replaceAll(
    /\/\*[\s\S]*?\*\/|\/\/.*$|(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1/gm,
    " ",
  );
}
