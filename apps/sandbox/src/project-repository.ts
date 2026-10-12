import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { getExample } from "../../../examples/manifest";
import type { ProjectSummary, WriteFileRequest } from "../shared/contracts";
import {
  atomicWriteFile,
  ensureCodeFilePath,
  ensureInside,
  ensureProjectsRoot,
  isMissingFileError,
  isValidProjectName,
  normalizeSandboxRelativePath,
  resolveProject,
  resolveProjectFile,
  SandboxConflictError,
  SandboxPathError,
  validateAssetPath,
  validateProjectName,
} from "./path-policy";

type FileVersionState = {
  readonly version: number;
  readonly sessionId: string;
  readonly revision: number;
  readonly content: string;
};

export type ProjectFile = {
  readonly project: string;
  readonly path: string;
  readonly content: string;
  readonly version: number;
};

export type FileWriteResult =
  | {
      readonly status: "written" | "stale" | "duplicate";
      readonly project: string;
      readonly path: string;
      readonly version: number;
    }
  | { readonly status: "conflict" };

export type ProjectAsset = {
  readonly path: string;
  readonly bytes: Uint8Array;
};

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
  screen.draw.filledCircle([x, y], 20, "#7dd8c6");
  screen.draw.text("Use the arrow keys!", [20, 20], {
    fontsize: 16,
    color: "#ffffff",
  });
}
`;

/** Filesystem-backed project operations. Path resolution always flows through
 * path-policy.ts, and write ordering/version state is owned alongside the
 * files whose lifecycle it tracks. */
export class ProjectRepository {
  readonly #projectsRoot: string;
  readonly #repoRoot: string;
  readonly #bootId = crypto.randomUUID();
  readonly #versions = new Map<string, FileVersionState>();
  readonly #writeQueues = new Map<string, Promise<unknown>>();

  constructor(projectsRoot: string, repoRoot: string) {
    this.#projectsRoot = projectsRoot;
    this.#repoRoot = repoRoot;
  }

  /** Identifies this repository's in-memory version state. `#versions` does
   * not survive a server restart, so clients compare this against the boot ID
   * they last saw and discard their cached file versions when it changes. */
  get bootId(): string {
    return this.#bootId;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const root = await ensureProjectsRoot(this.#projectsRoot);
    const entries = await readdir(root, { withFileTypes: true });
    const projects: ProjectSummary[] = [];
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        !isValidProjectName(entry.name)
      ) {
        continue;
      }
      projects.push(await this.#summarizeProject(root, entry.name));
    }
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProject(name: string): Promise<ProjectSummary> {
    return this.#summarizeProject(
      await ensureProjectsRoot(this.#projectsRoot),
      name,
    );
  }

  async requireProject(name: string): Promise<void> {
    await resolveProject(this.#projectsRoot, name);
  }

  async createProject(
    name: string,
    exampleSlug?: string,
  ): Promise<ProjectSummary> {
    validateProjectName(name);
    const example =
      exampleSlug === undefined ? undefined : getExample(exampleSlug);
    if (exampleSlug !== undefined && (!example || example.mode !== "global")) {
      throw new SandboxPathError(`Unknown starter example: ${exampleSlug}`);
    }

    const root = await ensureProjectsRoot(this.#projectsRoot);
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

    const stagingRoot = join(root, `.jgz-staging-${crypto.randomUUID()}`);
    ensureInside(stagingRoot, root);
    await mkdir(stagingRoot);
    try {
      for (const directory of ["images", "sounds", "music", "fonts"]) {
        await mkdir(join(stagingRoot, directory));
      }
      if (example) {
        const source = await readFile(
          join(this.#repoRoot, example.entryPoint),
          "utf8",
        );
        await writeFile(join(stagingRoot, "main.js"), source, "utf8");
        const exampleAssetsRoot = join(
          this.#repoRoot,
          dirname(example.entryPoint),
          "assets",
        );
        for (const asset of example.assets) {
          const from = join(exampleAssetsRoot, asset);
          const to = join(stagingRoot, asset);
          await mkdir(dirname(to), { recursive: true });
          await copyFile(from, to);
        }
      } else {
        await writeFile(
          join(stagingRoot, "main.js"),
          defaultStarterSource,
          "utf8",
        );
      }

      try {
        await rename(stagingRoot, projectRoot);
      } catch (error) {
        if (await this.#pathExists(projectRoot)) {
          throw new SandboxConflictError(`Project already exists: ${name}`);
        }
        throw error;
      }
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }
    return this.#summarizeProject(root, name);
  }

  async deleteProject(name: string): Promise<void> {
    const { projectRoot } = await resolveProject(this.#projectsRoot, name);
    await this.#waitForProjectWrites(projectRoot);
    await rm(projectRoot, { recursive: true, force: true });
    this.#clearProjectState(projectRoot);
  }

  async renameProject(name: string, nextName: string): Promise<ProjectSummary> {
    validateProjectName(nextName);
    const { projectRoot } = await resolveProject(this.#projectsRoot, name);
    const root = await ensureProjectsRoot(this.#projectsRoot);
    if (nextName === name) return this.#summarizeProject(root, name);
    const nextRoot = join(root, nextName);
    ensureInside(nextRoot, root);
    try {
      await lstat(nextRoot);
      throw new SandboxConflictError(`Project already exists: ${nextName}`);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
    await this.#waitForProjectWrites(projectRoot);
    await rename(projectRoot, nextRoot);
    this.#moveProjectState(projectRoot, nextRoot);
    return this.#summarizeProject(root, nextName);
  }

  async readCodeFile(
    projectName: string,
    rawPath: string,
  ): Promise<ProjectFile> {
    const safePath = normalizeSandboxRelativePath(rawPath);
    ensureCodeFilePath(safePath);
    const project = await resolveProject(this.#projectsRoot, projectName);
    const resolved = await resolveProjectFile(project.projectRoot, safePath, {
      createParent: false,
      requireExisting: true,
    });
    return {
      project: projectName,
      path: safePath,
      content: await readFile(resolved.path, "utf8"),
      version: this.#versions.get(resolved.path)?.version ?? 0,
    };
  }

  async writeCodeFile(
    projectName: string,
    rawPath: string,
    write: WriteFileRequest,
  ): Promise<FileWriteResult> {
    const safePath = normalizeSandboxRelativePath(rawPath);
    ensureCodeFilePath(safePath);
    const project = await resolveProject(this.#projectsRoot, projectName);
    const resolved = await resolveProjectFile(project.projectRoot, safePath, {
      createParent: true,
      requireExisting: false,
    });
    return this.#withFileLocks([resolved.path], async () => {
      // Exclusive create is checked against the filesystem, not `#versions`:
      // files never written through this process (example clones, anything
      // after a restart) have no version state but must not be truncated.
      if (write.createOnly && (await this.#pathExists(resolved.path))) {
        throw new SandboxConflictError(`File already exists: ${safePath}`);
      }
      const current = this.#versions.get(resolved.path) ?? {
        version: 0,
        sessionId: "",
        revision: -1,
        content: "",
      };
      if (
        write.baseVersion !== current.version &&
        write.sessionId !== current.sessionId
      ) {
        return { status: "conflict" };
      }
      if (
        write.sessionId === current.sessionId &&
        write.revision < current.revision
      ) {
        return {
          status: "stale",
          project: projectName,
          path: safePath,
          version: current.version,
        };
      }
      if (
        write.sessionId === current.sessionId &&
        write.revision === current.revision
      ) {
        if (write.content !== current.content) return { status: "conflict" };
        return {
          status: "duplicate",
          project: projectName,
          path: safePath,
          version: current.version,
        };
      }

      await atomicWriteFile(resolved.path, write.content);
      const next: FileVersionState = {
        version: current.version + 1,
        sessionId: write.sessionId,
        revision: write.revision,
        content: write.content,
      };
      this.#versions.set(resolved.path, next);
      return {
        status: "written",
        project: projectName,
        path: safePath,
        version: next.version,
      };
    });
  }

  async deleteCodeFile(projectName: string, rawPath: string): Promise<string> {
    const safePath = normalizeSandboxRelativePath(rawPath);
    ensureCodeFilePath(safePath);
    const project = await resolveProject(this.#projectsRoot, projectName);
    const resolved = await resolveProjectFile(project.projectRoot, safePath, {
      createParent: false,
      requireExisting: true,
    });
    await this.#withFileLocks([resolved.path], async () => {
      await rm(resolved.path);
      this.#versions.delete(resolved.path);
    });
    return safePath;
  }

  async renameCodeFile(
    projectName: string,
    rawFrom: string,
    rawTo: string,
  ): Promise<{ readonly from: string; readonly to: string }> {
    const from = normalizeSandboxRelativePath(rawFrom);
    const to = normalizeSandboxRelativePath(rawTo);
    ensureCodeFilePath(from);
    ensureCodeFilePath(to);
    const project = await resolveProject(this.#projectsRoot, projectName);
    const source = await resolveProjectFile(project.projectRoot, from, {
      createParent: false,
      requireExisting: true,
    });
    const destination = await resolveProjectFile(project.projectRoot, to, {
      createParent: true,
      requireExisting: false,
    });
    await this.#withFileLocks([source.path, destination.path], async () => {
      if (from !== to) {
        try {
          await lstat(destination.path);
          throw new SandboxConflictError(`File already exists: ${to}`);
        } catch (error) {
          if (!isMissingFileError(error)) throw error;
        }
      }
      await rename(source.path, destination.path);
      const state = this.#versions.get(source.path);
      this.#versions.delete(source.path);
      this.#versions.delete(destination.path);
      if (state) this.#versions.set(destination.path, state);
    });
    return { from, to };
  }

  async writeAsset(
    projectName: string,
    rawPath: string,
    bytes: Uint8Array,
  ): Promise<{ readonly path: string; readonly bytes: number }> {
    const safePath = normalizeSandboxRelativePath(rawPath);
    validateAssetPath(safePath);
    const project = await resolveProject(this.#projectsRoot, projectName);
    const resolved = await resolveProjectFile(project.projectRoot, safePath, {
      createParent: true,
      requireExisting: false,
    });
    await atomicWriteFile(resolved.path, bytes);
    return { path: safePath, bytes: bytes.byteLength };
  }

  async deleteAsset(projectName: string, rawPath: string): Promise<string> {
    const safePath = normalizeSandboxRelativePath(rawPath);
    validateAssetPath(safePath);
    const project = await resolveProject(this.#projectsRoot, projectName);
    const resolved = await resolveProjectFile(project.projectRoot, safePath, {
      createParent: false,
      requireExisting: true,
    });
    await rm(resolved.path);
    return safePath;
  }

  async readAsset(projectName: string, rawPath: string): Promise<ProjectAsset> {
    const safePath = normalizeSandboxRelativePath(rawPath);
    validateAssetPath(safePath);
    const project = await resolveProject(this.#projectsRoot, projectName);
    const resolved = await resolveProjectFile(project.projectRoot, safePath, {
      createParent: false,
      requireExisting: true,
    });
    return { path: resolved.path, bytes: await readFile(resolved.path) };
  }

  async #summarizeProject(
    projectsRoot: string,
    name: string,
  ): Promise<ProjectSummary> {
    const project = await resolveProject(projectsRoot, name);
    return { name, files: await this.#listProjectFiles(project.projectRoot) };
  }

  async #listProjectFiles(projectRoot: string): Promise<string[]> {
    const files: string[] = [];
    const visit = async (directory: string, prefix: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const entryPath = join(directory, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await visit(entryPath, relativePath);
        else if (entry.isFile()) files.push(relativePath);
      }
    };
    await visit(projectRoot, "");
    return files.sort();
  }

  async #withFileLocks<T>(
    paths: readonly string[],
    operation: () => Promise<T>,
  ): Promise<T> {
    const uniquePaths = [...new Set(paths)].sort();
    const previous = Promise.all(
      uniquePaths.map((path) =>
        (this.#writeQueues.get(path) ?? Promise.resolve()).catch(
          () => undefined,
        ),
      ),
    );
    const current = previous.then(operation);
    for (const path of uniquePaths) this.#writeQueues.set(path, current);
    try {
      return await current;
    } finally {
      for (const path of uniquePaths) {
        if (this.#writeQueues.get(path) === current) {
          this.#writeQueues.delete(path);
        }
      }
    }
  }

  async #waitForProjectWrites(projectRoot: string): Promise<void> {
    const writes = [...this.#writeQueues.entries()]
      .filter(([path]) => this.#belongsToProject(path, projectRoot))
      .map(([, write]) => write.catch(() => undefined));
    await Promise.all(writes);
  }

  #clearProjectState(projectRoot: string): void {
    for (const path of this.#versions.keys()) {
      if (this.#belongsToProject(path, projectRoot))
        this.#versions.delete(path);
    }
    for (const path of this.#writeQueues.keys()) {
      if (this.#belongsToProject(path, projectRoot))
        this.#writeQueues.delete(path);
    }
  }

  #moveProjectState(projectRoot: string, nextRoot: string): void {
    for (const [path, state] of [...this.#versions.entries()]) {
      if (!this.#belongsToProject(path, projectRoot)) continue;
      this.#versions.delete(path);
      this.#versions.set(`${nextRoot}${path.slice(projectRoot.length)}`, state);
    }
    for (const [path, queue] of [...this.#writeQueues.entries()]) {
      if (!this.#belongsToProject(path, projectRoot)) continue;
      this.#writeQueues.delete(path);
      this.#writeQueues.set(
        `${nextRoot}${path.slice(projectRoot.length)}`,
        queue,
      );
    }
  }

  #belongsToProject(path: string, projectRoot: string): boolean {
    return path === projectRoot || path.startsWith(`${projectRoot}${sep}`);
  }

  async #pathExists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch (error) {
      if (isMissingFileError(error)) return false;
      throw error;
    }
  }
}
