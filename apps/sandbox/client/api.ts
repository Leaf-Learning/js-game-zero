import type { ExampleSummary, ProjectSummary } from "./types";

export class ApiError extends Error {}

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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof (data as { error?: unknown })?.error === "string"
        ? (data as { error: string }).error
        : response.statusText || "Something went wrong.";
    throw new ApiError(message);
  }
  return data as T;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const data = await requestJson<{ projects: ProjectSummary[] }>(
    "/api/projects",
  );
  return data.projects;
}

export async function createProject(
  name: string,
  exampleSlug?: string,
): Promise<ProjectSummary> {
  const data = await requestJson<{ project: ProjectSummary }>("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(exampleSlug ? { name, exampleSlug } : { name }),
  });
  return data.project;
}

export async function deleteProject(name: string): Promise<void> {
  await requestJson(`/api/projects/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export async function renameProject(
  name: string,
  nextName: string,
): Promise<ProjectSummary> {
  const data = await requestJson<{ project: ProjectSummary }>(
    `/api/projects/${encodeURIComponent(name)}/rename`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    },
  );
  return data.project;
}

export async function readFile(project: string, path: string): Promise<string> {
  const data = await requestJson<{ content: string }>(
    projectFilesUrl(project, path),
  );
  return data.content;
}

export async function writeFile(
  project: string,
  path: string,
  content: string,
  init?: { readonly keepalive?: boolean },
): Promise<void> {
  await fetch(projectFilesUrl(project, path), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
    keepalive: init?.keepalive ?? false,
  });
}

export async function deleteFile(project: string, path: string): Promise<void> {
  await requestJson(projectFilesUrl(project, path), { method: "DELETE" });
}

export async function renameFile(
  project: string,
  from: string,
  to: string,
): Promise<void> {
  await requestJson(
    `/api/projects/${encodeURIComponent(project)}/files/rename`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from, to }),
    },
  );
}

export async function createFile(project: string, path: string): Promise<void> {
  await requestJson(projectFilesUrl(project, path), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "" }),
  });
}

export async function uploadAsset(
  project: string,
  path: string,
  file: File,
): Promise<void> {
  const response = await fetch(projectAssetsUrl(project, path), {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof data.error === "string" ? data.error : "Upload failed.",
    );
  }
}

export async function deleteAsset(
  project: string,
  path: string,
): Promise<void> {
  await requestJson(projectAssetsUrl(project, path), { method: "DELETE" });
}

export async function listExamples(): Promise<ExampleSummary[]> {
  const data = await requestJson<{ examples: ExampleSummary[] }>(
    "/api/examples",
  );
  return data.examples;
}
