import { confirmDialog, promptDialog } from "./dialogs";
import { delegate, h, qs, validateProjectName } from "./dom";
import { icon } from "./icons";
import { createPopover } from "./popover";
import type { ProjectSummary } from "./types";

export type ProjectMenuState = {
  readonly projects: readonly ProjectSummary[];
  readonly selectedProject: string | null;
};

export type ProjectMenuCallbacks = {
  readonly onSelectProject: (name: string) => void;
  readonly onRequestNewProject: () => void;
  readonly onRequestRenameProject: (name: string, nextName: string) => void;
  readonly onRequestDeleteProject: (name: string) => void;
};

export type ProjectMenuHandle = {
  update(state: ProjectMenuState): void;
};

/**
 * "My game ▾" in the top bar: the open game's name, and a menu of every
 * game to switch to, rename or delete, with "New game" at the bottom.
 */
export function createProjectMenu(
  root: HTMLElement,
  callbacks: ProjectMenuCallbacks,
): ProjectMenuHandle {
  const switcher = qs<HTMLElement>(root, "[data-jgz-project-switcher]");
  const button = qs<HTMLButtonElement>(root, "[data-jgz-project-menu-button]");
  const panel = qs<HTMLElement>(root, "[data-jgz-project-menu]");
  const currentName = qs<HTMLSpanElement>(root, "[data-jgz-current-project]");
  const list = qs<HTMLUListElement>(root, "[data-jgz-project-list]");
  const newProject = qs<HTMLButtonElement>(root, "[data-jgz-new-project]");

  let latest: ProjectMenuState = { projects: [], selectedProject: null };
  const popover = createPopover(button, panel, {
    initialFocus: () =>
      list.querySelector<HTMLElement>('[aria-current="true"]'),
  });

  newProject.addEventListener("click", () => {
    popover.close();
    callbacks.onRequestNewProject();
  });

  delegate(list, "click", "[data-jgz-project]", (_event, target) => {
    const name = target.dataset.jgzProject;
    if (!name) return;
    popover.close();
    callbacks.onSelectProject(name);
  });

  delegate(list, "click", "[data-jgz-project-rename]", (_event, target) => {
    const name = target.dataset.jgzProjectRename;
    if (!name) return;
    popover.close();
    void (async () => {
      const others = latest.projects
        .map((project) => project.name)
        .filter((other) => other !== name);
      const value = await promptDialog({
        title: `Rename "${name}"`,
        initialValue: name,
        confirmLabel: "Rename",
        validate: (candidate) => validateProjectName(candidate, others),
      });
      if (value && value !== name) {
        callbacks.onRequestRenameProject(name, value);
      }
    })();
  });

  delegate(list, "click", "[data-jgz-project-delete]", (_event, target) => {
    const name = target.dataset.jgzProjectDelete;
    if (!name) return;
    popover.close();
    void (async () => {
      const ok = await confirmDialog({
        title: `Delete "${name}"?`,
        body: "This removes the game and every file inside it. This can't be undone.",
        confirmLabel: "Delete game",
        danger: true,
      });
      if (ok) callbacks.onRequestDeleteProject(name);
    })();
  });

  function render(): void {
    const { projects, selectedProject } = latest;
    switcher.hidden = projects.length === 0;
    currentName.textContent = selectedProject ?? "Pick a game";
    button.setAttribute(
      "aria-label",
      selectedProject
        ? `My game: ${selectedProject}. Switch games`
        : "Pick a game",
    );
    list.replaceChildren(
      ...projects.map((project) => {
        const current = project.name === selectedProject;
        return h("li", { className: "project-row" }, [
          h(
            "button",
            {
              className: "project-row-main",
              attrs: {
                type: "button",
                "aria-current": current ? "true" : undefined,
                "data-jgz-project": project.name,
              },
            },
            [
              h("span", { className: "project-row-name", text: project.name }),
              ...(current ? [icon("check", 18)] : []),
            ],
          ),
          h(
            "button",
            {
              className: "icon-button",
              attrs: {
                type: "button",
                title: "Rename",
                "aria-label": `Rename ${project.name}`,
                "data-jgz-project-rename": project.name,
              },
            },
            [icon("pencil", 18)],
          ),
          h(
            "button",
            {
              className: "icon-button icon-button-danger",
              attrs: {
                type: "button",
                title: "Delete",
                "aria-label": `Delete ${project.name}`,
                "data-jgz-project-delete": project.name,
              },
            },
            [icon("trash", 18)],
          ),
        ]);
      }),
    );
  }

  return {
    update(state: ProjectMenuState): void {
      latest = state;
      render();
    },
  };
}
