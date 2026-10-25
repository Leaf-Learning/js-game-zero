import { extname, join, resolve } from "node:path";
import { exampleManifest } from "../../../examples/manifest";
import {
  decodeCreateProjectRequest,
  decodeRenameFileRequest,
  decodeRenameProjectRequest,
  decodeWriteFileRequest,
  type ApiServerErrorCode,
  type ExampleSummary,
  type ProjectSummary,
} from "../shared/contracts";
import {
  SandboxConflictError,
  SandboxNotFoundError,
  SandboxPathError,
  validateProjectName,
} from "./path-policy";
import { ProjectRepository } from "./project-repository";
import {
  documentationManifest,
  documentationMediaResponse,
  readDocumentation,
} from "./documentation";

export { normalizeSandboxRelativePath, SandboxPathError } from "./path-policy";

export type SandboxHandlerOptions = {
  readonly projectsRoot?: string;
  /** `combined` preserves the embeddable handler API; the CLI uses separate
   * editor and preview handlers so learner code has no mutation endpoints. */
  readonly access?: "combined" | "editor" | "preview";
  readonly previewOrigin?: string;
  readonly parentOrigin?: string;
  /** Hostnames a browser may use for this server, such as both `127.0.0.1`
   * and `localhost`. See `partnerOrigin()`. */
  readonly hostnames?: readonly string[];
};

export type SandboxProjectSummary = ProjectSummary;
export type SandboxExampleSummary = ExampleSummary;

type RouteMatch = {
  readonly project: string;
  readonly path: string;
};

export const REPO_ROOT = resolve(import.meta.dir, "../../..");
const CLIENT_DIR = join(REPO_ROOT, "apps/sandbox/client");

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
  const access = options.access ?? "combined";
  const editorEnabled = access !== "preview";
  const previewEnabled = access !== "editor";
  const repository = new ProjectRepository(projectsRoot, REPO_ROOT);

  return async function sandboxHandler(
    request: Request,
  ): Promise<Response | null> {
    const rawPath = rawPathname(request.url);
    const url = new URL(request.url);
    const hostnames = options.hostnames ?? [];
    const previewOrigin = partnerOrigin(options.previewOrigin, url, hostnames);
    const parentOrigin = partnerOrigin(options.parentOrigin, url, hostnames);

    try {
      if (
        editorEnabled &&
        isMutationRequest(request) &&
        isCrossOrigin(request)
      ) {
        return apiError(
          "Cross-origin project mutations are forbidden.",
          "forbidden",
          403,
        );
      }

      if (editorEnabled && url.pathname.startsWith("/docs/media/")) {
        if (request.method !== "GET") return methodNotAllowed();
        return await documentationMediaResponse(
          url.pathname.slice("/docs/media/".length),
        );
      }

      if (
        editorEnabled &&
        (url.pathname === "/docs" || url.pathname === "/docs/")
      ) {
        if (request.method !== "GET") return methodNotAllowed();
        return new Response(Bun.file(join(CLIENT_DIR, "docs.html")), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      if (editorEnabled && url.pathname === "/" && request.method === "GET") {
        const source = await Bun.file(join(CLIENT_DIR, "index.html")).text();
        return new Response(clientShellPage(source, previewOrigin), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      if (
        editorEnabled &&
        url.pathname === "/client/app.css" &&
        request.method === "GET"
      ) {
        return new Response(Bun.file(join(CLIENT_DIR, "style.css")), {
          headers: { "content-type": "text/css; charset=utf-8" },
        });
      }

      if (
        editorEnabled &&
        url.pathname === "/client/app.js" &&
        request.method === "GET"
      ) {
        const build = await cachedBrowserBuild(
          "client-app",
          join(CLIENT_DIR, "main.ts"),
        );
        return new Response(build.text, {
          headers: { "content-type": build.contentType },
        });
      }

      if (
        editorEnabled &&
        url.pathname === "/client/docs.js" &&
        request.method === "GET"
      ) {
        const build = await cachedBrowserBuild(
          "client-docs",
          join(CLIENT_DIR, "docs-main.ts"),
        );
        return new Response(build.text, {
          headers: { "content-type": build.contentType },
        });
      }

      if (
        previewEnabled &&
        url.pathname === "/client/preview.js" &&
        request.method === "GET"
      ) {
        const build = await cachedBrowserBuild(
          "client-preview",
          join(CLIENT_DIR, "preview-entry.ts"),
        );
        return new Response(build.text, {
          headers: { "content-type": build.contentType },
        });
      }

      if (editorEnabled && url.pathname === "/api/health") {
        return json({ ok: true });
      }

      if (editorEnabled && url.pathname === "/api/examples") {
        if (request.method !== "GET") return methodNotAllowed();
        return json({ examples: cloneableExamples() });
      }

      if (editorEnabled && url.pathname === "/api/docs") {
        if (request.method !== "GET") return methodNotAllowed();
        return json({ documents: documentationManifest() });
      }

      if (editorEnabled && url.pathname.startsWith("/api/docs/")) {
        if (request.method !== "GET") return methodNotAllowed();
        let id: string;
        try {
          id = decodeURIComponent(url.pathname.slice("/api/docs/".length));
        } catch {
          return apiError("Documentation page not found.", "not_found", 404);
        }
        const document = await readDocumentation(id);
        return document
          ? json({ document })
          : apiError("Documentation page not found.", "not_found", 404);
      }

      if (editorEnabled && url.pathname === "/api/projects") {
        if (request.method === "GET") {
          return json({ projects: await repository.listProjects() });
        }
        if (request.method === "POST") {
          return await createProjectResponse(repository, request);
        }
        return methodNotAllowed();
      }

      const renameProjectRoute = editorEnabled
        ? matchProjectSubRoute(rawPath, "rename")
        : null;
      if (renameProjectRoute) {
        if (request.method !== "POST") return methodNotAllowed();
        return await renameProjectResponse(
          repository,
          renameProjectRoute,
          request,
        );
      }

      const renameFileRoute = editorEnabled
        ? matchProjectSubRoute(rawPath, "files/rename")
        : null;
      if (renameFileRoute) {
        if (request.method !== "POST") return methodNotAllowed();
        return await renameProjectFileResponse(
          repository,
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
          const project = await repository.getProject(singleProjectRoute);
          return previewReadResponse(json({ project }), access, parentOrigin);
        }
        if (editorEnabled && request.method === "DELETE") {
          return await deleteProjectResponse(repository, singleProjectRoute);
        }
        if (!editorEnabled) return null;
        return methodNotAllowed();
      }

      const fileRoute = matchProjectPathRoute(
        rawPath,
        "/api/projects/",
        "/files/",
      );
      if (fileRoute) {
        if (request.method === "GET") {
          return previewReadResponse(
            await readProjectFileResponse(repository, fileRoute),
            access,
            parentOrigin,
          );
        }
        if (editorEnabled && request.method === "PUT") {
          return await writeProjectFileResponse(repository, fileRoute, request);
        }
        if (editorEnabled && request.method === "DELETE") {
          return await deleteProjectFileResponse(repository, fileRoute);
        }
        return editorEnabled ? methodNotAllowed() : null;
      }

      const assetRoute = matchProjectPathRoute(
        rawPath,
        "/api/projects/",
        "/assets/",
      );
      if (editorEnabled && assetRoute) {
        if (request.method === "PUT") {
          return await writeProjectAssetResponse(
            repository,
            assetRoute,
            request,
          );
        }
        if (request.method === "DELETE") {
          return await deleteProjectAssetResponse(repository, assetRoute);
        }
        return methodNotAllowed();
      }

      const playProject = previewEnabled
        ? matchSingleSegmentRoute(rawPath, "/play/")
        : null;
      if (playProject) {
        if (request.method !== "GET") return methodNotAllowed();
        validateProjectName(playProject);
        await repository.requireProject(playProject);
        const response = html(
          previewShellPage(playProject, parentOrigin ?? url.origin),
        );
        response.headers.set(
          "content-security-policy",
          `frame-ancestors ${parentOrigin ?? url.origin}`,
        );
        return response;
      }

      const assetReadRoute = matchProjectPathRoute(rawPath, "/assets/", "/");
      if (assetReadRoute) {
        if (request.method !== "GET") return methodNotAllowed();
        return previewReadResponse(
          await readProjectAssetResponse(repository, assetReadRoute),
          access,
          parentOrigin,
        );
      }
    } catch (error) {
      return errorResponse(error);
    }

    return null;
  };
}

function cloneableExamples(): readonly SandboxExampleSummary[] {
  return exampleManifest
    .filter((example) => example.mode === "global")
    .map((example) => ({
      slug: example.slug,
      title: example.title,
      description: example.description,
      expectsInput: example.expectsInput,
    }));
}

async function createProjectResponse(
  repository: ProjectRepository,
  request: Request,
): Promise<Response> {
  const body = decodeCreateProjectRequest(await readJsonBody(request));
  if (!body) {
    throw new SandboxPathError(
      "Project creation requires a name and an optional exampleSlug string.",
    );
  }
  const project = await repository.createProject(body.name, body.exampleSlug);
  return json({ project }, 201);
}

async function deleteProjectResponse(
  repository: ProjectRepository,
  name: string,
): Promise<Response> {
  await repository.deleteProject(name);
  return json({ ok: true, project: name });
}

async function renameProjectResponse(
  repository: ProjectRepository,
  name: string,
  request: Request,
): Promise<Response> {
  const body = decodeRenameProjectRequest(await readJsonBody(request));
  if (!body) {
    throw new SandboxPathError("Project rename requires a string name field.");
  }
  const nextName = body.name;
  return json({ project: await repository.renameProject(name, nextName) });
}

async function readProjectFileResponse(
  repository: ProjectRepository,
  route: RouteMatch,
): Promise<Response> {
  return json({
    ...(await repository.readCodeFile(route.project, route.path)),
    bootId: repository.bootId,
  });
}

async function writeProjectFileResponse(
  repository: ProjectRepository,
  route: RouteMatch,
  request: Request,
): Promise<Response> {
  const body = decodeWriteFileRequest(await readJsonBody(request));
  if (!body) {
    return apiError(
      "File writes require content, baseVersion, revision, and sessionId fields.",
      "invalid_request",
      400,
    );
  }
  const result = await repository.writeCodeFile(
    route.project,
    route.path,
    body,
  );
  if (result.status === "conflict") {
    return apiError(
      "The file changed after this edit was loaded.",
      "conflict",
      409,
    );
  }
  return json({
    ok: true,
    project: result.project,
    path: result.path,
    version: result.version,
    stale: result.status === "stale",
    bootId: repository.bootId,
  });
}

async function deleteProjectFileResponse(
  repository: ProjectRepository,
  route: RouteMatch,
): Promise<Response> {
  const path = await repository.deleteCodeFile(route.project, route.path);
  return json({ ok: true, project: route.project, path });
}

async function renameProjectFileResponse(
  repository: ProjectRepository,
  projectName: string,
  request: Request,
): Promise<Response> {
  const body = decodeRenameFileRequest(await readJsonBody(request));
  if (!body) {
    throw new SandboxPathError(
      "File rename requires string from and to fields.",
    );
  }
  const renamed = await repository.renameCodeFile(
    projectName,
    body.from,
    body.to,
  );
  return json({ ok: true, project: projectName, ...renamed });
}

async function writeProjectAssetResponse(
  repository: ProjectRepository,
  route: RouteMatch,
  request: Request,
): Promise<Response> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  const written = await repository.writeAsset(route.project, route.path, bytes);
  return json({
    ok: true,
    project: route.project,
    ...written,
  });
}

async function deleteProjectAssetResponse(
  repository: ProjectRepository,
  route: RouteMatch,
): Promise<Response> {
  const path = await repository.deleteAsset(route.project, route.path);
  return json({ ok: true, project: route.project, path });
}

async function readProjectAssetResponse(
  repository: ProjectRepository,
  route: RouteMatch,
): Promise<Response> {
  const asset = await repository.readAsset(route.project, route.path);
  return new Response(new Uint8Array(asset.bytes), {
    headers: { "content-type": contentType(asset.path) },
  });
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

function clientShellPage(source: string, previewOrigin?: string): string {
  if (!previewOrigin) return source;
  return source.replace(
    '<div class="app" data-jgz-app>',
    `<div class="app" data-jgz-app data-jgz-preview-origin="${escapeHtml(previewOrigin)}">`,
  );
}

function previewShellPage(project: string, parentOrigin: string): string {
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
        overflow: hidden;
      }
      body {
        display: grid;
        place-items: center;
      }
      /*
       * The canvas is letterboxed to the game's aspect ratio by
       * client/preview-entry.ts, which sets an explicit CSS size on it.
       * Keeping the element box identical to the drawn content is what
       * lets the runtime map mouse positions back to game coordinates.
       */
      canvas {
        display: block;
        background: #150f1c;
      }
    </style>
  </head>
  <body data-jgz-project="${escapeHtml(project)}" data-jgz-entry="main.js" data-jgz-parent-origin="${escapeHtml(parentOrigin)}">
    <canvas data-jgz-preview-canvas tabindex="0"></canvas>
    <script type="module" src="/client/preview.js"></script>
  </body>
</html>`;
}

export function html(source: string): Response {
  return new Response(source, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function methodNotAllowed(): Response {
  return apiError("Method not allowed.", "method_not_allowed", 405);
}

function isMutationRequest(request: Request): boolean {
  return request.method !== "GET" && request.method !== "HEAD";
}

function allowedOriginHosts(): readonly string[] {
  const raw = process.env.JGZ_ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Determines whether a mutation request originates from a different site.
 *
 * Behind a TLS-terminating proxy or port-forward (Codespaces, ngrok, VS Code
 * forwarded ports) the browser-sent `Origin` scheme can legitimately differ
 * from the scheme Bun observes on `request.url` — that must not be treated
 * as cross-origin. `Sec-Fetch-Site`, when present, is scheme-independent, so
 * it is consulted first: `cross-site` is rejected and `same-origin`/`none`
 * accepted outright. `same-site` is NOT accepted on its own — the isolated
 * learner preview runs on the same host at a different port, which browsers
 * classify as `same-site` — so it falls through to the host comparison, as
 * does a missing header. The `Origin` fallback compares host (hostname +
 * port) only, never scheme.
 */
function isCrossOrigin(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") return true;
  if (secFetchSite === "same-origin" || secFetchSite === "none") return false;

  const origin = request.headers.get("origin");
  if (origin === null) return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return true;
  }

  const requestUrl = new URL(request.url);
  if (originUrl.host === requestUrl.host) return false;

  return !allowedOriginHosts().includes(originUrl.host);
}

function apiError(
  error: string,
  code: ApiServerErrorCode,
  status: number,
): Response {
  return json({ error, code }, status);
}

function errorResponse(error: unknown): Response {
  if (error instanceof SandboxPathError) {
    return apiError(error.message, "invalid_request", 400);
  }
  if (error instanceof SandboxNotFoundError) {
    return apiError(error.message, "not_found", 404);
  }
  if (error instanceof SandboxConflictError) {
    return apiError(error.message, "conflict", 409);
  }
  return apiError(
    error instanceof Error ? error.message : String(error),
    "internal_error",
    500,
  );
}

/**
 * The editor and its preview share a hostname and differ only by port. A
 * browser can reach a server on 127.0.0.1 as `localhost` too, and the two
 * names are different origins, so a page opened at another of the server's
 * `hostnames` is paired with the editor or preview at that same name. Each
 * page still names exactly one partner origin. Any other name keeps the
 * configured origin.
 */
function partnerOrigin(
  configured: string | undefined,
  requestUrl: URL,
  hostnames: readonly string[],
): string | undefined {
  if (!configured || !hostnames.includes(requestUrl.hostname)) {
    return configured;
  }
  const partner = new URL(configured);
  partner.hostname = requestUrl.hostname;
  return partner.origin;
}

function previewReadResponse(
  response: Response,
  access: "combined" | "editor" | "preview",
  parentOrigin: string | undefined,
): Response {
  if (access === "preview" && parentOrigin) {
    response.headers.set("access-control-allow-origin", parentOrigin);
    response.headers.append("vary", "Origin");
  }
  return response;
}

export function contentType(path: string): string {
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
