import * as api from "./api";
import { ApiError, WriteConflictError } from "./api";
import { createAssetPanel } from "./asset-panel";
import { SandboxController } from "./controller";
import { DocumentSession } from "./document-session";
import { choiceDialog, toast } from "./dialogs";
import { h, qs } from "./dom";
import { createEditor, type EditorProblem } from "./editor";
import { createFileTabs } from "./file-tabs";
import { hydrateIcons, icon } from "./icons";
import { initPanelResizers } from "./layout";
import { hydrateLogos } from "./logo";
import { createMessagesPanel } from "./messages-panel";
import {
  chooseNewProjectFlow,
  openExampleGallery,
  promptBlankProjectName,
  promptExampleName,
  renderWelcome,
} from "./onboarding";
import { createPreview } from "./preview";
import { describeProblem } from "./problem-fix";
import { createProjectMenu } from "./project-menu";
import { initThemeToggle } from "./theme";
import {
  isAssetPath,
  type AssetDirectory,
  type Diagnostic,
  type ExampleSummary,
  type ProjectSummary,
} from "./types";

const LAST_PROJECT_KEY = "jgz-sandbox:last-project";
/** The file the game runs, and so the one problem line numbers refer to. */
const ENTRY_FILE = "main.js";

hydrateIcons(document);
hydrateLogos(document);

const root = document.querySelector<HTMLDivElement>("[data-jgz-app]");
if (!root) throw new Error("Missing app root.");

const welcomeEl = qs<HTMLElement>(root, "[data-jgz-welcome]");
const shellEl = qs<HTMLElement>(root, "[data-jgz-app-shell]");
const codeEmptyEl = qs<HTMLDivElement>(root, "[data-jgz-empty-state]");
const editorMount = qs<HTMLDivElement>(root, "[data-jgz-editor-mount]");
const saveButton = qs<HTMLButtonElement>(root, "[data-jgz-save]");
const saveStatusEl = qs<HTMLSpanElement>(root, "[data-jgz-save-status]");
const previewRoot = qs<HTMLElement>(root, "[data-jgz-preview-pane]");
const openExamplesButton = qs<HTMLButtonElement>(
  root,
  "[data-jgz-open-examples]",
);
const newFileButton = qs<HTMLButtonElement>(root, "[data-jgz-new-file]");
const themeToggle = qs<HTMLButtonElement>(root, "[data-jgz-theme-toggle]");

const theme = initThemeToggle(themeToggle);

let projects: ProjectSummary[] = [];
let examples: ExampleSummary[] = [];
let diagnostics: Diagnostic[] = [];
/** The problem the game last stopped on, in ENTRY_FILE. */
let currentProblem: EditorProblem | null = null;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

function setSaveState(state: "saved" | "saving" | "unsaved" | "error"): void {
  saveButton.dataset.state = state;
  saveStatusEl.textContent =
    state === "saved"
      ? "Saved"
      : state === "error"
        ? "Couldn't save"
        : "Saving…";
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

/** What the stage calls the game: its TITLE, or else the project's name. */
function refreshStageTitle(): void {
  const project = selection.selectedProject ?? "";
  if (selection.selectedFile !== ENTRY_FILE) {
    if (!currentProjectSummary()?.files.includes(ENTRY_FILE)) {
      preview.setTitle(project);
    }
    return;
  }
  const declared = /^\s*TITLE\s*=\s*(["'`])([^"'`\n]+)\1/m.exec(
    editor.getValue(),
  )?.[2];
  preview.setTitle(declared?.trim() || project);
}

const editor = createEditor(editorMount, {
  theme: theme.current(),
  onChange: (content) => {
    if (!selection.selectedProject || !selection.selectedFile) return;
    documentSession.edit(
      selection.selectedProject,
      selection.selectedFile,
      content,
    );
    if (selection.selectedFile === ENTRY_FILE) {
      refreshStageTitle();
      // Editing the problem's line clears its mark in the editor.
      if (currentProblem && !editor.hasProblem()) {
        currentProblem = null;
        refreshChrome();
      }
    }
  },
  onSaveShortcut: () => {
    void flushSave();
  },
  onFixApplied: () => {
    toast("Changed it. Press Play to try your game again.");
  },
});
theme.subscribe((nextTheme) => editor.setTheme(nextTheme));
saveButton.addEventListener("click", () => void flushSave());

initPanelResizers(root);

/** Opens ENTRY_FILE if another file is open, then puts the cursor on `line`. */
async function showLine(line: number): Promise<void> {
  if (selection.selectedFile !== ENTRY_FILE) await selectFile(ENTRY_FILE);
  if (selection.selectedFile === ENTRY_FILE) editor.revealLine(line);
}

function clearProblem(): void {
  currentProblem = null;
  editor.showProblem(null);
  refreshChrome();
}

function noteProblem(message: string, line: number | undefined): void {
  if (line === undefined || currentProblem) return;
  currentProblem = { line, details: describeProblem(message) };
  if (selection.selectedFile === ENTRY_FILE) {
    editor.showProblem(currentProblem);
  }
  refreshChrome();
}

const messages = createMessagesPanel(previewRoot, {
  onShowLine: (line) => void showLine(line),
  onClear: clearProblem,
});

function addDiagnostic(diagnostic: Diagnostic): void {
  diagnostics = [...diagnostics, diagnostic];
  messages.setDiagnostics(diagnostics);
  if (diagnostic.severity === "error") {
    noteProblem(diagnostic.message, diagnostic.line);
  }
}

const preview = createPreview(previewRoot, {
  ...(root.dataset.jgzPreviewOrigin
    ? { previewOrigin: root.dataset.jgzPreviewOrigin }
    : {}),
  onMessage: (message) => {
    if (message.type === "console") {
      messages.appendConsole({ level: message.level, text: message.text });
    } else if (message.type === "diagnostic") {
      addDiagnostic(message.diagnostic);
    } else if (message.type === "runtime-error") {
      addDiagnostic(
        message.line === undefined
          ? { severity: "error", message: message.message }
          : { severity: "error", message: message.message, line: message.line },
      );
    }
  },
  onPlayRequested: () => {
    void (async () => {
      if (!selection.selectedProject) return;
      if (!(await flushSave())) return;
      resetRun();
      preview.play(selection.selectedProject);
    })();
  },
  onRestartRequested: () => {
    void (async () => {
      if (!(await flushSave())) return;
      resetRun();
      preview.restart();
    })();
  },
  onShowLine: (line) => void showLine(line),
});

/** A new run starts with no messages and no problem. */
function resetRun(): void {
  diagnostics = [];
  messages.clear();
  clearProblem();
}

function currentProjectSummary(): ProjectSummary | null {
  return (
    projects.find((project) => project.name === selection.selectedProject) ??
    null
  );
}

function currentCodeFiles(): string[] {
  const project = currentProjectSummary();
  return project
    ? project.files.filter((path) => !isAssetPath(path)).sort()
    : [];
}

function refreshChrome(): void {
  const project = currentProjectSummary();
  projectMenu.update({ projects, selectedProject: selection.selectedProject });
  fileTabs.update({
    project,
    selectedFile: selection.selectedFile,
    problemFile: currentProblem ? ENTRY_FILE : null,
  });
  assetPanel.update(project);
}

function existingNames(): string[] {
  return projects.map((project) => project.name);
}

async function remixExample(example: ExampleSummary): Promise<void> {
  const name = await promptExampleName(example, existingNames());
  if (name) await createAndSelectProject(name, example.slug);
}

async function openGallery(): Promise<void> {
  const choice = await openExampleGallery(examples, existingNames());
  if (choice) await createAndSelectProject(choice.name, choice.slug);
}

function refreshWorkspaceVisibility(): void {
  const welcoming = projects.length === 0;
  welcomeEl.hidden = !welcoming;
  shellEl.hidden = welcoming;
  if (welcoming) {
    renderWelcome(welcomeEl, examples, {
      onBlank: () => {
        void (async () => {
          const name = await promptBlankProjectName(existingNames());
          if (name) await createAndSelectProject(name);
        })();
      },
      onAllExamples: () => void openGallery(),
      onExample: (example) => void remixExample(example),
    });
  } else {
    // The welcome screen's buttons share names with the "New game"
    // dialog's, so it only exists while it's showing.
    welcomeEl.replaceChildren();
  }

  const hasFile = Boolean(selection.selectedProject && selection.selectedFile);
  editorMount.hidden = !hasFile;
  codeEmptyEl.hidden = hasFile || !selection.selectedProject;
  if (!hasFile && selection.selectedProject) {
    codeEmptyEl.replaceChildren(
      h("p", { text: "This game has no code yet." }),
      h(
        "button",
        {
          className: "btn btn-secondary",
          attrs: { type: "button" },
          onClick: () => newFileButton.click(),
        },
        [icon("plus", 18), "New file"],
      ),
    );
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
    toast(`Made "${project.name}". Press Play to try it!`);
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
    if (selected.path === ENTRY_FILE && currentProblem) {
      editor.showProblem(currentProblem);
    }
    setSaveState("saved");
    refreshStageTitle();
    refreshChrome();
    refreshWorkspaceVisibility();
  } catch (error) {
    toast(errorMessage(error), "error");
  }
}

async function selectProject(name: string): Promise<void> {
  if (!(await selection.selectProject(name))) return;
  diagnostics = [];
  messages.clear();
  currentProblem = null;
  try {
    localStorage.setItem(LAST_PROJECT_KEY, name);
  } catch {
    // Remembering the last game is a convenience.
  }
  // A running preview belongs to whichever project started it. Switching to
  // a different project would otherwise leave a stale "Running" pill and
  // console output on screen for a game that's no longer the one you're
  // looking at, so stop it rather than show mismatched state.
  if (preview.isRunning() && preview.currentProject() !== name) {
    preview.stop();
  }
  preview.setSelectedProject(name);
  preview.setTitle(name);
  refreshChrome();
  refreshWorkspaceVisibility();
  const codeFiles = currentCodeFiles();
  const nextFile = codeFiles.includes(ENTRY_FILE) ? ENTRY_FILE : codeFiles[0];
  if (nextFile && selection.selectedProject === name)
    await selectFile(nextFile);
}

const projectMenu = createProjectMenu(root, {
  onSelectProject: (name) => void selectProject(name),
  onRequestNewProject: () => {
    void (async () => {
      const result = await chooseNewProjectFlow(examples, existingNames());
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
        // A running game would restart under the name it no longer has.
        if (preview.isRunning() && preview.currentProject() === name) {
          preview.stop();
        }
        await reloadProjects();
        if (selection.selectedProject === name) {
          selection.renameProject(name, nextName);
          try {
            localStorage.setItem(LAST_PROJECT_KEY, nextName);
          } catch {
            // Remembering the last game is a convenience.
          }
          preview.setSelectedProject(nextName);
          refreshStageTitle();
        }
        refreshChrome();
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
          if (preview.currentProject() === name) preview.stop();
          preview.setSelectedProject(null);
          const next = projects[0]?.name ?? null;
          if (next) {
            await selectProject(next);
          } else {
            refreshChrome();
            refreshWorkspaceVisibility();
          }
        } else {
          refreshChrome();
        }
      } catch (error) {
        toast(errorMessage(error), "error");
      }
    })();
  },
});

const fileTabs = createFileTabs(root, {
  onSelectFile: (path) => void selectFile(path),
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
          refreshChrome();
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
            refreshChrome();
            refreshWorkspaceVisibility();
          }
        } else {
          refreshChrome();
        }
      } catch (error) {
        toast(errorMessage(error), "error");
      }
    })();
  },
});

const assetPanel = createAssetPanel(root, {
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
        refreshChrome();
        toast(
          files.length === 1
            ? `Added ${files[0]?.name ?? "1 file"}.`
            : `Added ${files.length} files.`,
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
        refreshChrome();
      } catch (error) {
        toast(errorMessage(error), "error");
      }
    })();
  },
});

openExamplesButton.addEventListener("click", () => void openGallery());

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
  refreshChrome();
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    // Without storage, open the first game.
  }
  const initial =
    projects.find((p) => p.name === last)?.name ?? projects[0]?.name ?? null;
  if (initial) {
    await selectProject(initial);
  } else {
    refreshWorkspaceVisibility();
  }
  document.body.dataset.jgzReady = "true";
}

void bootstrap();
