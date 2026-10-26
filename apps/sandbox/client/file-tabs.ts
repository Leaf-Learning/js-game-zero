import { confirmDialog, promptDialog } from "./dialogs";
import { delegate, h, qs } from "./dom";
import { icon } from "./icons";
import { openMenu } from "./popover";
import { isAssetPath, type ProjectSummary } from "./types";

export type FileTabsState = {
  readonly project: ProjectSummary | null;
  readonly selectedFile: string | null;
  /** The file a problem was found in, which gets a red dot. */
  readonly problemFile: string | null;
};

export type FileTabsCallbacks = {
  readonly onSelectFile: (path: string) => void;
  readonly onRequestCreateFile: (path: string) => void;
  readonly onRequestRenameFile: (path: string, nextPath: string) => void;
  readonly onRequestDeleteFile: (path: string) => void;
};

export type FileTabsHandle = {
  update(state: FileTabsState): void;
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
    return "That folder is for images, sounds, music and fonts. Add those from the bar on the left instead.";
  }
  if (existing.includes(value)) return "A file with that name already exists.";
  return null;
}

/** The code files of the open game, one tab each, with + for a new file. */
export function createFileTabs(
  root: HTMLElement,
  callbacks: FileTabsCallbacks,
): FileTabsHandle {
  const tabs = qs<HTMLDivElement>(root, "[data-jgz-file-list]");
  const newFileButton = qs<HTMLButtonElement>(root, "[data-jgz-new-file]");
  let latest: FileTabsState = {
    project: null,
    selectedFile: null,
    problemFile: null,
  };

  async function renameFile(path: string): Promise<void> {
    const others = latest.project?.files.filter((file) => file !== path) ?? [];
    const value = await promptDialog({
      title: `Rename "${path}"`,
      initialValue: path,
      confirmLabel: "Rename",
      validate: (candidate) => validateFileName(candidate, others),
    });
    if (value && value !== path) callbacks.onRequestRenameFile(path, value);
  }

  async function deleteFile(path: string): Promise<void> {
    const ok = await confirmDialog({
      title: `Delete "${path}"?`,
      body: "This can't be undone.",
      confirmLabel: "Delete file",
      danger: true,
    });
    if (ok) callbacks.onRequestDeleteFile(path);
  }

  newFileButton.addEventListener("click", () => {
    void (async () => {
      const project = latest.project;
      if (!project) return;
      const value = await promptDialog({
        title: "New file",
        body: "Your game runs main.js. Another file is a good place for notes or for trying out a different version.",
        placeholder: "notes.js",
        confirmLabel: "Create file",
        validate: (candidate) => validateFileName(candidate, project.files),
      });
      if (value) callbacks.onRequestCreateFile(value);
    })();
  });

  delegate(tabs, "click", "[data-jgz-file]", (_event, target) => {
    const path = target.dataset.jgzFile;
    if (path) callbacks.onSelectFile(path);
  });

  delegate(tabs, "click", "[data-jgz-file-menu]", (_event, target) => {
    const path = target.dataset.jgzFileMenu;
    if (!path) return;
    openMenu(target, [
      {
        label: "Rename",
        icon: "pencil",
        attrs: { "data-jgz-file-rename": path },
        onSelect: () => void renameFile(path),
      },
      {
        label: "Delete",
        icon: "trash",
        danger: true,
        attrs: { "data-jgz-file-delete": path },
        onSelect: () => void deleteFile(path),
      },
    ]);
  });

  function render(): void {
    const { project, selectedFile, problemFile } = latest;
    const files = project
      ? project.files.filter((path) => !isAssetPath(path)).sort()
      : [];
    tabs.replaceChildren(
      ...files.map((path) => {
        const active = path === selectedFile;
        return h(
          "div",
          { className: active ? "file-tab file-tab-active" : "file-tab" },
          [
            h(
              "button",
              {
                className: "file-tab-main",
                attrs: {
                  type: "button",
                  "aria-current": active ? "page" : undefined,
                  "data-jgz-file": path,
                },
              },
              [
                icon("file", 16),
                h("span", {
                  className: "file-tab-name",
                  text: path,
                  attrs: active ? { "data-jgz-selected-file": "" } : {},
                }),
                ...(path === problemFile
                  ? [
                      h("span", {
                        className: "file-tab-problem",
                        attrs: { title: "This file has a problem" },
                      }),
                      h("span", {
                        className: "visually-hidden",
                        text: "(has a problem)",
                      }),
                    ]
                  : []),
              ],
            ),
            ...(active
              ? [
                  h(
                    "button",
                    {
                      className: "file-tab-more",
                      attrs: {
                        type: "button",
                        title: "Rename or delete",
                        "aria-label": `Rename or delete ${path}`,
                        "aria-haspopup": "menu",
                        "data-jgz-file-menu": path,
                      },
                    },
                    [icon("more", 18)],
                  ),
                ]
              : []),
          ],
        );
      }),
    );
  }

  return {
    update(state: FileTabsState): void {
      latest = state;
      render();
    },
  };
}
