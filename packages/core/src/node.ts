import {
  normalizeSandboxStoragePath,
  sandboxStoragePath,
} from "./storage-path";
import { type StorageAdapter } from "./storage";

export type SandboxFileStorageAdapterOptions = {
  readonly projectRoot: string;
  readonly path?: string;
  readonly readText?: (path: string) => Promise<string | null> | string | null;
  readonly writeText?: (path: string, text: string) => Promise<void> | void;
};

/**
 * Creates a Node.js filesystem-backed adapter for a sandbox project.
 *
 * This lives behind the `@js-game-zero/core/node` entry point so browser
 * consumers never load or bundle Node built-ins.
 */
export function createSandboxFileStorageAdapter(
  options: SandboxFileStorageAdapterOptions,
): StorageAdapter {
  const safePath = normalizeSandboxStoragePath(options.path ?? "storage.json");
  const path = sandboxStoragePath(options.projectRoot, safePath);
  return {
    path,
    async load() {
      if (options.readText) return options.readText(path);
      return readSandboxText(options.projectRoot, safePath);
    },
    async save(text) {
      if (options.writeText) {
        await options.writeText(path, text);
        return;
      }
      await writeSandboxText(options.projectRoot, safePath, text);
    },
  };
}

async function readSandboxText(
  projectRoot: string,
  safePath: string,
): Promise<string | null> {
  const resolved = await resolveSandboxFilePath(projectRoot, safePath, false);
  if (!resolved) return null;
  try {
    return await resolved.fs.readFile(resolved.targetPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

async function writeSandboxText(
  projectRoot: string,
  safePath: string,
  text: string,
): Promise<void> {
  const resolved = await resolveSandboxFilePath(projectRoot, safePath, true);
  if (!resolved) return;
  const tempPath = resolved.path.join(
    resolved.parentPath,
    `.jgz-storage-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
  );
  try {
    await resolved.fs.writeFile(tempPath, text, "utf8");
    await resolved.fs.rename(tempPath, resolved.targetPath);
  } catch (error) {
    await resolved.fs.rm(tempPath, { force: true });
    throw error;
  }
}

async function resolveSandboxFilePath(
  projectRoot: string,
  safePath: string,
  createParent: boolean,
): Promise<{
  readonly fs: typeof import("node:fs/promises");
  readonly path: typeof import("node:path");
  readonly parentPath: string;
  readonly targetPath: string;
} | null> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const rootPath = path.resolve(projectRoot);
  const realRoot = await fs.realpath(rootPath);
  const lexicalTarget = path.join(realRoot, safePath);
  const lexicalParent = path.dirname(lexicalTarget);
  if (createParent) {
    await fs.mkdir(lexicalParent, { recursive: true });
  }

  let parentPath: string;
  try {
    parentPath = await fs.realpath(lexicalParent);
  } catch (error) {
    if (!createParent && isMissingFileError(error)) return null;
    throw error;
  }

  if (!isPathInside(parentPath, realRoot, path)) {
    throw new TypeError("sandbox storage path must stay inside project root.");
  }

  const targetPath = path.join(parentPath, path.basename(lexicalTarget));
  if (!isPathInside(targetPath, realRoot, path)) {
    throw new TypeError("sandbox storage path must stay inside project root.");
  }

  try {
    const stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink()) {
      throw new TypeError("sandbox storage path must not be a symbolic link.");
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }

  return { fs, path, parentPath, targetPath };
}

function isPathInside(
  targetPath: string,
  rootPath: string,
  path: typeof import("node:path"),
): boolean {
  const relative = path.relative(rootPath, targetPath);
  return (
    relative === "" ||
    (relative.length > 0 &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative))
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
