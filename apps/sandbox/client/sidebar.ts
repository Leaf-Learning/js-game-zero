import { assetSourceUrl } from "./api";
import { confirmDialog, promptDialog } from "./dialogs";
import { delegate, h, qs, validateProjectName } from "./dom";
import {
  assetKindOf,
  isAssetPath,
  type AssetDirectory,
  type ProjectSummary,
} from "./types";

export type SidebarState = {
  readonly projects: readonly ProjectSummary[];
  readonly selectedProject: string | null;
  readonly selectedFile: string | null;
};

export type SidebarCallbacks = {
  readonly onSelectProject: (name: string) => void;
  readonly onSelectFile: (path: string) => void;
  readonly onRequestNewProject: () => void;
  readonly onRequestRenameProject: (name: string, nextName: string) => void;
  readonly onRequestDeleteProject: (name: string) => void;
  readonly onRequestCreateFile: (path: string) => void;
  readonly onRequestRenameFile: (path: string, nextPath: string) => void;
  readonly onRequestDeleteFile: (path: string) => void;
  readonly onUploadFiles: (kind: AssetDirectory, files: FileList) => void;
  readonly onRequestDeleteAsset: (path: string) => void;
};

const FILENAME_PATTERN = /^[A-Za-z0-9._/-]+$/;

function validateFileName(
  value: string,
  existing: readonly string[],
): string | null {
  if (value.length === 0) return "Give the file a name first.";
  if (!FILENAME_PATTERN.test(value)) {
    return "File names can use letters, numbers, dots, dashes, underscores, and slashes.";
  }
  if (value.startsWith("/") || value.includes("..")) {
    return "File names can't start with / or contain ..";
  }
  if (isAssetPath(value)) {
    return "That folder is for uploaded assets — use the Assets section below instead.";
  }
  if (existing.includes(value)) return "A file with that name already exists.";
  return null;
}

function inferAssetKind(file: File): AssetDirectory {
  if (file.type.startsWith("image/")) return "images";
  if (file.type.startsWith("audio/")) {
    return file.name.toLowerCase().includes("music") ? "music" : "sounds";
  }
  if (file.type.startsWith("font/") || /\.(woff2?|ttf|otf)$/i.test(file.name)) {
    return "fonts";
  }
  return "images";
}

export type SidebarHandle = {
  update(state: SidebarState): void;
};

export function createSidebar(
  root: HTMLElement,
  callbacks: SidebarCallbacks,
): SidebarHandle {
  const projectList = qs<HTMLUListElement>(root, "[data-jgz-project-list]");
  const projectEmpty = qs<HTMLParagraphElement>(
    root,
    "[data-jgz-project-empty]",
  );
  const fileSection = qs<HTMLDivElement>(root, "[data-jgz-file-section]");
  const fileList = qs<HTMLUListElement>(root, "[data-jgz-file-list]");
  const assetSection = qs<HTMLDivElement>(root, "[data-jgz-asset-section]");
  const assetGrid = qs<HTMLUListElement>(root, "[data-jgz-asset-grid]");
  const newProjectButton = qs<HTMLButtonElement>(
    root,
    "[data-jgz-new-project]",
  );
  const newFileButton = qs<HTMLButtonElement>(root, "[data-jgz-new-file]");
  const uploadKind = qs<HTMLSelectElement>(root, "[data-jgz-asset-kind]");
  const uploadInput = qs<HTMLInputElement>(root, "[data-jgz-asset-file]");
  const dropZone = qs<HTMLDivElement>(root, "[data-jgz-asset-drop]");

  let latest: SidebarState = {
    projects: [],
    selectedProject: null,
    selectedFile: null,
  };

  newProjectButton.addEventListener("click", () =>
    callbacks.onRequestNewProject(),
  );

  newFileButton.addEventListener("click", () => {
    void (async () => {
      const project = currentProject();
      if (!project) return;
      const value = await promptDialog({
        title: "New file",
        body: "Files live inside your project, for example levels/level1.js.",
        placeholder: "main.js",
        confirmLabel: "Create file",
        validate: (candidate) => validateFileName(candidate, project.files),
      });
      if (value) callbacks.onRequestCreateFile(value);
    })();
  });

  uploadInput.addEventListener("change", () => {
    if (!uploadInput.files || uploadInput.files.length === 0) return;
    callbacks.onUploadFiles(
      uploadKind.value as AssetDirectory,
      uploadInput.files,
    );
    uploadInput.value = "";
  });

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drop-zone-active");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drop-zone-active");
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("drop-zone-active");
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const byKind = new Map<AssetDirectory, File[]>();
    for (const file of Array.from(files)) {
      const kind = inferAssetKind(file);
      const bucket = byKind.get(kind) ?? [];
      bucket.push(file);
      byKind.set(kind, bucket);
    }
    for (const [kind, kindFiles] of byKind) {
      const transfer = new DataTransfer();
      for (const file of kindFiles) transfer.items.add(file);
      callbacks.onUploadFiles(kind, transfer.files);
    }
  });

  function currentProject(): ProjectSummary | null {
    return (
      latest.projects.find(
        (project) => project.name === latest.selectedProject,
      ) ?? null
    );
  }

  delegate(projectList, "click", "[data-jgz-project]", (_event, target) => {
    const name = target.dataset.jgzProject;
    if (name) callbacks.onSelectProject(name);
  });
  delegate(
    projectList,
    "click",
    "[data-jgz-project-rename]",
    (event, target) => {
      event.stopPropagation();
      const name = target.dataset.jgzProjectRename;
      if (!name) return;
      void (async () => {
        const others = latest.projects
          .map((p) => p.name)
          .filter((n) => n !== name);
        const value = await promptDialog({
          title: `Rename "${name}"`,
          initialValue: name,
          confirmLabel: "Rename",
          validate: (candidate) => validateProjectName(candidate, others),
        });
        if (value && value !== name)
          callbacks.onRequestRenameProject(name, value);
      })();
    },
  );
  delegate(
    projectList,
    "click",
    "[data-jgz-project-delete]",
    (event, target) => {
      event.stopPropagation();
      const name = target.dataset.jgzProjectDelete;
      if (!name) return;
      void (async () => {
        const ok = await confirmDialog({
          title: `Delete "${name}"?`,
          body: "This removes the project and every file inside it. This can't be undone.",
          confirmLabel: "Delete project",
          danger: true,
        });
        if (ok) callbacks.onRequestDeleteProject(name);
      })();
    },
  );

  delegate(fileList, "click", "[data-jgz-file]", (_event, target) => {
    const path = target.dataset.jgzFile;
    if (path) callbacks.onSelectFile(path);
  });
  delegate(fileList, "click", "[data-jgz-file-rename]", (event, target) => {
    event.stopPropagation();
    const path = target.dataset.jgzFileRename;
    const project = currentProject();
    if (!path || !project) return;
    void (async () => {
      const others = project.files.filter((f) => f !== path);
      const value = await promptDialog({
        title: `Rename "${path}"`,
        initialValue: path,
        confirmLabel: "Rename",
        validate: (candidate) => validateFileName(candidate, others),
      });
      if (value && value !== path) callbacks.onRequestRenameFile(path, value);
    })();
  });
  delegate(fileList, "click", "[data-jgz-file-delete]", (event, target) => {
    event.stopPropagation();
    const path = target.dataset.jgzFileDelete;
    if (!path) return;
    void (async () => {
      const ok = await confirmDialog({
        title: `Delete "${path}"?`,
        body: "This can't be undone.",
        confirmLabel: "Delete file",
        danger: true,
      });
      if (ok) callbacks.onRequestDeleteFile(path);
    })();
  });

  delegate(assetGrid, "click", "[data-jgz-asset-delete]", (event, target) => {
    event.stopPropagation();
    const path = target.dataset.jgzAssetDelete;
    if (!path) return;
    void (async () => {
      const ok = await confirmDialog({
        title: `Delete "${path}"?`,
        body: "This removes the file from disk. This can't be undone.",
        confirmLabel: "Delete asset",
        danger: true,
      });
      if (ok) callbacks.onRequestDeleteAsset(path);
    })();
  });

  function renderProjects(state: SidebarState): void {
    projectEmpty.hidden = state.projects.length > 0;
    projectList.replaceChildren(
      ...state.projects.map((project) => {
        const active = project.name === state.selectedProject;
        return h("li", { className: "row-item" }, [
          h(
            "button",
            {
              className: "row-button",
              attrs: {
                type: "button",
                "aria-pressed": String(active),
                "data-jgz-project": project.name,
              },
            },
            [
              h("span", { className: "row-icon", text: "\u{1F3AE}" }),
              h("span", { className: "row-label", text: project.name }),
            ],
          ),
          h("span", { className: "row-actions" }, [
            h("button", {
              className: "icon-button",
              text: "✎",
              attrs: {
                type: "button",
                title: "Rename project",
                "aria-label": `Rename ${project.name}`,
                "data-jgz-project-rename": project.name,
              },
            }),
            h("button", {
              className: "icon-button icon-button-danger",
              text: "✕",
              attrs: {
                type: "button",
                title: "Delete project",
                "aria-label": `Delete ${project.name}`,
                "data-jgz-project-delete": project.name,
              },
            }),
          ]),
        ]);
      }),
    );
  }

  function renderFiles(
    state: SidebarState,
    project: ProjectSummary | null,
  ): void {
    const hasProject = project !== null;
    fileSection.hidden = !hasProject;
    if (!project) {
      fileList.replaceChildren();
      return;
    }
    const codeFiles = project.files.filter((path) => !isAssetPath(path)).sort();
    fileList.replaceChildren(
      ...codeFiles.map((path) => {
        const active = path === state.selectedFile;
        return h("li", { className: "row-item" }, [
          h(
            "button",
            {
              className: "row-button",
              attrs: {
                type: "button",
                "aria-pressed": String(active),
                "data-jgz-file": path,
              },
            },
            [
              h("span", { className: "row-icon", text: "\u{1F4C4}" }),
              h("span", { className: "row-label", text: path }),
            ],
          ),
          h("span", { className: "row-actions" }, [
            h("button", {
              className: "icon-button",
              text: "✎",
              attrs: {
                type: "button",
                title: "Rename file",
                "aria-label": `Rename ${path}`,
                "data-jgz-file-rename": path,
              },
            }),
            h("button", {
              className: "icon-button icon-button-danger",
              text: "✕",
              attrs: {
                type: "button",
                title: "Delete file",
                "aria-label": `Delete ${path}`,
                "data-jgz-file-delete": path,
              },
            }),
          ]),
        ]);
      }),
    );
  }

  function renderAssets(project: ProjectSummary | null): void {
    const hasProject = project !== null;
    assetSection.hidden = !hasProject;
    if (!project) {
      assetGrid.replaceChildren();
      return;
    }
    const assets = project.files.filter(isAssetPath).sort();
    if (assets.length === 0) {
      assetGrid.replaceChildren(
        h("li", {
          className: "asset-empty",
          text: "No assets yet. Drop images or sounds above.",
        }),
      );
      return;
    }
    assetGrid.replaceChildren(
      ...assets.map((path) => {
        const kind = assetKindOf(path);
        const url = assetSourceUrl(project.name, path);
        const preview =
          kind === "images"
            ? h("img", {
                className: "asset-thumb",
                attrs: { src: url, alt: path, loading: "lazy" },
              })
            : kind === "sounds" || kind === "music"
              ? h("audio", {
                  className: "asset-audio",
                  attrs: { controls: true, src: url, preload: "none" },
                })
              : h("span", { className: "asset-icon", text: "\u{1F520}" });
        return h(
          "li",
          { className: "asset-row", attrs: { "data-jgz-asset": path } },
          [
            preview,
            h("span", {
              className: "asset-name",
              text: path.split("/").slice(1).join("/"),
            }),
            h("button", {
              className: "icon-button icon-button-danger",
              text: "✕",
              attrs: {
                type: "button",
                title: "Delete asset",
                "aria-label": `Delete ${path}`,
                "data-jgz-asset-delete": path,
              },
            }),
          ],
        );
      }),
    );
  }

  return {
    update(state: SidebarState): void {
      latest = state;
      const project =
        state.projects.find((p) => p.name === state.selectedProject) ?? null;
      renderProjects(state);
      renderFiles(state, project);
      renderAssets(project);
    },
  };
}
