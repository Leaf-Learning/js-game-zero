import type { ConsoleLevel } from "../shared/contracts";

export type {
  ConsoleLevel,
  Diagnostic,
  DiagnosticSeverity,
  ExampleSummary,
  PreviewMessage,
  ProjectSummary,
} from "../shared/contracts";

export type ConsoleLine = {
  readonly level: ConsoleLevel;
  readonly text: string;
};

export type PreviewStatusKind = "stopped" | "running" | "error";

export const ASSET_DIRECTORIES = [
  "images",
  "sounds",
  "music",
  "fonts",
] as const;
export type AssetDirectory = (typeof ASSET_DIRECTORIES)[number];

export function isAssetPath(path: string): boolean {
  const top = path.split("/")[0] ?? "";
  return (ASSET_DIRECTORIES as readonly string[]).includes(top);
}

export function assetKindOf(path: string): AssetDirectory | null {
  const top = path.split("/")[0] ?? "";
  return (ASSET_DIRECTORIES as readonly string[]).includes(top)
    ? (top as AssetDirectory)
    : null;
}
