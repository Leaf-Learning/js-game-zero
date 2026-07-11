export type ProjectSummary = {
  readonly name: string;
  readonly files: readonly string[];
};

export type ExampleSummary = {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly expectsInput: "keyboard" | "mouse" | "none";
};

export type DiagnosticSeverity = "warning" | "error";

export type Diagnostic = {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly code?: string;
  readonly line?: number;
};

export type ConsoleLevel = "log" | "info" | "warn" | "error";

export type PreviewMessage =
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

export type ApiServerErrorCode =
  | "invalid_request"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "method_not_allowed"
  | "internal_error";

export type ApiClientErrorCode =
  ApiServerErrorCode | "invalid_response" | "network_error";

export type ApiErrorResponse = {
  readonly error: string;
  readonly code: ApiServerErrorCode;
};

export type CreateProjectRequest = {
  readonly name: string;
  readonly exampleSlug?: string;
};

export type RenameProjectRequest = { readonly name: string };
export type WriteFileRequest = {
  readonly content: string;
  readonly baseVersion: number;
  readonly revision: number;
  readonly sessionId: string;
};
export type RenameFileRequest = {
  readonly from: string;
  readonly to: string;
};

export type ProjectResponse = { readonly project: ProjectSummary };
export type ProjectsResponse = { readonly projects: readonly ProjectSummary[] };
export type ExamplesResponse = { readonly examples: readonly ExampleSummary[] };
export type FileResponse = {
  readonly project: string;
  readonly path: string;
  readonly content: string;
  readonly version: number;
};
export type MutationResponse = {
  readonly ok: true;
  readonly project: string;
  readonly path?: string;
  readonly from?: string;
  readonly to?: string;
  readonly bytes?: number;
  readonly version?: number;
  readonly stale?: boolean;
};

export type Decoder<T> = (value: unknown) => T | null;

export function decodeCreateProjectRequest(
  value: unknown,
): CreateProjectRequest | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  if (
    value.exampleSlug !== undefined &&
    typeof value.exampleSlug !== "string"
  ) {
    return null;
  }
  return value.exampleSlug === undefined
    ? { name: value.name }
    : { name: value.name, exampleSlug: value.exampleSlug };
}

export function decodeRenameProjectRequest(
  value: unknown,
): RenameProjectRequest | null {
  return isRecord(value) && typeof value.name === "string"
    ? { name: value.name }
    : null;
}

export function decodeWriteFileRequest(
  value: unknown,
): WriteFileRequest | null {
  return isRecord(value) &&
    typeof value.content === "string" &&
    isNonNegativeInteger(value.baseVersion) &&
    isNonNegativeInteger(value.revision) &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0 &&
    value.sessionId.length <= 128
    ? {
        content: value.content,
        baseVersion: value.baseVersion,
        revision: value.revision,
        sessionId: value.sessionId,
      }
    : null;
}

export function decodeRenameFileRequest(
  value: unknown,
): RenameFileRequest | null {
  return isRecord(value) &&
    typeof value.from === "string" &&
    typeof value.to === "string"
    ? { from: value.from, to: value.to }
    : null;
}

export function decodeProjectsResponse(
  value: unknown,
): ProjectsResponse | null {
  if (!isRecord(value) || !Array.isArray(value.projects)) return null;
  const projects = value.projects.map(decodeProjectSummary);
  return projects.every(isPresent) ? { projects } : null;
}

export function decodeProjectResponse(value: unknown): ProjectResponse | null {
  if (!isRecord(value)) return null;
  const project = decodeProjectSummary(value.project);
  return project ? { project } : null;
}

export function decodeExamplesResponse(
  value: unknown,
): ExamplesResponse | null {
  if (!isRecord(value) || !Array.isArray(value.examples)) return null;
  const examples = value.examples.map(decodeExampleSummary);
  return examples.every(isPresent) ? { examples } : null;
}

export function decodeFileResponse(value: unknown): FileResponse | null {
  return isRecord(value) &&
    typeof value.project === "string" &&
    typeof value.path === "string" &&
    typeof value.content === "string" &&
    isNonNegativeInteger(value.version)
    ? {
        project: value.project,
        path: value.path,
        content: value.content,
        version: value.version,
      }
    : null;
}

export function decodeMutationResponse(
  value: unknown,
): MutationResponse | null {
  if (
    !isRecord(value) ||
    value.ok !== true ||
    typeof value.project !== "string"
  ) {
    return null;
  }
  if (value.version !== undefined && !isNonNegativeInteger(value.version)) {
    return null;
  }
  if (value.stale !== undefined && typeof value.stale !== "boolean") {
    return null;
  }
  if (value.path !== undefined && typeof value.path !== "string") return null;
  if (value.from !== undefined && typeof value.from !== "string") return null;
  if (value.to !== undefined && typeof value.to !== "string") return null;
  if (
    value.bytes !== undefined &&
    (typeof value.bytes !== "number" || !Number.isSafeInteger(value.bytes))
  ) {
    return null;
  }
  return {
    ok: true,
    project: value.project,
    ...(typeof value.path === "string" ? { path: value.path } : {}),
    ...(typeof value.from === "string" ? { from: value.from } : {}),
    ...(typeof value.to === "string" ? { to: value.to } : {}),
    ...(typeof value.bytes === "number" ? { bytes: value.bytes } : {}),
    ...(typeof value.version === "number" ? { version: value.version } : {}),
    ...(typeof value.stale === "boolean" ? { stale: value.stale } : {}),
  };
}

export function decodeApiErrorResponse(
  value: unknown,
): ApiErrorResponse | null {
  if (
    !isRecord(value) ||
    typeof value.error !== "string" ||
    !isApiServerErrorCode(value.code)
  ) {
    return null;
  }
  return { error: value.error, code: value.code };
}

export function isPreviewMessage(value: unknown): value is PreviewMessage {
  if (
    !isRecord(value) ||
    value.source !== "jgz-sandbox-preview" ||
    typeof value.project !== "string" ||
    typeof value.type !== "string"
  ) {
    return false;
  }
  if (value.type === "console") {
    return isConsoleLevel(value.level) && typeof value.text === "string";
  }
  if (value.type === "focus-changed") return typeof value.focused === "boolean";
  if (value.type === "runtime-error") {
    return (
      typeof value.message === "string" &&
      (value.line === undefined || isPositiveInteger(value.line))
    );
  }
  if (value.type === "diagnostic") return isDiagnostic(value.diagnostic);
  return false;
}

function decodeProjectSummary(value: unknown): ProjectSummary | null {
  return isRecord(value) &&
    typeof value.name === "string" &&
    Array.isArray(value.files) &&
    value.files.every((file) => typeof file === "string")
    ? { name: value.name, files: value.files }
    : null;
}

function decodeExampleSummary(value: unknown): ExampleSummary | null {
  return isRecord(value) &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    (value.expectsInput === "keyboard" ||
      value.expectsInput === "mouse" ||
      value.expectsInput === "none")
    ? {
        slug: value.slug,
        title: value.title,
        description: value.description,
        expectsInput: value.expectsInput,
      }
    : null;
}

function isDiagnostic(value: unknown): value is Diagnostic {
  return (
    isRecord(value) &&
    (value.severity === "warning" || value.severity === "error") &&
    typeof value.message === "string" &&
    (value.code === undefined || typeof value.code === "string") &&
    (value.line === undefined || isPositiveInteger(value.line))
  );
}

function isApiServerErrorCode(value: unknown): value is ApiServerErrorCode {
  return (
    value === "invalid_request" ||
    value === "forbidden" ||
    value === "not_found" ||
    value === "conflict" ||
    value === "method_not_allowed" ||
    value === "internal_error"
  );
}

function isConsoleLevel(value: unknown): value is ConsoleLevel {
  return (
    value === "log" || value === "info" || value === "warn" || value === "error"
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
