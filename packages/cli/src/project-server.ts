import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const assetDirectories = new Set(["images", "sounds", "music", "fonts"]);

export type ProjectServer = {
  readonly origin: string;
  readonly url: string;
  readonly projectRoot: string;
  close(): void;
};

export async function startProjectServer(
  projectDirectory: string,
): Promise<ProjectServer> {
  const projectRoot = await validateProject(projectDirectory);
  const assetRoot = await resolveAssetRoot(projectRoot);
  const token = crypto.randomUUID().replaceAll("-", "");
  const driver = await loadDriverBundle();
  const prefix = `/${token}`;

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      try {
        const url = new URL(request.url);
        if (request.method !== "GET" && request.method !== "HEAD") {
          return response(
            "Method not allowed.",
            405,
            "text/plain; charset=utf-8",
          );
        }
        if (url.pathname === `${prefix}/` || url.pathname === prefix) {
          return response(harnessPage(token), 200, "text/html; charset=utf-8");
        }
        if (url.pathname === `${prefix}/driver.js`) {
          return response(driver, 200, "text/javascript; charset=utf-8");
        }
        if (url.pathname === `${prefix}/source`) {
          return fileResponse(
            await resolveConfinedFile(projectRoot, "main.js"),
          );
        }
        if (url.pathname === `${prefix}/manifest`) {
          return response(
            JSON.stringify({ files: await listAssets(assetRoot) }),
            200,
            "application/json; charset=utf-8",
          );
        }
        if (url.pathname.startsWith(`${prefix}/assets/`)) {
          const raw = url.pathname.slice(`${prefix}/assets/`.length);
          const path = decodeAssetPath(raw);
          return fileResponse(await resolveConfinedFile(assetRoot, path));
        }
        return response("Not found.", 404, "text/plain; charset=utf-8");
      } catch (error) {
        if (error instanceof ResponseError) {
          return response(
            error.message,
            error.status,
            "text/plain; charset=utf-8",
          );
        }
        throw error;
      }
    },
  });

  const origin = `http://127.0.0.1:${server.port}`;
  return {
    origin,
    url: `${origin}${prefix}/`,
    projectRoot,
    close() {
      server.stop(true);
    },
  };
}

export async function validateProject(
  projectDirectory: string,
): Promise<string> {
  const lexical = resolve(projectDirectory);
  let root: string;
  try {
    root = await realpath(lexical);
  } catch {
    throw new Error(`Project directory does not exist: ${lexical}`);
  }
  const info = await stat(root);
  if (!info.isDirectory()) {
    throw new Error(`Project path is not a directory: ${root}`);
  }
  const entry = join(root, "main.js");
  let entryInfo;
  try {
    entryInfo = await lstat(entry);
  } catch {
    throw new Error(`Project must contain main.js: ${root}`);
  }
  if (!entryInfo.isFile() || entryInfo.isSymbolicLink()) {
    throw new Error(
      "main.js must be a regular file, not a directory or symbolic link.",
    );
  }
  return root;
}

export async function listAssets(assetRoot: string): Promise<string[]> {
  const files: string[] = [];
  for (const directory of [...assetDirectories].sort()) {
    const root = join(assetRoot, directory);
    let entries: Dirent[];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    await visitAssets(assetRoot, root, directory, entries, files);
  }
  return files.sort();
}

async function visitAssets(
  assetRoot: string,
  directory: string,
  prefix: string,
  entries: readonly Dirent[],
  files: string[],
): Promise<void> {
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolute = join(directory, entry.name);
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await visitAssets(
        assetRoot,
        absolute,
        path,
        await readdir(absolute, { withFileTypes: true }),
        files,
      );
    } else if (entry.isFile()) {
      ensureInside(absolute, assetRoot);
      files.push(path);
    }
  }
}

export async function resolveConfinedFile(
  assetRoot: string,
  path: string,
): Promise<string> {
  const lexical = join(assetRoot, path);
  ensureInside(lexical, assetRoot);
  let actual: string;
  try {
    actual = await realpath(lexical);
  } catch {
    throw new ResponseError("Asset not found.", 404);
  }
  ensureInside(actual, assetRoot);
  const info = await lstat(actual);
  if (!info.isFile()) throw new ResponseError("Asset not found.", 404);
  return actual;
}

async function resolveAssetRoot(projectRoot: string): Promise<string> {
  for (const directory of assetDirectories) {
    const candidate = join(projectRoot, directory);
    try {
      const info = await lstat(candidate);
      if (!info.isSymbolicLink() && info.isDirectory()) {
        ensureInside(await realpath(candidate), projectRoot);
        return projectRoot;
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  const nested = join(projectRoot, "assets");
  try {
    const info = await lstat(nested);
    if (!info.isSymbolicLink() && info.isDirectory()) {
      const actual = await realpath(nested);
      ensureInside(actual, projectRoot);
      return actual;
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  return projectRoot;
}

function decodeAssetPath(raw: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw new ResponseError("Invalid asset path.", 400);
  }
  if (decoded.includes("\\") || decoded.includes("\0") || isAbsolute(decoded)) {
    throw new ResponseError("Invalid asset path.", 400);
  }
  const segments = decoded.split("/");
  if (
    segments.length < 2 ||
    !assetDirectories.has(segments[0] ?? "") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new ResponseError("Invalid asset path.", 400);
  }
  return segments.join("/");
}

async function fileResponse(path: string): Promise<Response> {
  try {
    const contents = await readFile(path);
    return response(contents, 200, contentType(path));
  } catch (error) {
    if (isMissing(error)) {
      return response("Not found.", 404, "text/plain; charset=utf-8");
    }
    throw error;
  }
}

function response(body: BodyInit, status: number, type: string): Response {
  return new Response(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": type,
      "x-content-type-options": "nosniff",
    },
  });
}

function harnessPage(token: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>js-game-zero CLI</title>
    <link rel="icon" href="data:,">
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { display: grid; place-items: center; background: #150f1c; }
      canvas { display: block; max-width: 100vw; max-height: 100vh; width: auto; height: auto; }
    </style>
  </head>
  <body data-jgz-token="${token}">
    <canvas data-jgz-canvas tabindex="0"></canvas>
    <script type="module" src="/${token}/driver.js"></script>
  </body>
</html>`;
}

async function loadDriverBundle(): Promise<string> {
  const built = resolve(import.meta.dir, "browser/driver.js");
  try {
    return await readFile(built, "utf8");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }

  const source = resolve(import.meta.dir, "../browser/driver.ts");
  const result = await Bun.build({
    entrypoints: [source],
    target: "browser",
    format: "esm",
  });
  const output = result.outputs[0];
  if (!result.success || !output) {
    throw new Error(
      `Failed to build the CLI browser driver: ${result.logs.map((log) => log.message).join("; ")}`,
    );
  }
  return output.text();
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function ensureInside(path: string, root: string): void {
  const relation = relative(root, path);
  if (
    relation !== "" &&
    (relation.startsWith(`..${sep}`) ||
      relation === ".." ||
      isAbsolute(relation))
  ) {
    throw new ResponseError("Path escapes the project directory.", 403);
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

class ResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
