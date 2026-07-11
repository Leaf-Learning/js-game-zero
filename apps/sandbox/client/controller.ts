import { LatestOperation } from "./latest-operation";

export type FileSelection = {
  readonly project: string;
  readonly path: string;
  readonly content: string;
};

export type SandboxControllerOptions = {
  readonly flushSave: () => Promise<boolean>;
  readonly readFile: (project: string, path: string) => Promise<string>;
};

/**
 * Owns workspace selection state independently of DOM rendering. Operation
 * tokens make the newest project/file request authoritative even when older
 * network reads or save barriers settle later.
 */
export class SandboxController {
  readonly #options: SandboxControllerOptions;
  readonly #projectOperations = new LatestOperation();
  readonly #fileOperations = new LatestOperation();
  #selectedProject: string | null = null;
  #selectedFile: string | null = null;

  constructor(options: SandboxControllerOptions) {
    this.#options = options;
  }

  get selectedProject(): string | null {
    return this.#selectedProject;
  }

  get selectedFile(): string | null {
    return this.#selectedFile;
  }

  async selectProject(name: string): Promise<boolean> {
    const operation = this.#projectOperations.begin();
    this.#fileOperations.invalidate();
    if (!(await this.#options.flushSave())) return false;
    if (!this.#projectOperations.isCurrent(operation)) return false;
    this.#selectedProject = name;
    this.#selectedFile = null;
    return true;
  }

  async selectFile(path: string): Promise<FileSelection | null> {
    const project = this.#selectedProject;
    if (!project) return null;
    const operation = this.#fileOperations.begin();
    if (!(await this.#options.flushSave())) return null;
    if (
      !this.#fileOperations.isCurrent(operation) ||
      this.#selectedProject !== project
    ) {
      return null;
    }
    let content: string;
    try {
      content = await this.#options.readFile(project, path);
    } catch (error) {
      if (
        this.#fileOperations.isCurrent(operation) &&
        this.#selectedProject === project
      ) {
        throw error;
      }
      return null;
    }
    if (
      !this.#fileOperations.isCurrent(operation) ||
      this.#selectedProject !== project
    ) {
      return null;
    }
    this.#selectedFile = path;
    return { project, path, content };
  }

  renameProject(from: string, to: string): void {
    if (this.#selectedProject === from) this.#selectedProject = to;
  }

  clearProject(name?: string): void {
    if (name !== undefined && this.#selectedProject !== name) return;
    this.#projectOperations.invalidate();
    this.#fileOperations.invalidate();
    this.#selectedProject = null;
    this.#selectedFile = null;
  }

  clearFile(path?: string): void {
    if (path !== undefined && this.#selectedFile !== path) return;
    this.#fileOperations.invalidate();
    this.#selectedFile = null;
  }
}
