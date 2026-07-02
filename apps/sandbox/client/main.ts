import * as api from "./api";
import { ApiError } from "./api";
import { createConsolePanel } from "./console-panel";
import { toast } from "./dialogs";
import { h, qs } from "./dom";
import { createEditor } from "./editor";
import {
  chooseNewProjectFlow,
  openExampleGallery,
  promptBlankProjectName,
  renderEmptyState,
} from "./onboarding";
import { createPreview } from "./preview";
import { createSidebar } from "./sidebar";
import {
  isAssetPath,
  type AssetDirectory,
  type Diagnostic,
  type ExampleSummary,
  type ProjectSummary,
} from "./types";

const LAST_PROJECT_KEY = "jgz-sandbox:last-project";

const root = document.querySelector<HTMLDivElement>("[data-jgz-app]");
if (!root) throw new Error("Missing app root.");

const sidebarRoot = qs<HTMLElement>(root, "[data-jgz-sidebar]");
const emptyStateEl = qs<HTMLDivElement>(document, "[data-jgz-empty-state]");
const editorPaneEl = qs<HTMLElement>(document, "[data-jgz-editor-pane]");
const editorMount = qs<HTMLDivElement>(document, "[data-jgz-editor-mount]");
const selectedFileLabel = qs<HTMLSpanElement>(
  document,
  "[data-jgz-selected-file]",
);
const saveStatusEl = qs<HTMLSpanElement>(document, "[data-jgz-save-status]");
const saveButton = qs<HTMLButtonElement>(document, "[data-jgz-save]");
const previewRoot = qs<HTMLElement>(document, "[data-jgz-preview-pane]");
const openExamplesButton = qs<HTMLButtonElement>(
  document,
  "[data-jgz-open-examples]",
);

let projects: ProjectSummary[] = [];
let examples: ExampleSummary[] = [];
let selectedProject: string | null = null;
let selectedFile: string | null = null;
let savedContent = "";
let diagnostics: Diagnostic[] = [];

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: { project: string; path: string; content: string } | null =
  null;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

function setSaveState(state: "saved" | "saving" | "unsaved" | "error"): void {
  saveStatusEl.dataset.state = state;
  saveStatusEl.textContent =
    state === "saved"
      ? "Saved"
      : state === "saving"
        ? "Saving…"
        : state === "unsaved"
          ? "Unsaved changes"
          : "Couldn't save";
  document.body.dataset.jgzDirty = String(state !== "saved");
}

async function performSave(
  project: string,
  path: string,
  content: string,
): Promise<void> {
  setSaveState("saving");
  try {
    await api.writeFile(project, path, content);
    if (project === selectedProject && path === selectedFile) {
      savedContent = content;
      setSaveState(editor.getValue() === savedContent ? "saved" : "unsaved");
    }
  } catch (error) {
    setSaveState("error");
    toast(`Couldn't save: ${errorMessage(error)}`, "error");
  }
}

function scheduleAutosave(
  project: string,
  path: string,
  content: string,
): void {
  pendingSave = { project, path, content };
  setSaveState("unsaved");
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushSave();
  }, 600);
}

async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const toSave = pendingSave;
  pendingSave = null;
  if (!toSave) return;
  await performSave(toSave.project, toSave.path, toSave.content);
}

const editor = createEditor(editorMount, {
  onChange: (content) => {
    if (!selectedProject || !selectedFile) return;
    scheduleAutosave(selectedProject, selectedFile, content);
  },
  onSaveShortcut: () => {
    void flushSave();
  },
});
saveButton.addEventListener("click", () => void flushSave());

const consolePanel = createConsolePanel(previewRoot);

const preview = createPreview(previewRoot, {
  onMessage: (message) => {
    if (message.type === "console") {
      consolePanel.appendConsole({ level: message.level, text: message.text });
      return;
    }
    if (message.type === "diagnostic") {
      diagnostics = [...diagnostics, message.diagnostic];
      consolePanel.setDiagnostics(diagnostics);
      return;
    }
    if (message.type === "runtime-error") {
      diagnostics = [
        ...diagnostics,
        message.line === undefined
          ? { severity: "error", message: message.message }
          : { severity: "error", message: message.message, line: message.line },
      ];
      consolePanel.setDiagnostics(diagnostics);
    }
  },
  onPlayRequested: () => {
    void (async () => {
      if (!selectedProject) return;
      await flushSave();
      diagnostics = [];
      consolePanel.clear();
      preview.play(selectedProject);
    })();
  },
  onRestartRequested: () => {
    void (async () => {
      await flushSave();
      diagnostics = [];
      consolePanel.clear();
      preview.restart();
    })();
  },
});

function refreshSidebar(): void {
  sidebar.update({ projects, selectedProject, selectedFile });
}

function currentCodeFiles(): string[] {
  const project = projects.find((p) => p.name === selectedProject);
  return project
    ? project.files.filter((path) => !isAssetPath(path)).sort()
    : [];
}

function showBlankHero(): void {
  renderEmptyState(document.body, {
    onBlank: () => {
      void (async () => {
        const name = await promptBlankProjectName(projects.map((p) => p.name));
        if (name) await createAndSelectProject(name);
      })();
    },
    onExamples: () => {
      void (async () => {
        const choice = await openExampleGallery(
          examples,
          projects.map((p) => p.name),
        );
        if (choice) await createAndSelectProject(choice.name, choice.slug);
      })();
    },
  });
}

function showNoFileHint(): void {
  emptyStateEl.replaceChildren(
    h("div", { className: "empty-hero" }, [
      h("p", { className: "empty-kicker", text: "Almost there" }),
      h("h1", { text: "Pick or create a file" }),
      h("p", {
        className: "empty-copy",
        text: "Choose a file on the left, or create a new one to start coding.",
      }),
    ]),
  );
}

function refreshWorkspaceVisibility(): void {
  const hasFile = Boolean(selectedProject && selectedFile);
  editorPaneEl.hidden = !hasFile;
  emptyStateEl.hidden = hasFile;
  if (hasFile) return;
  if (projects.length === 0) {
    showBlankHero();
  } else {
    showNoFileHint();
  }
}

async function createAndSelectProject(
  name: string,
  exampleSlug?: string,
): Promise<void> {
  try {
    const project = await api.createProject(name, exampleSlug);
    await reloadProjects();
    await selectProject(project.name);
    toast(`Created "${project.name}".`);
  } catch (error) {
    toast(errorMessage(error), "error");
  }
}

async function reloadProjects(): Promise<void> {
  projects = await api.listProjects();
}

async function selectFile(path: string): Promise<void> {
  if (!selectedProject) return;
  await flushSave();
  try {
    const content = await api.readFile(selectedProject, path);
    selectedFile = path;
    savedContent = content;
    editor.setValue(content);
    selectedFileLabel.textContent = path;
    setSaveState("saved");
    refreshSidebar();
    refreshWorkspaceVisibility();
  } catch (error) {
    toast(errorMessage(error), "error");
  }
}

async function selectProject(name: string): Promise<void> {
  await flushSave();
  selectedProject = name;
  selectedFile = null;
  savedContent = "";
  diagnostics = [];
  consolePanel.clear();
  localStorage.setItem(LAST_PROJECT_KEY, name);
  // A running preview belongs to whichever project started it. Switching to
  // a different project would otherwise leave a stale "Running" pill and
  // console output on screen for a game that's no longer the one you're
  // looking at, so stop it rather than show mismatched state.
  if (preview.isRunning() && preview.currentProject() !== name) {
    preview.stop();
  }
  preview.setSelectedProject(name);
  refreshSidebar();
  refreshWorkspaceVisibility();
  const codeFiles = currentCodeFiles();
  const nextFile = codeFiles.includes("main.js") ? "main.js" : codeFiles[0];
  if (nextFile) await selectFile(nextFile);
}

const sidebar = createSidebar(sidebarRoot, {
  onSelectProject: (name) => void selectProject(name),
  onSelectFile: (path) => void selectFile(path),
  onRequestNewProject: () => {
    void (async () => {
      const existing = projects.map((p) => p.name);
      const result = await chooseNewProjectFlow(examples, existing);
      if (result) await createAndSelectProject(result.name, result.exampleSlug);
    })();
  },
  onRequestRenameProject: (name, nextName) => {
    void (async () => {
      try {
        // Pending autosaves are always for the currently selected
        // project/file; flush before renaming/deleting so a stale save
        // never fires against a path that just moved or disappeared.
        await flushSave();
        await api.renameProject(name, nextName);
        await reloadProjects();
        if (selectedProject === name) {
          selectedProject = nextName;
          localStorage.setItem(LAST_PROJECT_KEY, nextName);
        }
        refreshSidebar();
      } catch (error) {
        toast(errorMessage(error), "error");
      }
    })();
  },
  onRequestDeleteProject: (name) => {
    void (async () => {
      try {
        await flushSave();
        await api.deleteProject(name);
        await reloadProjects();
        if (selectedProject === name) {
          selectedProject = null;
          selectedFile = null;
          savedContent = "";
          preview.setSelectedProject(null);
          const next = projects[0]?.name ?? null;
          if (next) {
            await selectProject(next);
          } else {
            refreshSidebar();
            refreshWorkspaceVisibility();
          }
        } else {
          refreshSidebar();
        }
      } catch (error) {
        toast(errorMessage(error), "error");
      }
    })();
  },
  onRequestCreateFile: (path) => {
    void (async () => {
      if (!selectedProject) return;
      try {
        await api.createFile(selectedProject, path);
        await reloadProjects();
        await selectFile(path);
      } catch (error) {
        toast(errorMessage(error), "error");
      }
    })();
  },
  onRequestRenameFile: (path, nextPath) => {
    void (async () => {
      if (!selectedProject) return;
      try {
        await flushSave();
        await api.renameFile(selectedProject, path, nextPath);
        await reloadProjects();
        if (selectedFile === path) {
          await selectFile(nextPath);
        } else {
          refreshSidebar();
        }
      } catch (error) {
        toast(errorMessage(error), "error");
      }
    })();
  },
  onRequestDeleteFile: (path) => {
    void (async () => {
      if (!selectedProject) return;
      try {
        await flushSave();
        await api.deleteFile(selectedProject, path);
        await reloadProjects();
        if (selectedFile === path) {
          selectedFile = null;
          savedContent = "";
          const next = currentCodeFiles()[0] ?? null;
          if (next) {
            await selectFile(next);
          } else {
            editor.setValue("");
            selectedFileLabel.textContent = "No file selected";
            refreshSidebar();
            refreshWorkspaceVisibility();
          }
        } else {
          refreshSidebar();
        }
      } catch (error) {
        toast(errorMessage(error), "error");
      }
    })();
  },
  onUploadFiles: (kind: AssetDirectory, files: FileList) => {
    void (async () => {
      if (!selectedProject) return;
      try {
        for (const file of Array.from(files)) {
          await api.uploadAsset(selectedProject, `${kind}/${file.name}`, file);
        }
        await reloadProjects();
        refreshSidebar();
        toast(
          files.length === 1
            ? "Uploaded 1 file."
            : `Uploaded ${files.length} files.`,
        );
      } catch (error) {
        toast(errorMessage(error), "error");
      }
    })();
  },
  onRequestDeleteAsset: (path) => {
    void (async () => {
      if (!selectedProject) return;
      try {
        await api.deleteAsset(selectedProject, path);
        await reloadProjects();
        refreshSidebar();
      } catch (error) {
        toast(errorMessage(error), "error");
      }
    })();
  },
});

openExamplesButton.addEventListener("click", () => {
  void (async () => {
    const choice = await openExampleGallery(
      examples,
      projects.map((p) => p.name),
    );
    if (choice) await createAndSelectProject(choice.name, choice.slug);
  })();
});

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void flushSave();
  }
});

window.addEventListener("beforeunload", () => {
  if (pendingSave) {
    void api.writeFile(
      pendingSave.project,
      pendingSave.path,
      pendingSave.content,
      {
        keepalive: true,
      },
    );
  }
});

async function bootstrap(): Promise<void> {
  try {
    const [projectList, exampleList] = await Promise.all([
      api.listProjects(),
      api.listExamples(),
    ]);
    projects = projectList;
    examples = exampleList;
  } catch (error) {
    toast(errorMessage(error), "error");
  }
  refreshSidebar();
  const last = localStorage.getItem(LAST_PROJECT_KEY);
  const initial =
    projects.find((p) => p.name === last)?.name ?? projects[0]?.name ?? null;
  if (initial) {
    await selectProject(initial);
  } else {
    refreshWorkspaceVisibility();
  }
}

void bootstrap();
