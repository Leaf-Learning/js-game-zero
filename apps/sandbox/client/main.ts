import * as api from "./api";
import { ApiError, WriteConflictError } from "./api";
import { createConsolePanel } from "./console-panel";
import { SandboxController } from "./controller";
import { DocumentSession } from "./document-session";
import { choiceDialog, toast } from "./dialogs";
import { h, qs } from "./dom";
import { createEditor } from "./editor";
import { initPanelResizers } from "./layout";
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
let diagnostics: Diagnostic[] = [];

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

const documentSession = new DocumentSession({
  write: ({ project, path, content, revision }) =>
    api.writeFile(project, path, content, { revision }),
  writeForUnload: ({ project, path, content, revision }) => {
    void api.writeFile(project, path, content, {
      keepalive: true,
      revision,
    });
  },
  onStateChange: setSaveState,
  onError: (error) => {
    if (error instanceof WriteConflictError) {
      void offerConflictRecovery(error);
      return;
    }
    toast(`Couldn't save: ${errorMessage(error)}`, "error");
  },
});

let conflictRecoveryOpen = false;

/** A 409 that survives the automatic restart rebase means someone else's copy
 * is on the server. The editor must never be left permanently blocked, so the
 * user picks a side: take the server's copy, or push the local one. */
async function offerConflictRecovery(error: WriteConflictError): Promise<void> {
  if (conflictRecoveryOpen) return;
  if (
    selection.selectedProject !== error.project ||
    selection.selectedFile !== error.path
  ) {
    toast(`Couldn't save "${error.path}": ${errorMessage(error)}`, "error");
    return;
  }
  conflictRecoveryOpen = true;
  try {
    const choice = await choiceDialog({
      title: "This file changed on the server",
      body: `"${error.path}" was modified outside this editor tab. Reload the server's copy (your unsaved edits here are discarded), or overwrite it with your copy?`,
      choices: [
        { id: "reload", label: "Reload from server", danger: true },
        { id: "overwrite", label: "Overwrite with my copy" },
      ],
    });
    if (choice === "reload") {
      documentSession.discard();
      await selectFile(error.path);
    } else if (choice === "overwrite") {
      // The failed write already rebased the cached version onto the
      // server's, so retrying now sends a matching base version.
      await flushSave();
    }
  } finally {
    conflictRecoveryOpen = false;
  }
}

/** Returns false when dirty work could not be persisted. Callers that move,
 * rename, delete, play, or restart must stop rather than discard that work. */
async function flushSave(): Promise<boolean> {
  try {
    await documentSession.flush();
    return true;
  } catch {
    return false;
  }
}

const selection = new SandboxController({
  flushSave,
  readFile: api.readFile,
});

const editor = createEditor(editorMount, {
  onChange: (content) => {
    if (!selection.selectedProject || !selection.selectedFile) return;
    documentSession.edit(
      selection.selectedProject,
      selection.selectedFile,
      content,
    );
  },
  onSaveShortcut: () => {
    void flushSave();
  },
});
saveButton.addEventListener("click", () => void flushSave());

initPanelResizers(root);

const consolePanel = createConsolePanel(previewRoot);

const preview = createPreview(previewRoot, {
  ...(root.dataset.jgzPreviewOrigin
    ? { previewOrigin: root.dataset.jgzPreviewOrigin }
    : {}),
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
      if (!selection.selectedProject) return;
      if (!(await flushSave())) return;
      diagnostics = [];
      consolePanel.clear();
      preview.play(selection.selectedProject);
    })();
  },
  onRestartRequested: () => {
    void (async () => {
      if (!(await flushSave())) return;
      diagnostics = [];
      consolePanel.clear();
      preview.restart();
    })();
  },
});

function refreshSidebar(): void {
  sidebar.update({
    projects,
    selectedProject: selection.selectedProject,
    selectedFile: selection.selectedFile,
  });
}

function currentCodeFiles(): string[] {
  const project = projects.find(
    (candidate) => candidate.name === selection.selectedProject,
  );
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
  const hasFile = Boolean(selection.selectedProject && selection.selectedFile);
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
  try {
    const selected = await selection.selectFile(path);
    if (!selected) return;
    editor.setValue(selected.content);
    selectedFileLabel.textContent = selected.path;
    setSaveState("saved");
    refreshSidebar();
    refreshWorkspaceVisibility();
  } catch (error) {
    toast(errorMessage(error), "error");
  }
}

async function selectProject(name: string): Promise<void> {
  if (!(await selection.selectProject(name))) return;
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
  if (nextFile && selection.selectedProject === name)
    await selectFile(nextFile);
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
        if (!(await flushSave())) return;
        await api.renameProject(name, nextName);
        await reloadProjects();
        if (selection.selectedProject === name) {
          selection.renameProject(name, nextName);
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
        if (!(await flushSave())) return;
        await api.deleteProject(name);
        await reloadProjects();
        if (selection.selectedProject === name) {
          selection.clearProject(name);
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
      if (!selection.selectedProject) return;
      try {
        await api.createFile(selection.selectedProject, path);
        await reloadProjects();
        await selectFile(path);
      } catch (error) {
        toast(errorMessage(error), "error");
      }
    })();
  },
  onRequestRenameFile: (path, nextPath) => {
    void (async () => {
      if (!selection.selectedProject) return;
      try {
        if (!(await flushSave())) return;
        await api.renameFile(selection.selectedProject, path, nextPath);
        await reloadProjects();
        if (selection.selectedFile === path) {
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
      if (!selection.selectedProject) return;
      try {
        if (!(await flushSave())) return;
        await api.deleteFile(selection.selectedProject, path);
        await reloadProjects();
        if (selection.selectedFile === path) {
          selection.clearFile(path);
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
      if (!selection.selectedProject) return;
      try {
        for (const file of Array.from(files)) {
          await api.uploadAsset(
            selection.selectedProject,
            `${kind}/${file.name}`,
            file,
          );
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
      if (!selection.selectedProject) return;
      try {
        if (!(await flushSave())) return;
        await api.deleteAsset(selection.selectedProject, path);
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
  documentSession.flushForUnload();
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
