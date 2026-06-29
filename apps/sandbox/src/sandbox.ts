import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

export type SandboxHandlerOptions = {
  readonly projectsRoot?: string;
};

export type SandboxProjectSummary = {
  readonly name: string;
  readonly files: readonly string[];
};

export type SandboxUiStateInput = {
  readonly selectedProject: string | null;
  readonly selectedFile: string | null;
  readonly dirty: boolean;
  readonly diagnostics: readonly { readonly message: string }[];
};

export type SandboxUiState = {
  readonly selectedFileLabel: string;
  readonly dirtyLabel: string;
  readonly playEnabled: boolean;
  readonly saveEnabled: boolean;
  readonly diagnosticsText: string;
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

const assetDirectories = new Set(["images", "sounds", "music", "fonts"]);
const reservedAssetProjectIds = new Set(["phase_three", "phase_five"]);
const defaultStarterSource = `WIDTH = 320;
HEIGHT = 180;
TITLE = "Sandbox Starter";

function draw() {
  screen.fill("#10243d");
  screen.draw.filled_circle([160, 90], 42, "#38bdf8");
  screen.draw.text("js-game-zero", [22, 24], {
    fontsize: 24,
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
      if (url.pathname === "/") return html(sandboxAppPage());

      if (url.pathname === "/api/health") {
        return json({ ok: true, phase: 6 });
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
        return methodNotAllowed();
      }

      const playProject = matchSingleSegmentRoute(rawPath, "/play/");
      if (playProject) {
        if (request.method !== "GET") return methodNotAllowed();
        validateProjectName(playProject);
        await resolveProject(projectsRoot, playProject);
        return html(previewPage(playProject));
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

export function deriveSandboxUiState(
  input: SandboxUiStateInput,
): SandboxUiState {
  const selectedFileLabel = input.selectedFile ?? "No file selected";
  const dirtyLabel = input.dirty ? "Unsaved changes" : "Saved";
  const playEnabled = Boolean(input.selectedProject);
  const saveEnabled = Boolean(
    input.selectedProject && input.selectedFile && input.dirty,
  );
  const diagnosticsText =
    input.diagnostics.length === 0
      ? "No diagnostics"
      : input.diagnostics.map((diagnostic) => diagnostic.message).join("\n");
  return {
    selectedFileLabel,
    dirtyLabel,
    playEnabled,
    saveEnabled,
    diagnosticsText,
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

async function createProjectResponse(
  projectsRoot: string,
  request: Request,
): Promise<Response> {
  const body = await readJsonBody(request);
  const name = typeof body?.name === "string" ? body.name : "";
  const project = await createProject(projectsRoot, name);
  return json({ project }, 201);
}

async function readProjectFileResponse(
  projectsRoot: string,
  route: RouteMatch,
): Promise<Response> {
  const safePath = normalizeSandboxRelativePath(route.path);
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
): Promise<SandboxProjectSummary> {
  validateProjectName(name);
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
  await writeFile(join(projectRoot, "main.js"), defaultStarterSource, "utf8");
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

function sandboxAppPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>js-game-zero Sandbox</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #101417;
        --panel: #151b20;
        --line: #34424d;
        --muted: #98a7b3;
        --text: #eef5f8;
        --accent: #76d1c8;
        --warn: #f6c85f;
        --error: #ff6b6b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      button, input, select, textarea {
        font: inherit;
      }
      button, select, input[type="text"], input[type="file"]::file-selector-button {
        border: 1px solid var(--line);
        border-radius: 6px;
        background: #1c252c;
        color: var(--text);
      }
      button {
        min-height: 34px;
        padding: 0 12px;
        cursor: pointer;
      }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }
      input[type="text"], select {
        min-height: 34px;
        padding: 0 10px;
      }
      .shell {
        width: 100vw;
        min-height: 100vh;
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr) minmax(0, 1fr);
      }
      aside, section {
        min-width: 0;
        overflow: hidden;
        border-right: 1px solid var(--line);
      }
      aside {
        padding: 14px;
        background: #12191e;
      }
      header {
        min-width: 0;
        min-height: 52px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--line);
      }
      h1, h2 {
        margin: 0;
        font-size: 15px;
        font-weight: 650;
        overflow-wrap: anywhere;
      }
      form, .asset-row, .toolbar {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .toolbar {
        flex: 0 0 auto;
      }
      form {
        margin: 12px 0 14px;
      }
      form input {
        width: 100%;
      }
      .project-list, .file-list, .diagnostics {
        display: grid;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .project-list button, .file-list button {
        width: 100%;
        overflow-wrap: anywhere;
        text-align: left;
      }
      .project-list button[aria-pressed="true"],
      .file-list button[aria-pressed="true"] {
        border-color: var(--accent);
        background: #20343a;
      }
      .file-list {
        padding: 12px 14px;
        max-height: 170px;
        overflow: auto;
        border-bottom: 1px solid var(--line);
      }
      .editor-pane {
        display: grid;
        grid-template-rows: auto auto 1fr auto;
      }
      .editor-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 40px;
        padding: 0 14px;
        border-bottom: 1px solid var(--line);
        color: var(--muted);
        font-size: 13px;
      }
      .dirty {
        color: var(--warn);
      }
      textarea {
        width: 100%;
        height: 100%;
        min-height: 360px;
        resize: none;
        border: 0;
        border-bottom: 1px solid var(--line);
        padding: 14px;
        background: #0d1117;
        color: #f4f7f8;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 14px;
        line-height: 1.5;
        outline: none;
      }
      .asset-row {
        padding: 10px 14px;
      }
      .asset-row input {
        min-width: 0;
        flex: 1;
      }
      .preview-pane {
        display: grid;
        grid-template-rows: auto minmax(260px, 1fr) minmax(130px, 190px);
        border-right: 0;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: 0;
        background: #080b0d;
      }
      .diagnostics {
        overflow: auto;
        padding: 10px 14px;
        border-top: 1px solid var(--line);
        background: #11181d;
      }
      .diagnostics li {
        padding: 8px 10px;
        border-left: 3px solid var(--warn);
        background: #182027;
        overflow-wrap: anywhere;
      }
      .diagnostics li[data-severity="error"] {
        border-left-color: var(--error);
      }
      .status {
        margin-top: 10px;
        min-height: 20px;
        color: var(--muted);
        font-size: 13px;
      }
      @media (max-width: 960px) {
        .shell {
          grid-template-columns: 1fr;
        }
        aside, section {
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }
        .preview-pane {
          min-height: 520px;
        }
      }
    </style>
  </head>
  <body data-jgz-dirty="false">
    <main class="shell">
      <aside>
        <h1>js-game-zero Sandbox</h1>
        <form data-jgz-create-form>
          <input data-jgz-project-name type="text" autocomplete="off" placeholder="project_name">
          <button type="submit" data-jgz-create>Create</button>
        </form>
        <ul class="project-list" data-jgz-project-list aria-label="Projects"></ul>
        <p class="status" data-jgz-status></p>
      </aside>
      <section class="editor-pane" aria-label="Editor">
        <header>
          <h2 data-jgz-selected-file>No file selected</h2>
          <div class="toolbar">
            <button type="button" data-jgz-save disabled>Save</button>
            <button type="button" data-jgz-play disabled>Play</button>
          </div>
        </header>
        <ul class="file-list" data-jgz-file-list aria-label="Files"></ul>
        <div class="editor-meta">
          <span data-jgz-dirty-label>Saved</span>
        </div>
        <textarea data-jgz-editor spellcheck="false" disabled></textarea>
        <div class="asset-row">
          <select data-jgz-asset-kind aria-label="Asset type">
            <option value="images">images</option>
            <option value="sounds">sounds</option>
            <option value="music">music</option>
            <option value="fonts">fonts</option>
          </select>
          <input data-jgz-asset-file type="file">
          <button type="button" data-jgz-upload disabled>Upload</button>
        </div>
      </section>
      <section class="preview-pane" aria-label="Preview">
        <header>
          <h2>Preview</h2>
          <span data-jgz-preview-state>Idle</span>
        </header>
        <iframe data-jgz-preview title="Sandbox preview"></iframe>
        <ul class="diagnostics" data-jgz-diagnostics aria-label="Diagnostics"></ul>
      </section>
    </main>
    <script>
      const state = {
        projects: [],
        selectedProject: null,
        selectedFile: null,
        content: "",
        saved: "",
        diagnostics: [],
      };
      const els = {
        form: document.querySelector("[data-jgz-create-form]"),
        projectName: document.querySelector("[data-jgz-project-name]"),
        projectList: document.querySelector("[data-jgz-project-list]"),
        fileList: document.querySelector("[data-jgz-file-list]"),
        selectedFile: document.querySelector("[data-jgz-selected-file]"),
        editor: document.querySelector("[data-jgz-editor]"),
        dirtyLabel: document.querySelector("[data-jgz-dirty-label]"),
        save: document.querySelector("[data-jgz-save]"),
        play: document.querySelector("[data-jgz-play]"),
        preview: document.querySelector("[data-jgz-preview]"),
        previewState: document.querySelector("[data-jgz-preview-state]"),
        diagnostics: document.querySelector("[data-jgz-diagnostics]"),
        status: document.querySelector("[data-jgz-status]"),
        assetKind: document.querySelector("[data-jgz-asset-kind]"),
        assetFile: document.querySelector("[data-jgz-asset-file]"),
        upload: document.querySelector("[data-jgz-upload]"),
      };

      function apiPath(project, kind, path) {
        const encodedProject = encodeURIComponent(project);
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        return "/api/projects/" + encodedProject + "/" + kind + "/" + encodedPath;
      }

      async function requestJson(url, options) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || response.statusText);
        }
        return data;
      }

      function selectedProject() {
        return state.projects.find((project) => project.name === state.selectedProject) || null;
      }

      function isDirty() {
        return state.content !== state.saved;
      }

      function setStatus(message) {
        els.status.textContent = message || "";
      }

      function render() {
        const dirty = isDirty();
        document.body.dataset.jgzDirty = String(dirty);
        els.selectedFile.textContent = state.selectedFile || "No file selected";
        els.dirtyLabel.textContent = dirty ? "Unsaved changes" : "Saved";
        els.dirtyLabel.className = dirty ? "dirty" : "";
        els.editor.disabled = !state.selectedProject || !state.selectedFile;
        els.editor.value = state.content;
        els.save.disabled = !state.selectedProject || !state.selectedFile || !dirty;
        els.play.disabled = !state.selectedProject;
        els.upload.disabled = !state.selectedProject || !els.assetFile.files.length;

        els.projectList.replaceChildren(
          ...state.projects.map((project) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = project.name;
            button.dataset.jgzProject = project.name;
            button.setAttribute("aria-pressed", String(project.name === state.selectedProject));
            button.addEventListener("click", () => selectProject(project.name));
            const item = document.createElement("li");
            item.append(button);
            return item;
          }),
        );

        const files = selectedProject()?.files || [];
        els.fileList.replaceChildren(
          ...files.map((file) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = file;
            button.dataset.jgzFile = file;
            button.setAttribute("aria-pressed", String(file === state.selectedFile));
            button.addEventListener("click", () => loadFile(file));
            const item = document.createElement("li");
            item.append(button);
            return item;
          }),
        );

        if (state.diagnostics.length === 0) {
          const item = document.createElement("li");
          item.textContent = "No diagnostics";
          item.dataset.severity = "info";
          els.diagnostics.replaceChildren(item);
        } else {
          els.diagnostics.replaceChildren(
            ...state.diagnostics.map((diagnostic) => {
              const item = document.createElement("li");
              item.dataset.severity = diagnostic.severity || "warning";
              item.textContent = diagnostic.message || String(diagnostic);
              return item;
            }),
          );
        }
        els.diagnostics.dataset.count = String(state.diagnostics.length);
      }

      async function loadProjects() {
        const data = await requestJson("/api/projects");
        state.projects = data.projects || [];
        const lastProject = localStorage.getItem("jgz-sandbox:last-project");
        const nextProject =
          state.projects.find((project) => project.name === lastProject)?.name ||
          state.projects[0]?.name ||
          null;
        render();
        if (nextProject) {
          await selectProject(nextProject);
        }
      }

      async function selectProject(name) {
        state.selectedProject = name;
        localStorage.setItem("jgz-sandbox:last-project", name);
        state.diagnostics = [];
        const project = selectedProject();
        const file = project?.files.includes("main.js") ? "main.js" : project?.files[0];
        render();
        if (file) await loadFile(file);
      }

      async function loadFile(path) {
        if (!state.selectedProject) return;
        const data = await requestJson(apiPath(state.selectedProject, "files", path));
        state.selectedFile = data.path;
        state.content = data.content;
        state.saved = data.content;
        render();
      }

      async function saveFile() {
        if (!state.selectedProject || !state.selectedFile) return;
        await requestJson(apiPath(state.selectedProject, "files", state.selectedFile), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: state.content }),
        });
        state.saved = state.content;
        await refreshProjectList();
        render();
      }

      async function refreshProjectList() {
        const data = await requestJson("/api/projects");
        state.projects = data.projects || [];
      }

      async function play() {
        if (!state.selectedProject) return;
        if (isDirty()) await saveFile();
        state.diagnostics = [];
        els.previewState.textContent = "Running";
        render();
        els.preview.src = "/play/" + encodeURIComponent(state.selectedProject) + "?v=" + Date.now();
      }

      async function uploadAsset() {
        if (!state.selectedProject || !els.assetFile.files.length) return;
        const file = els.assetFile.files[0];
        const assetPath = els.assetKind.value + "/" + file.name;
        await fetch(apiPath(state.selectedProject, "assets", assetPath), {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        }).then(async (response) => {
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || response.statusText);
          }
        });
        await refreshProjectList();
        els.assetFile.value = "";
        render();
      }

      els.form.addEventListener("submit", (event) => {
        event.preventDefault();
        void (async () => {
          try {
            const name = els.projectName.value.trim();
            const data = await requestJson("/api/projects", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name }),
            });
            await refreshProjectList();
            els.projectName.value = "";
            setStatus("");
            await selectProject(data.project.name);
          } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error));
          }
        })();
      });

      els.editor.addEventListener("input", () => {
        state.content = els.editor.value;
        render();
      });
      els.save.addEventListener("click", () => {
        void saveFile().catch((error) => setStatus(error.message));
      });
      els.play.addEventListener("click", () => {
        void play().catch((error) => setStatus(error.message));
      });
      els.assetFile.addEventListener("change", render);
      els.upload.addEventListener("click", () => {
        void uploadAsset().catch((error) => setStatus(error.message));
      });

      window.addEventListener("message", (event) => {
        const message = event.data;
        if (!message || message.source !== "jgz-sandbox-preview") return;
        if (message.project !== state.selectedProject) return;
        if (message.type === "diagnostic") {
          state.diagnostics.push(message.diagnostic);
        }
        if (message.type === "runtime-error") {
          state.diagnostics.push({
            severity: "error",
            message: message.message,
          });
        }
        if (message.type === "status") {
          els.previewState.textContent = message.status?.nonblank ? "Running" : "Loaded";
        }
        render();
      });

      void loadProjects().catch((error) => setStatus(error.message));
    </script>
  </body>
</html>`;
}

function previewPage(project: string): string {
  const encodedProject = encodeURIComponent(project);
  const entry = "main.js";
  const entryUrl = `/api/projects/${encodedProject}/files/${entry}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>js-game-zero Preview: ${escapeHtml(project)}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #080b0d;
      }
      canvas {
        width: min(100vw, 800px);
        height: auto;
        background: #0d1117;
      }
    </style>
  </head>
  <body data-jgz-project="${escapeHtml(project)}" data-jgz-entry="${entry}">
    <canvas data-jgz-preview-canvas tabindex="0"></canvas>
    <script type="module">
      import { run } from "/runtime/core.js";

      const project = ${JSON.stringify(project)};
      const entry = ${JSON.stringify(entry)};
      const entryUrl = ${JSON.stringify(entryUrl)};
      const canvas = document.querySelector("[data-jgz-preview-canvas]");
      const state = {
        project,
        entry,
        ready: false,
        nonblank: false,
        frames: 0,
        diagnostics: [],
        errors: [],
      };
      window.__jgzSandboxPreviewStatus = state;

      function post(type, payload) {
        window.parent.postMessage({
          source: "jgz-sandbox-preview",
          project,
          type,
          ...payload,
        }, window.location.origin);
      }

      function messageOf(error) {
        return error instanceof Error ? error.message : String(error);
      }

      window.addEventListener("error", (event) => {
        const message = messageOf(event.error || event.message);
        state.errors.push(message);
        post("runtime-error", { message });
      });
      window.addEventListener("unhandledrejection", (event) => {
        const message = messageOf(event.reason);
        state.errors.push(message);
        post("runtime-error", { message });
      });

      function canvasIsNonblank() {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return false;
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < data.length; index += 4) {
          if (data[index] !== 0) return true;
        }
        return false;
      }

      function tick() {
        state.frames += 1;
        state.nonblank = canvasIsNonblank();
        state.ready = true;
        post("status", { status: state });
        requestAnimationFrame(tick);
      }

      try {
        const response = await fetch(entryUrl);
        if (!response.ok) throw new Error("Failed to load " + entry);
        const source = (await response.json()).content;
        run(source, {
          canvas,
          projectId: project,
          assetBaseUrl: "/assets",
          diagnostics(diagnostic) {
            state.diagnostics.push(diagnostic);
            post("diagnostic", { diagnostic });
          },
        });
      } catch (error) {
        const message = messageOf(error);
        state.errors.push(message);
        post("runtime-error", { message });
      }
      requestAnimationFrame(tick);
    </script>
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
