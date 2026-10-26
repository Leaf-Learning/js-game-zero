import { promptDialog } from "./dialogs";
import { h, validateProjectName } from "./dom";
import { icon, type IconName } from "./icons";
import { logoMark } from "./logo";
import type { ExampleSummary } from "./types";

const INPUT: Record<
  ExampleSummary["expectsInput"],
  { readonly label: string; readonly icon: IconName }
> = {
  keyboard: { label: "Keyboard", icon: "keyboard" },
  mouse: { label: "Mouse", icon: "mouse" },
  none: { label: "Watch", icon: "watch" },
};

const GROUPS: readonly {
  readonly id: ExampleSummary["gallery"];
  readonly title: string;
  readonly note: string;
}[] = [
  {
    id: "start-here",
    title: "Start here",
    note: "Short programs that each show one idea.",
  },
  {
    id: "try-next",
    title: "Try next",
    note: "Sounds, and saving between visits.",
  },
  {
    id: "full-game",
    title: "Full games",
    note: "Whole games to play, read and change.",
  },
];

const SVG_NS = "http://www.w3.org/2000/svg";

function thumbnailUrl(slug: string): string {
  return `/client/thumbnails/${encodeURIComponent(slug)}.png`;
}

function suggestedName(slug: string, existing: readonly string[]): string {
  const base = slug.replace(/-/g, "_");
  if (!existing.includes(base)) return base;
  let index = 2;
  while (existing.includes(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function inputChip(example: ExampleSummary): HTMLElement {
  const input = INPUT[example.expectsInput];
  return h("span", { className: "input-chip" }, [
    icon(input.icon, 14),
    input.label,
  ]);
}

function exampleCard(
  example: ExampleSummary,
  attrs: Record<string, string>,
  withDescription: boolean,
  onPick: () => void,
): HTMLButtonElement {
  return h(
    "button",
    {
      className: "example-card",
      attrs: { type: "button", ...attrs },
      onClick: onPick,
    },
    [
      h("img", {
        className: "example-thumb",
        attrs: { src: thumbnailUrl(example.slug), alt: "", loading: "lazy" },
      }),
      h("span", { className: "example-title", text: example.title }),
      ...(withDescription
        ? [
            h("span", {
              className: "example-description",
              text: example.description,
            }),
          ]
        : []),
      inputChip(example),
    ],
  );
}

export type ExampleChoice = { readonly slug: string; readonly name: string };

/** Asks what to call a copy of `example`, suggesting its own name. */
export function promptExampleName(
  example: ExampleSummary,
  existing: readonly string[],
): Promise<string | null> {
  return promptDialog({
    title: `Name your copy of ${example.title}`,
    body: "Names use lowercase letters, numbers, - and _.",
    placeholder: "my_game",
    initialValue: suggestedName(example.slug, existing),
    confirmLabel: "Make my copy",
    validate: (candidate) => validateProjectName(candidate, existing),
  });
}

export function promptBlankProjectName(
  existing: readonly string[],
): Promise<string | null> {
  return promptDialog({
    title: "Name your game",
    body: "Names use lowercase letters, numbers, - and _.",
    placeholder: "my_game",
    confirmLabel: "Make my game",
    validate: (candidate) => validateProjectName(candidate, existing),
  });
}

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

/** Every example, grouped from first steps to whole games. Picking one asks
 * for a name and resolves to the copy to make. */
export function openExampleGallery(
  examples: readonly ExampleSummary[],
  existingProjectNames: readonly string[],
): Promise<ExampleChoice | null> {
  return new Promise((resolve) => {
    const host = ensureGalleryHost();
    const previousFocus = document.activeElement as HTMLElement | null;
    const finish = (result: ExampleChoice | null): void => {
      host.replaceChildren();
      if (!result) previousFocus?.focus();
      resolve(result);
    };
    const pick = (example: ExampleSummary): void => {
      void (async () => {
        const name = await promptExampleName(example, existingProjectNames);
        if (name) finish({ slug: example.slug, name });
      })();
    };

    const groups = GROUPS.map((group) => ({
      ...group,
      examples: examples.filter((example) => example.gallery === group.id),
    })).filter((group) => group.examples.length > 0);
    const groupSection = (group: (typeof groups)[number]): HTMLElement =>
      h(
        "section",
        {
          className: `gallery-group gallery-group-${group.id}`,
          attrs: { "aria-labelledby": `jgz-gallery-${group.id}` },
        },
        [
          h("div", { className: "gallery-group-heading" }, [
            h("h3", {
              text: group.title,
              attrs: { id: `jgz-gallery-${group.id}` },
            }),
            h("span", { text: group.note }),
          ]),
          h(
            "div",
            { className: "gallery-grid" },
            group.examples.map((example) =>
              exampleCard(
                example,
                { "data-jgz-use-example": example.slug },
                true,
                () => pick(example),
              ),
            ),
          ),
        ],
      );

    const closeButton = h(
      "button",
      {
        className: "icon-button icon-button-large",
        attrs: { type: "button", "aria-label": "Close" },
        onClick: () => finish(null),
      },
      [icon("close", 20)],
    );
    const dialog = h(
      "section",
      {
        className: "dialog gallery",
        attrs: {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "jgz-gallery-title",
          "data-jgz-example-gallery": "",
        },
      },
      [
        h("div", { className: "gallery-header" }, [
          h("div", {}, [
            h("h2", {
              text: "Pick a game to remix",
              attrs: { id: "jgz-gallery-title" },
            }),
            h("p", {
              text: "It copies into a new game of your own, so you can change anything without breaking the original.",
            }),
          ]),
          closeButton,
        ]),
        // The first steps sit side by side, with the full games below.
        h(
          "div",
          { className: "gallery-row" },
          groups.filter((group) => group.id !== "full-game").map(groupSection),
        ),
        ...groups.filter((group) => group.id === "full-game").map(groupSection),
      ],
    );
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish(null);
    });
    const backdrop = h("div", { className: "dialog-backdrop" });
    backdrop.addEventListener("click", () => finish(null));
    host.replaceChildren(
      backdrop,
      h("div", { className: "dialog-scroll" }, [dialog]),
    );
    closeButton.focus();
  });
}

function blankGamePreview(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 320 180");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "The blank game: a circle on a dark blue screen, with the words Use the arrow keys!",
  );
  svg.classList.add("blank-preview");
  svg.innerHTML =
    '<rect width="320" height="180" fill="#132436"/>' +
    '<circle cx="60" cy="90" r="20" fill="#7dd8c6"/>' +
    '<text x="20" y="33" fill="#ffffff" font-family="system-ui, sans-serif" font-size="16">Use the arrow keys!</text>';
  return svg;
}

export type WelcomeCallbacks = {
  readonly onBlank: () => void;
  readonly onAllExamples: () => void;
  readonly onExample: (example: ExampleSummary) => void;
};

/** The first screen, before there are any games: remix an example, or
 * start from the blank game. */
export function renderWelcome(
  container: HTMLElement,
  examples: readonly ExampleSummary[],
  callbacks: WelcomeCallbacks,
): void {
  const firstSteps = examples
    .filter((example) => example.gallery === "start-here")
    .slice(0, 3);
  container.replaceChildren(
    h("div", { className: "welcome-inner" }, [
      h("div", { className: "welcome-hero" }, [
        logoMark(112, "full"),
        h("h1", { text: "Let's make a game!" }),
        h("p", {
          text: "Start from a game that already works and change it, or start from a blank one that already moves.",
        }),
      ]),
      h("div", { className: "welcome-cards" }, [
        h("section", { className: "welcome-card welcome-card-remix" }, [
          h("div", { className: "welcome-card-heading" }, [
            h("h2", { text: "Remix an example" }),
            h("p", {
              text: "Each one copies into a new game of your own, so you can change anything.",
            }),
          ]),
          h(
            "div",
            { className: "welcome-examples" },
            firstSteps.map((example) =>
              exampleCard(
                example,
                { "data-jgz-welcome-example": example.slug },
                false,
                () => callbacks.onExample(example),
              ),
            ),
          ),
          h(
            "button",
            {
              className: "link-button",
              attrs: { type: "button", "data-jgz-choose-example": "" },
              onClick: () => callbacks.onAllExamples(),
            },
            [`See all ${examples.length} examples`, icon("arrow-right", 18)],
          ),
        ]),
        h("section", { className: "welcome-card welcome-card-blank" }, [
          h("div", { className: "welcome-card-heading" }, [
            h("h2", { text: "Start from blank" }),
            h("p", {
              text: "A circle you move with the arrow keys. Make it yours.",
            }),
          ]),
          blankGamePreview(),
          h(
            "button",
            {
              className: "btn btn-primary btn-large",
              attrs: { type: "button", "data-jgz-choose-blank": "" },
              onClick: () => callbacks.onBlank(),
            },
            [icon("plus", 20), "Make a blank game"],
          ),
        ]),
      ]),
      h("p", { className: "welcome-footer" }, [
        "New to JavaScript? ",
        h("a", {
          text: "The tutorial",
          attrs: {
            href: "/docs?page=tutorial",
            target: "_blank",
            rel: "noopener",
          },
        }),
        " walks you through your first game, one step at a time.",
      ]),
    ]),
  );
}

/** "New game", once there are games: the welcome screen's two choices in a
 * dialog. Resolves to what to make, or null if cancelled. */
export function chooseNewProjectFlow(
  examples: readonly ExampleSummary[],
  existing: readonly string[],
): Promise<{ readonly name: string; readonly exampleSlug?: string } | null> {
  return new Promise((resolve) => {
    const host = ensureGalleryHost();
    const previousFocus = document.activeElement as HTMLElement | null;
    const close = (): void => {
      host.replaceChildren();
    };
    const cancel = (): void => {
      close();
      previousFocus?.focus();
      resolve(null);
    };
    const choice = (
      iconName: IconName,
      title: string,
      body: string,
      attr: string,
      onPick: () => void,
    ): HTMLButtonElement =>
      h(
        "button",
        {
          className: "choice-card",
          attrs: { type: "button", [attr]: "" },
          onClick: onPick,
        },
        [
          h("span", { className: "choice-card-icon" }, [icon(iconName, 24)]),
          h("span", { className: "choice-card-title", text: title }),
          h("span", { className: "choice-card-body", text: body }),
        ],
      );
    const dialog = h(
      "div",
      {
        className: "dialog dialog-choice",
        attrs: {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "jgz-new-game-title",
        },
      },
      [
        h("h2", {
          text: "Make a new game",
          attrs: { id: "jgz-new-game-title" },
        }),
        h("div", { className: "choice-cards" }, [
          choice(
            "grid",
            "Remix an example",
            "Copy a game that already works, then change it.",
            "data-jgz-choose-example",
            () => {
              close();
              void openExampleGallery(examples, existing).then((picked) =>
                resolve(
                  picked
                    ? { name: picked.name, exampleSlug: picked.slug }
                    : null,
                ),
              );
            },
          ),
          choice(
            "plus",
            "Start from blank",
            "A circle you move with the arrow keys.",
            "data-jgz-choose-blank",
            () => {
              close();
              void promptBlankProjectName(existing).then((name) =>
                resolve(name ? { name } : null),
              );
            },
          ),
        ]),
        h("div", { className: "dialog-actions" }, [
          h("button", {
            className: "btn btn-ghost",
            text: "Cancel",
            attrs: { type: "button" },
            onClick: cancel,
          }),
        ]),
      ],
    );
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") cancel();
    });
    const backdrop = h("div", { className: "dialog-backdrop" });
    backdrop.addEventListener("click", cancel);
    host.replaceChildren(backdrop, dialog);
    dialog.querySelector<HTMLButtonElement>(".choice-card")?.focus();
  });
}
