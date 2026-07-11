import {
  decodeApiErrorResponse,
  decodeExamplesResponse,
  decodeFileResponse,
  decodeMutationResponse,
  decodeProjectResponse,
  decodeProjectsResponse,
  type ApiClientErrorCode,
  type Decoder,
  type ExampleSummary,
  type ProjectSummary,
} from "../shared/contracts";

const fileVersions = new Map<string, number>();
const writeSessionId = createWriteSessionId();

export type FileWriteOutcome = "written" | "stale";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ApiClientErrorCode,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function projectFilesUrl(project: string, path: string): string {
  return `/api/projects/${encodeURIComponent(project)}/files/${encodePath(path)}`;
}

function projectAssetsUrl(project: string, path: string): string {
  return `/api/projects/${encodeURIComponent(project)}/assets/${encodePath(path)}`;
}

export function assetSourceUrl(project: string, path: string): string {
  return `/assets/${encodeURIComponent(project)}/${encodePath(path)}`;
}

async function requestJson<T>(
  url: string,
  decoder: Decoder<T>,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new ApiError(
      "Couldn't reach the sandbox server.",
      "network_error",
      undefined,
      {
        cause,
      },
    );
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = decodeApiErrorResponse(data);
    throw new ApiError(
      apiError?.error ?? (response.statusText || "Something went wrong."),
      apiError?.code ?? "internal_error",
      response.status,
    );
  }
  const decoded = decoder(data);
  if (!decoded) {
    throw new ApiError(
      `The sandbox server returned an invalid response for ${url}.`,
      "invalid_response",
      response.status,
    );
  }
  return decoded;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return Array.from(
    (await requestJson("/api/projects", decodeProjectsResponse)).projects,
  );
}

export async function getProject(name: string): Promise<ProjectSummary> {
  return (
    await requestJson(
      `/api/projects/${encodeURIComponent(name)}`,
      decodeProjectResponse,
    )
  ).project;
}

export async function createProject(
  name: string,
  exampleSlug?: string,
): Promise<ProjectSummary> {
  const data = await requestJson("/api/projects", decodeProjectResponse, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(exampleSlug ? { name, exampleSlug } : { name }),
  });
  return data.project;
}

export async function deleteProject(name: string): Promise<void> {
  await requestJson(
    `/api/projects/${encodeURIComponent(name)}`,
    decodeMutationResponse,
    { method: "DELETE" },
  );
  clearProjectFileVersions(name);
}

export async function renameProject(
  name: string,
  nextName: string,
): Promise<ProjectSummary> {
  const data = await requestJson(
    `/api/projects/${encodeURIComponent(name)}/rename`,
    decodeProjectResponse,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    },
  );
  moveProjectFileVersions(name, data.project.name);
  return data.project;
}

export async function readFile(project: string, path: string): Promise<string> {
  const data = await requestJson(
    projectFilesUrl(project, path),
    decodeFileResponse,
  );
  const key = fileVersionKey(project, path);
  fileVersions.set(key, Math.max(fileVersions.get(key) ?? 0, data.version));
  return data.content;
}

export async function writeFile(
  project: string,
  path: string,
  content: string,
  init?: { readonly keepalive?: boolean; readonly revision?: number },
): Promise<FileWriteOutcome> {
  const key = fileVersionKey(project, path);
  const baseVersion = fileVersions.get(key) ?? 0;
  const data = await requestJson(
    projectFilesUrl(project, path),
    decodeMutationResponse,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content,
        baseVersion,
        revision: init?.revision ?? 0,
        sessionId: writeSessionId,
      }),
      keepalive: init?.keepalive ?? false,
    },
  );
  if (!data.stale && data.version !== undefined) {
    fileVersions.set(key, Math.max(fileVersions.get(key) ?? 0, data.version));
  }
  return data.stale ? "stale" : "written";
}

export async function deleteFile(project: string, path: string): Promise<void> {
  await requestJson(projectFilesUrl(project, path), decodeMutationResponse, {
    method: "DELETE",
  });
  fileVersions.delete(fileVersionKey(project, path));
}

export async function renameFile(
  project: string,
  from: string,
  to: string,
): Promise<void> {
  await requestJson(
    `/api/projects/${encodeURIComponent(project)}/files/rename`,
    decodeMutationResponse,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from, to }),
    },
  );
  const previousKey = fileVersionKey(project, from);
  const version = fileVersions.get(previousKey);
  fileVersions.delete(previousKey);
  if (version !== undefined) {
    fileVersions.set(fileVersionKey(project, to), version);
  }
}

export async function createFile(project: string, path: string): Promise<void> {
  await writeFile(project, path, "", { revision: 0 });
}

function fileVersionKey(project: string, path: string): string {
  return `${project}\0${path}`;
}

function clearProjectFileVersions(project: string): void {
  const prefix = `${project}\0`;
  for (const key of fileVersions.keys()) {
    if (key.startsWith(prefix)) fileVersions.delete(key);
  }
}

function moveProjectFileVersions(from: string, to: string): void {
  const prefix = `${from}\0`;
  const moved = Array.from(fileVersions.entries()).filter(([key]) =>
    key.startsWith(prefix),
  );
  clearProjectFileVersions(from);
  clearProjectFileVersions(to);
  for (const [key, version] of moved) {
    fileVersions.set(`${to}\0${key.slice(prefix.length)}`, version);
  }
}

function createWriteSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `jgz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function uploadAsset(
  project: string,
  path: string,
  file: File,
): Promise<void> {
  await requestJson(projectAssetsUrl(project, path), decodeMutationResponse, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
}

export async function deleteAsset(
  project: string,
  path: string,
): Promise<void> {
  await requestJson(projectAssetsUrl(project, path), decodeMutationResponse, {
    method: "DELETE",
  });
}

export async function listExamples(): Promise<ExampleSummary[]> {
  return Array.from(
    (await requestJson("/api/examples", decodeExamplesResponse)).examples,
  );
}
