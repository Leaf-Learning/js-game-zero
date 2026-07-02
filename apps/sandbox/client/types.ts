export type ProjectSummary = {
  readonly name: string;
  readonly files: readonly string[];
};

export type DiagnosticSeverity = "warning" | "error";

export type Diagnostic = {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly code?: string;
  readonly line?: number;
};

export type ConsoleLevel = "log" | "info" | "warn" | "error";

export type ConsoleLine = {
  readonly level: ConsoleLevel;
  readonly text: string;
};

export type ExampleSummary = {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly expectsInput: "keyboard" | "mouse" | "none";
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

/** Messages posted from the preview iframe (client/preview-entry.ts) to the parent app. */
export type PreviewMessage =
  | {
      readonly source: "jgz-sandbox-preview";
      readonly project: string;
      readonly type: "status";
      readonly status: {
        readonly ready: boolean;
        readonly nonblank: boolean;
        readonly frames: number;
      };
    }
  | {
      readonly source: "jgz-sandbox-preview";
      readonly project: string;
      readonly type: "diagnostic";
      readonly diagnostic: Diagnostic;
    }
  | {
      readonly source: "jgz-sandbox-preview";
      readonly project: string;
      readonly type: "runtime-error";
      readonly message: string;
      readonly line?: number;
    }
  | {
      readonly source: "jgz-sandbox-preview";
      readonly project: string;
      readonly type: "console";
      readonly level: ConsoleLevel;
      readonly text: string;
    }
  | {
      readonly source: "jgz-sandbox-preview";
      readonly project: string;
      readonly type: "focus-changed";
      readonly focused: boolean;
    };
