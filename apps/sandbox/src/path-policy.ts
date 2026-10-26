import {
  lstat,
  mkdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

const assetDirectories = new Set(["images", "sounds", "music", "fonts"]);

export class SandboxPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxPathError";
  }
}

export class SandboxNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxNotFoundError";
  }
}

export class SandboxConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxConflictError";
  }
}

export type ResolvedProject = { readonly projectRoot: string };
export type ResolvedFile = { readonly path: string };

export function normalizeSandboxRelativePath(rawPath: string): string {
  if (rawPath.length === 0) {
    throw new SandboxPathError("Path must be non-empty.");
  }
  if (/%(?:00|2e|2f|5c)/i.test(rawPath)) {
    throw new SandboxPathError(
      "Encoded traversal or separators are not allowed.",
    );
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new SandboxPathError("Path must be valid URL encoding.");
  }

  if (
    decoded.includes("\0") ||
    decoded.includes("\\") ||
    decoded.includes("//") ||
    decoded.startsWith("/") ||
    /^[a-z]:[\\/]/i.test(decoded) ||
    isAbsolute(decoded)
  ) {
    throw new SandboxPathError("Path must be a relative forward-slash path.");
  }

  const segments = decoded.split("/");
  for (const segment of segments) {
    if (
      segment.length === 0 ||
      segment === "." ||
      segment === ".." ||
      !/^[A-Za-z0-9._-]+$/.test(segment)
    ) {
      throw new SandboxPathError("Path contains an unsafe segment.");
    }
  }
  return segments.join("/");
}

export function validateProjectName(name: string): string {
  if (!isValidProjectName(name)) {
    throw new SandboxPathError(
      "Project names must be lowercase, start with a letter, and contain only letters, digits, underscores, or hyphens.",
    );
  }
  return name;
}

export function isValidProjectName(name: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}$/.test(name);
}

export function ensureCodeFilePath(safePath: string): void {
  const top = safePath.split("/")[0] ?? "";
  if (assetDirectories.has(top)) {
    throw new SandboxPathError(
      "That folder is for images, sounds, music and fonts. Add those from the bar on the left instead of the code editor.",
    );
  }
}

export function validateAssetPath(path: string): void {
  const directory = path.split("/")[0] ?? "";
  if (!assetDirectories.has(directory)) {
    throw new SandboxPathError(
      "Assets must live under images, sounds, music, or fonts.",
    );
  }
}

export async function ensureProjectsRoot(
  projectsRoot: string,
): Promise<string> {
  await mkdir(projectsRoot, { recursive: true });
  return realpath(projectsRoot);
}

export async function resolveProject(
  projectsRoot: string,
  name: string,
): Promise<ResolvedProject> {
  validateProjectName(name);
  const root = await ensureProjectsRoot(projectsRoot);
  const lexicalProjectRoot = join(root, name);
  ensureInside(lexicalProjectRoot, root);

  let projectStat;
  try {
    projectStat = await lstat(lexicalProjectRoot);
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new SandboxNotFoundError(`Missing project: ${name}`);
    }
    throw error;
  }
  if (projectStat.isSymbolicLink()) {
    throw new SandboxPathError("Project root must not be a symbolic link.");
  }
  if (!projectStat.isDirectory()) {
    throw new SandboxPathError("Project root must be a directory.");
  }

  const realProjectRoot = await realpath(lexicalProjectRoot);
  ensureInside(realProjectRoot, root);
  return { projectRoot: realProjectRoot };
}

export async function resolveProjectFile(
  projectRoot: string,
  safePath: string,
  options: {
    readonly createParent: boolean;
    readonly requireExisting: boolean;
  },
): Promise<ResolvedFile> {
  const root = await realpath(projectRoot);
  const segments = safePath.split("/");
  const fileName = segments.at(-1);
  if (!fileName) throw new SandboxPathError("Path must include a file name.");

  const parent = await resolveParentDirectory(root, segments.slice(0, -1), {
    create: options.createParent,
  });
  const target = join(parent, fileName);
  ensureInside(target, root);
  try {
    const targetStat = await lstat(target);
    if (targetStat.isSymbolicLink()) {
      throw new SandboxPathError("Sandbox paths must not be symbolic links.");
    }
    if (!targetStat.isFile()) {
      throw new SandboxPathError("Sandbox paths must resolve to files.");
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      if (options.requireExisting) {
        throw new SandboxNotFoundError(`Missing file: ${safePath}`);
      }
    } else {
      throw error;
    }
  }
  return { path: target };
}

export async function atomicWriteFile(
  target: string,
  content: string | Uint8Array,
): Promise<void> {
  const parent = dirname(target);
  const temporary = join(
    parent,
    `.${basename(target)}.jgz-tmp-${crypto.randomUUID()}`,
  );
  ensureInside(temporary, parent);
  try {
    await writeFile(temporary, content, { flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function ensureInside(targetPath: string, rootPath: string): void {
  const relation = relative(rootPath, targetPath);
  if (relation !== "" && (relation.startsWith("..") || isAbsolute(relation))) {
    throw new SandboxPathError(
      "Resolved path must stay inside the project root.",
    );
  }
}

export function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function resolveParentDirectory(
  projectRoot: string,
  segments: readonly string[],
  options: { readonly create: boolean },
): Promise<string> {
  let current = projectRoot;
  for (const segment of segments) {
    const next = join(current, segment);
    ensureInside(next, projectRoot);
    try {
      const nextStat = await lstat(next);
      if (nextStat.isSymbolicLink()) {
        throw new SandboxPathError(
          "Sandbox paths must not cross symbolic links.",
        );
      }
      if (!nextStat.isDirectory()) {
        throw new SandboxPathError("Sandbox parent path must be a directory.");
      }
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      if (!options.create) {
        throw new SandboxNotFoundError(`Missing directory: ${segment}`);
      }
      await mkdir(next);
    }
    current = await realpath(next);
    ensureInside(current, projectRoot);
  }
  return current;
}
