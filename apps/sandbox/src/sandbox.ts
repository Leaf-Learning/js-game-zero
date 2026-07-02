import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { exampleManifest, getExample } from "../../../examples/manifest";

export type SandboxHandlerOptions = {
  readonly projectsRoot?: string;
};

export type SandboxProjectSummary = {
  readonly name: string;
  readonly files: readonly string[];
};

export type SandboxExampleSummary = {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly expectsInput: "keyboard" | "mouse" | "none";
};

type RouteMatch = {
  readonly project: string;
  readonly path: string;
};

type ResolvedProject = {
  readonly projectRoot: string;
};

type ResolvedFile = {
  readonly path: string;
};

export const REPO_ROOT = resolve(import.meta.dir, "../../..");
const CLIENT_DIR = join(REPO_ROOT, "apps/sandbox/client");

const assetDirectories = new Set(["images", "sounds", "music", "fonts"]);
const reservedAssetProjectIds = new Set(["phase_three", "phase_five"]);
const defaultStarterSource = `WIDTH = 320;
HEIGHT = 180;
TITLE = "My Game";

let x = 60;
let y = 90;
const speed = 140;

function update(dt) {
  if (keyboard.right) x += speed * dt;
  if (keyboard.left) x -= speed * dt;
  if (keyboard.up) y -= speed * dt;
  if (keyboard.down) y += speed * dt;
  x = Math.max(20, Math.min(WIDTH - 20, x));
  y = Math.max(20, Math.min(HEIGHT - 20, y));
}

function draw() {
  screen.fill("#132436");
  screen.draw.filled_circle([x, y], 20, "#7dd8c6");
  screen.draw.text("Use the arrow keys!", [20, 20], {
    fontsize: 16,
    color: "#ffffff",
  });
}
`;

export class SandboxPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxPathError";
  }
}

class SandboxNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxNotFoundError";
  }
}

class SandboxConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxConflictError";
  }
}

type CachedBuild = { readonly text: string; readonly contentType: string };
const buildCache = new Map<string, Promise<CachedBuild>>();

/**
 * Bundle a browser entrypoint once per process and cache the result. This
 * fixes two defects in how the sandbox served JavaScript: entrypoints were
 * resolved relative to the process cwd (breaking when the server is started
 * from anywhere but the repo root), and every request re-ran a full
 * `Bun.build`.
 */
export async function cachedBrowserBuild(
  key: string,
  entrypoint: string,
): Promise<CachedBuild> {
  const existing = buildCache.get(key);
  if (existing) return existing;
  const pending = (async (): Promise<CachedBuild> => {
    const result = await Bun.build({
      entrypoints: [entrypoint],
      target: "browser",
      format: "esm",
    });
    const output = result.outputs[0];
    if (!result.success || !output) {
      const details = result.logs.map((log) => log.message).join("; ");
      throw new Error(
        `Failed to build ${key}: ${details || "unknown build error"}`,
      );
    }
    return {
      text: await output.text(),
      contentType: "text/javascript; charset=utf-8",
    };
  })();
  buildCache.set(key, pending);
  pending.catch(() => buildCache.delete(key));
  return pending;
}

export function createSandboxHandler(
  options: SandboxHandlerOptions = {},
): (request: Request) => Promise<Response | null> {
  const projectsRoot = resolve(options.projectsRoot ?? ".jgz-projects");

  return async function sandboxHandler(
    request: Request,
  ): Promise<Response | null> {
    const rawPath = rawPathname(request.url);
    const url = new URL(request.url);

    try {
      if (url.pathname === "/" && request.method === "GET") {
        return new Response(Bun.file(join(CLIENT_DIR, "index.html")), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      if (url.pathname === "/client/app.css" && request.method === "GET") {
        return new Response(Bun.file(join(CLIENT_DIR, "style.css")), {
          headers: { "content-type": "text/css; charset=utf-8" },
        });
      }

      if (url.pathname === "/client/app.js" && request.method === "GET") {
        const build = await cachedBrowserBuild(
          "client-app",
          join(CLIENT_DIR, "main.ts"),
        );
        return new Response(build.text, {
          headers: { "content-type": build.contentType },
        });
      }

      if (url.pathname === "/client/preview.js" && request.method === "GET") {
        const build = await cachedBrowserBuild(
          "client-preview",
          join(CLIENT_DIR, "preview-entry.ts"),
        );
        return new Response(build.text, {
          headers: { "content-type": build.contentType },
        });
      }

      if (url.pathname === "/api/health") {
        return json({ ok: true, phase: 6 });
      }

      if (url.pathname === "/api/examples") {
        if (request.method !== "GET") return methodNotAllowed();
        return json({ examples: cloneableExamples() });
      }

      if (url.pathname === "/api/projects") {
        if (request.method === "GET") {
          return json({ projects: await listProjects(projectsRoot) });
        }
        if (request.method === "POST") {
          return await createProjectResponse(projectsRoot, request);
        }
        return methodNotAllowed();
      }

      const renameProjectRoute = matchProjectSubRoute(rawPath, "rename");
      if (renameProjectRoute) {
        if (request.method !== "POST") return methodNotAllowed();
        return await renameProjectResponse(
          projectsRoot,
          renameProjectRoute,
          request,
        );
      }

      const renameFileRoute = matchProjectSubRoute(rawPath, "files/rename");
      if (renameFileRoute) {
        if (request.method !== "POST") return methodNotAllowed();
        return await renameProjectFileResponse(
          projectsRoot,
          renameFileRoute,
          request,
        );
      }

      const singleProjectRoute = matchSingleSegmentRoute(
        rawPath,
        "/api/projects/",
      );
      if (singleProjectRoute) {
        if (request.method === "GET") {
          const project = await summarizeProject(
            await ensureProjectsRoot(projectsRoot),
            singleProjectRoute,
          );
          return json({ project });
        }
        if (request.method === "DELETE") {
          return await deleteProjectResponse(projectsRoot, singleProjectRoute);
        }
        return methodNotAllowed();
      }

      const fileRoute = matchProjectPathRoute(
        rawPath,
        "/api/projects/",
        "/files/",
      );
      if (fileRoute) {
        if (request.method === "GET") {
          return await readProjectFileResponse(projectsRoot, fileRoute);
        }
        if (request.method === "PUT") {
          return await writeProjectFileResponse(
            projectsRoot,
            fileRoute,
            request,
          );
        }
        if (request.method === "DELETE") {
          return await deleteProjectFileResponse(projectsRoot, fileRoute);
        }
        return methodNotAllowed();
      }

      const assetRoute = matchProjectPathRoute(
        rawPath,
        "/api/projects/",
        "/assets/",
      );
      if (assetRoute) {
        if (request.method === "PUT") {
          return await writeProjectAssetResponse(
            projectsRoot,
            assetRoute,
            request,
          );
        }
        if (request.method === "DELETE") {
          return await deleteProjectAssetResponse(projectsRoot, assetRoute);
        }
        return methodNotAllowed();
      }

      const playProject = matchSingleSegmentRoute(rawPath, "/play/");
      if (playProject) {
        if (request.method !== "GET") return methodNotAllowed();
        validateProjectName(playProject);
        await resolveProject(projectsRoot, playProject);
        return html(previewShellPage(playProject));
      }

      const assetReadRoute = matchProjectPathRoute(rawPath, "/assets/", "/");
      if (
        assetReadRoute &&
        !reservedAssetProjectIds.has(assetReadRoute.project)
      ) {
        if (request.method !== "GET") return methodNotAllowed();
        return await readProjectAssetResponse(projectsRoot, assetReadRoute);
      }
    } catch (error) {
      return errorResponse(error);
    }

    return null;
  };
}

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

function cloneableExamples(): readonly SandboxExampleSummary[] {
  return exampleManifest
    .filter((example) => example.mode === "global")
    .map((example) => ({
      slug: example.slug,
      title: example.title,
      description: capitalize(example.e2eScenario),
      expectsInput: example.expectsInput,
    }));
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
}

/** Code files (main.js, etc.) may never be read or written as raw asset
 * bytes and vice versa: this is the server-side half of the "never open
 * binary assets as text" fix (the client-side half keeps assets in their
 * own panel and never routes them through the code editor). */
function ensureCodeFilePath(safePath: string): void {
  const top = safePath.split("/")[0] ?? "";
  if (assetDirectories.has(top)) {
    throw new SandboxPathError(
      "That file lives in an asset folder. Use the Assets panel to manage it instead of the code editor.",
    );
  }
}

async function createProjectResponse(
  projectsRoot: string,
  request: Request,
): Promise<Response> {
  const body = await readJsonBody(request);
  const name = typeof body?.name === "string" ? body.name : "";
  const exampleSlug =
    typeof body?.exampleSlug === "string" ? body.exampleSlug : undefined;
  const project = await createProject(projectsRoot, name, exampleSlug);
  return json({ project }, 201);
}

async function deleteProjectResponse(
  projectsRoot: string,
  name: string,
): Promise<Response> {
  const project = await resolveProject(projectsRoot, name);
  await rm(project.projectRoot, { recursive: true, force: true });
  return json({ ok: true, project: name });
}

async function renameProjectResponse(
  projectsRoot: string,
  name: string,
  request: Request,
): Promise<Response> {
  const body = await readJsonBody(request);
  const nextName = typeof body?.name === "string" ? body.name : "";
  validateProjectName(nextName);
  const project = await resolveProject(projectsRoot, name);
  const root = await ensureProjectsRoot(projectsRoot);
  if (nextName === name) {
    return json({ project: await summarizeProject(root, name) });
  }
  const nextRoot = join(root, nextName);
  ensureInside(nextRoot, root);
  try {
    await lstat(nextRoot);
    throw new SandboxConflictError(`Project already exists: ${nextName}`);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  await rename(project.projectRoot, nextRoot);
  return json({ project: await summarizeProject(root, nextName) });
}

async function readProjectFileResponse(
  projectsRoot: string,
  route: RouteMatch,
): Promise<Response> {
  const safePath = normalizeSandboxRelativePath(route.path);
  ensureCodeFilePath(safePath);
  const project = await resolveProject(projectsRoot, route.project);
  const resolved = await resolveProjectFile(project.projectRoot, safePath, {
    createParent: false,
    requireExisting: true,
  });
  const content = await readFile(resolved.path, "utf8");
  return json({ project: route.project, path: safePath, content });
}

async function writeProjectFileResponse(
  projectsRoot: string,
  route: RouteMatch,
  request: Request,
): Promise<Response> {
  const safePath = normalizeSandboxRelativePath(route.path);
  ensureCodeFilePath(safePath);
  const body = await readJsonBody(request);
  if (typeof body?.content !== "string") {
    return json({ error: "File writes require a string content field." }, 400);
  }
  const project = await resolveProject(projectsRoot, route.project);
  const resolved = await resolveProjectFile(project.projectRoot, safePath, {
    createParent: true,
    requireExisting: false,
  });
  await writeFile(resolved.path, body.content, "utf8");
  return json({ ok: true, project: route.project, path: safePath });
}

async function deleteProjectFileResponse(
  projectsRoot: string,
  route: RouteMatch,
): Promise<Response> {
  const safePath = normalizeSandboxRelativePath(route.path);
  ensureCodeFilePath(safePath);
  const project = await resolveProject(projectsRoot, route.project);
  const resolved = await resolveProjectFile(project.projectRoot, safePath, {
    createParent: false,
    requireExisting: true,
  });
  await rm(resolved.path);
  return json({ ok: true, project: route.project, path: safePath });
}

async function renameProjectFileResponse(
  projectsRoot: string,
  projectName: string,
  request: Request,
): Promise<Response> {
  const body = await readJsonBody(request);
  const from = typeof body?.from === "string" ? body.from : "";
  const to = typeof body?.to === "string" ? body.to : "";
  const safeFrom = normalizeSandboxRelativePath(from);
  const safeTo = normalizeSandboxRelativePath(to);
  ensureCodeFilePath(safeFrom);
  ensureCodeFilePath(safeTo);
  const project = await resolveProject(projectsRoot, projectName);
  const source = await resolveProjectFile(project.projectRoot, safeFrom, {
    createParent: false,
    requireExisting: true,
  });
  const destination = await resolveProjectFile(project.projectRoot, safeTo, {
    createParent: true,
    requireExisting: false,
  });
  if (safeFrom !== safeTo) {
    try {
      await lstat(destination.path);
      throw new SandboxConflictError(`File already exists: ${safeTo}`);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
  }
  await rename(source.path, destination.path);
  return json({ ok: true, project: projectName, from: safeFrom, to: safeTo });
}

async function writeProjectAssetResponse(
  projectsRoot: string,
  route: RouteMatch,
  request: Request,
): Promise<Response> {
  const safePath = normalizeSandboxRelativePath(route.path);
  validateAssetPath(safePath);
  const project = await resolveProject(projectsRoot, route.project);
  const resolved = await resolveProjectFile(project.projectRoot, safePath, {
    createParent: true,
    requireExisting: false,
  });
  const bytes = new Uint8Array(await request.arrayBuffer());
  await writeFile(resolved.path, bytes);
  return json({
    ok: true,
    project: route.project,
    path: safePath,
    bytes: bytes.byteLength,
  });
}

async function deleteProjectAssetResponse(
  projectsRoot: string,
  route: RouteMatch,
): Promise<Response> {
  const safePath = normalizeSandboxRelativePath(route.path);
  validateAssetPath(safePath);
  const project = await resolveProject(projectsRoot, route.project);
  const resolved = await resolveProjectFile(project.projectRoot, safePath, {
    createParent: false,
    requireExisting: true,
  });
  await rm(resolved.path);
  return json({ ok: true, project: route.project, path: safePath });
}

async function readProjectAssetResponse(
  projectsRoot: string,
  route: RouteMatch,
): Promise<Response> {
  const safePath = normalizeSandboxRelativePath(route.path);
  validateAssetPath(safePath);
  const project = await resolveProject(projectsRoot, route.project);
  const resolved = await resolveProjectFile(project.projectRoot, safePath, {
    createParent: false,
    requireExisting: true,
  });
  return new Response(await readFile(resolved.path), {
    headers: { "content-type": contentType(resolved.path) },
  });
}

async function createProject(
  projectsRoot: string,
  name: string,
  exampleSlug: string | undefined,
): Promise<SandboxProjectSummary> {
  validateProjectName(name);
  const example =
    exampleSlug === undefined ? undefined : getExample(exampleSlug);
  if (exampleSlug !== undefined && (!example || example.mode !== "global")) {
    throw new SandboxPathError(`Unknown starter example: ${exampleSlug}`);
  }

  const root = await ensureProjectsRoot(projectsRoot);
  const projectRoot = join(root, name);
  ensureInside(projectRoot, root);

  try {
    const existing = await lstat(projectRoot);
    if (existing.isSymbolicLink()) {
      throw new SandboxPathError("Project root must not be a symbolic link.");
    }
    throw new SandboxConflictError(`Project already exists: ${name}`);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }

  await mkdir(projectRoot);
  await mkdir(join(projectRoot, "images"));
  await mkdir(join(projectRoot, "sounds"));
  await mkdir(join(projectRoot, "music"));
  await mkdir(join(projectRoot, "fonts"));

  if (example) {
    const source = await readFile(join(REPO_ROOT, example.entryPoint), "utf8");
    await writeFile(join(projectRoot, "main.js"), source, "utf8");
    for (const asset of example.assets) {
      const from = join(REPO_ROOT, "examples/phase-five/assets", asset);
      const to = join(projectRoot, asset);
      await mkdir(dirname(to), { recursive: true });
      await copyFile(from, to);
    }
  } else {
    await writeFile(join(projectRoot, "main.js"), defaultStarterSource, "utf8");
  }

  return summarizeProject(root, name);
}

async function listProjects(
  projectsRoot: string,
): Promise<SandboxProjectSummary[]> {
  const root = await ensureProjectsRoot(projectsRoot);
  const entries = await readdir(root, { withFileTypes: true });
  const projects: SandboxProjectSummary[] = [];
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      !isValidProjectName(entry.name)
    ) {
      continue;
    }
    projects.push(await summarizeProject(root, entry.name));
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

async function summarizeProject(
  projectsRoot: string,
  name: string,
): Promise<SandboxProjectSummary> {
  const project = await resolveProject(projectsRoot, name);
  return {
    name,
    files: await listProjectFiles(project.projectRoot),
  };
}

async function listProjectFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string, prefix: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const entryPath = join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(entryPath, relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  await visit(projectRoot, "");
  return files.sort();
}

async function resolveProject(
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

async function resolveProjectFile(
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

async function ensureProjectsRoot(projectsRoot: string): Promise<string> {
  await mkdir(projectsRoot, { recursive: true });
  return realpath(projectsRoot);
}

function validateProjectName(name: string): string {
  if (!isValidProjectName(name)) {
    throw new SandboxPathError(
      "Project names must be lowercase, start with a letter, and contain only letters, digits, underscores, or hyphens.",
    );
  }
  return name;
}

function isValidProjectName(name: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}$/.test(name);
}

function validateAssetPath(path: string): void {
  const directory = path.split("/")[0] ?? "";
  if (!assetDirectories.has(directory)) {
    throw new SandboxPathError(
      "Assets must live under images, sounds, music, or fonts.",
    );
  }
}

function matchProjectPathRoute(
  rawPath: string,
  prefix: string,
  separator: string,
): RouteMatch | null {
  if (!rawPath.startsWith(prefix)) return null;
  const rest = rawPath.slice(prefix.length);
  const separatorIndex = rest.indexOf(separator);
  if (separatorIndex <= 0) return null;
  const rawProject = rest.slice(0, separatorIndex);
  const rawSubpath = rest.slice(separatorIndex + separator.length);
  if (rawSubpath.length === 0) return null;
  const project = decodeRouteSegment(rawProject);
  validateProjectName(project);
  return { project, path: rawSubpath };
}

function matchSingleSegmentRoute(
  rawPath: string,
  prefix: string,
): string | null {
  if (!rawPath.startsWith(prefix)) return null;
  const rawSegment = rawPath.slice(prefix.length);
  if (rawSegment.length === 0 || rawSegment.includes("/")) return null;
  return decodeRouteSegment(rawSegment);
}

/** Matches `/api/projects/<project>/<suffix>` exactly, e.g. suffix
 * `"rename"` or `"files/rename"`, used for action-style routes whose
 * arguments live in the JSON body rather than the path. */
function matchProjectSubRoute(rawPath: string, suffix: string): string | null {
  const prefix = "/api/projects/";
  if (!rawPath.startsWith(prefix)) return null;
  const rest = rawPath.slice(prefix.length);
  const tail = `/${suffix}`;
  if (!rest.endsWith(tail)) return null;
  const rawProject = rest.slice(0, rest.length - tail.length);
  if (rawProject.length === 0 || rawProject.includes("/")) return null;
  const project = decodeRouteSegment(rawProject);
  validateProjectName(project);
  return project;
}

function decodeRouteSegment(rawSegment: string): string {
  if (/%(?:00|2f|5c)/i.test(rawSegment)) {
    throw new SandboxPathError(
      "Route segment must not include encoded separators.",
    );
  }
  try {
    return decodeURIComponent(rawSegment);
  } catch {
    throw new SandboxPathError("Route segment must be valid URL encoding.");
  }
}

function rawPathname(requestUrl: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i.exec(requestUrl);
  return match?.[1] && match[1].length > 0
    ? match[1]
    : new URL(requestUrl).pathname;
}

async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function previewShellPage(project: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>js-game-zero Preview: ${escapeHtml(project)}</title>
    <link rel="icon" href="data:,">
    <style>
      html, body {
        margin: 0;
        height: 100%;
        background: #150f1c;
      }
      canvas {
        display: block;
        width: 100%;
        height: 100%;
        background: #150f1c;
      }
    </style>
  </head>
  <body data-jgz-project="${escapeHtml(project)}" data-jgz-entry="main.js">
    <canvas data-jgz-preview-canvas tabindex="0"></canvas>
    <script type="module" src="/client/preview.js"></script>
  </body>
</html>`;
}

function html(source: string): Response {
  return new Response(source, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function methodNotAllowed(): Response {
  return json({ error: "Method not allowed." }, 405);
}

function errorResponse(error: unknown): Response {
  if (error instanceof SandboxPathError) {
    return json({ error: error.message }, 400);
  }
  if (error instanceof SandboxNotFoundError) {
    return json({ error: error.message }, 404);
  }
  if (error instanceof SandboxConflictError) {
    return json({ error: error.message }, 409);
  }
  return json(
    {
      error: error instanceof Error ? error.message : String(error),
    },
    500,
  );
}

function contentType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".ts") return "text/typescript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".md") return "text/markdown; charset=utf-8";
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".gif") return "image/gif";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".ogg") return "audio/ogg";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".woff") return "font/woff";
  if (extension === ".woff2") return "font/woff2";
  return "application/octet-stream";
}

function ensureInside(targetPath: string, rootPath: string): void {
  const relation = relative(rootPath, targetPath);
  if (relation !== "" && (relation.startsWith("..") || isAbsolute(relation))) {
    throw new SandboxPathError(
      "Resolved path must stay inside the project root.",
    );
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
