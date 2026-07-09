import { promptDialog } from "./dialogs";
import { h, qs, validateProjectName } from "./dom";
import type { ExampleSummary } from "./types";

const INPUT_LABEL: Record<ExampleSummary["expectsInput"], string> = {
  keyboard: "⌨ keyboard",
  mouse: "🖱 mouse",
  none: "▶ auto-plays",
};

function suggestedName(slug: string, existing: readonly string[]): string {
  const base = slug.replace(/-/g, "_");
  if (!existing.includes(base)) return base;
  let index = 2;
  while (existing.includes(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

export type ExampleChoice = { readonly slug: string; readonly name: string };

let galleryHost: HTMLDivElement | null = null;

function ensureGalleryHost(): HTMLDivElement {
  if (galleryHost) return galleryHost;
  galleryHost = h("div", {
    className: "dialog-host",
    attrs: { "data-jgz-example-gallery-host": "" },
  });
  document.body.append(galleryHost);
  return galleryHost;
}

export function openExampleGallery(
  examples: readonly ExampleSummary[],
  existingProjectNames: readonly string[],
): Promise<ExampleChoice | null> {
  return new Promise((resolve) => {
    const host = ensureGalleryHost();
    const finish = (result: ExampleChoice | null): void => {
      host.replaceChildren();
      resolve(result);
    };

    const cards = examples.map((example) =>
      h(
        "li",
        {
          className: "example-card",
          attrs: { "data-jgz-example-card": example.slug },
        },
        [
          h("h3", { text: example.title }),
          h("p", { text: example.description }),
          h("span", {
            className: "example-badge",
            text: INPUT_LABEL[example.expectsInput],
          }),
          h("button", {
            className: "btn btn-primary",
            text: "Use this example",
            attrs: { type: "button", "data-jgz-use-example": example.slug },
            onClick: () => {
              void (async () => {
                const name = await promptDialog({
                  title: `Name your "${example.title}" project`,
                  placeholder: "my_game",
                  initialValue: suggestedName(
                    example.slug,
                    existingProjectNames,
                  ),
                  confirmLabel: "Create project",
                  validate: (candidate) =>
                    validateProjectName(candidate, existingProjectNames),
                });
                if (name) finish({ slug: example.slug, name });
              })();
            },
          }),
        ],
      ),
    );

    const dialog = h(
      "div",
      {
        className: "dialog dialog-large",
        attrs: {
          role: "dialog",
          "aria-modal": "true",
          "data-jgz-example-gallery": "",
        },
      },
      [
        h("div", { className: "dialog-header" }, [
          h("h2", { text: "Start from an example" }),
          h("button", {
            className: "icon-button",
            text: "✕",
            attrs: { type: "button", "aria-label": "Close" },
            onClick: () => finish(null),
          }),
        ]),
        h("p", {
          className: "dialog-subtitle",
          text: "Pick a working game to explore and remix. Each one copies into a brand-new project of your own.",
        }),
        h("ul", { className: "example-grid" }, cards),
      ],
    );
    const backdrop = h("div", { className: "dialog-backdrop" });
    backdrop.addEventListener("click", () => finish(null));
    host.replaceChildren(backdrop, dialog);
  });
}

export type EmptyStateCallbacks = {
  readonly onBlank: () => void;
  readonly onExamples: () => void;
};

export function renderEmptyState(
  root: HTMLElement,
  callbacks: EmptyStateCallbacks,
): void {
  const container = qs<HTMLDivElement>(root, "[data-jgz-empty-state]");
  container.replaceChildren(
    h("div", { className: "empty-hero" }, [
      h("p", { className: "empty-kicker", text: "Welcome!" }),
      h("h1", { text: "Let's make a game" }),
      h("p", {
        className: "empty-copy",
        text: "Start from a working example and remix it, or begin with a blank project that already moves.",
      }),
      h("div", { className: "empty-actions" }, [
        h("button", {
          className: "btn btn-primary btn-large",
          text: "Start from an example",
          attrs: { type: "button", "data-jgz-start-example": "" },
          onClick: () => callbacks.onExamples(),
        }),
        h("button", {
          className: "btn btn-ghost btn-large",
          text: "Blank project",
          attrs: { type: "button", "data-jgz-blank-project": "" },
          onClick: () => callbacks.onBlank(),
        }),
      ]),
    ]),
  );
}

export function promptBlankProjectName(
  existing: readonly string[],
): Promise<string | null> {
  return promptDialog({
    title: "Name your project",
    placeholder: "my_game",
    confirmLabel: "Create project",
    validate: (candidate) => validateProjectName(candidate, existing),
  });
}

export async function chooseNewProjectFlow(
  examples: readonly ExampleSummary[],
  existing: readonly string[],
): Promise<{ readonly name: string; readonly exampleSlug?: string } | null> {
  const useExample = await confirmUseExample();
  if (useExample === null) return null;
  if (useExample) {
    const choice = await openExampleGallery(examples, existing);
    return choice ? { name: choice.name, exampleSlug: choice.slug } : null;
  }
  const name = await promptBlankProjectName(existing);
  return name ? { name } : null;
}

function confirmUseExample(): Promise<boolean | null> {
  return new Promise((resolve) => {
    const host = ensureGalleryHost();
    const finish = (result: boolean | null): void => {
      host.replaceChildren();
      resolve(result);
    };
    const dialog = h(
      "div",
      { className: "dialog", attrs: { role: "dialog", "aria-modal": "true" } },
      [
        h("h2", { text: "New project" }),
        h("p", { text: "How would you like to start?" }),
        h("div", { className: "dialog-actions dialog-actions-stack" }, [
          h("button", {
            className: "btn btn-primary",
            text: "Start from an example",
            attrs: { type: "button", "data-jgz-choose-example": "" },
            onClick: () => finish(true),
          }),
          h("button", {
            className: "btn btn-secondary",
            text: "Blank project",
            attrs: { type: "button", "data-jgz-choose-blank": "" },
            onClick: () => finish(false),
          }),
          h("button", {
            className: "btn btn-ghost",
            text: "Cancel",
            attrs: { type: "button" },
            onClick: () => finish(null),
          }),
        ]),
      ],
    );
    const backdrop = h("div", { className: "dialog-backdrop" });
    backdrop.addEventListener("click", () => finish(null));
    host.replaceChildren(backdrop, dialog);
  });
}
