import { assetSourceUrl } from "./api";
import { confirmDialog } from "./dialogs";
import { delegate, h, qs } from "./dom";
import { icon } from "./icons";
import {
  ASSET_DIRECTORIES,
  assetKindOf,
  type AssetDirectory,
  type ProjectSummary,
} from "./types";

const PANEL_KEY = "jgz-sandbox:asset-panel";

type KindText = {
  readonly title: string;
  readonly noun: string;
  readonly types: string;
  readonly accept: string;
  readonly fallbackName: string;
  readonly hint: (name: string) => readonly (Node | string)[];
};

const KINDS: Record<AssetDirectory, KindText> = {
  images: {
    title: "Images",
    noun: "images",
    types: "PNG, JPG, GIF, WebP, BMP or SVG",
    accept: "image/*,.svg",
    fallbackName: "gem",
    hint: (name) => [
      "Use an image by its name, without the ending: ",
      h("code", { text: `new Actor("${name}")` }),
    ],
  },
  sounds: {
    title: "Sounds",
    noun: "sounds",
    types: "WAV, OGG, MP3 or M4A",
    accept: "audio/*,.ogg,.wav,.mp3,.m4a",
    fallbackName: "jump",
    hint: (name) => [
      "Play a sound by its name: ",
      h("code", { text: `sounds.${name}.play()` }),
    ],
  },
  music: {
    title: "Music",
    noun: "music",
    types: "WAV, OGG, MP3 or M4A",
    accept: "audio/*,.ogg,.wav,.mp3,.m4a",
    fallbackName: "theme",
    hint: (name) => [
      "Music plays over and over: ",
      h("code", { text: `music.play("${name}")` }),
    ],
  },
  fonts: {
    title: "Fonts",
    noun: "fonts",
    types: "TTF, OTF, WOFF or WOFF2",
    accept: ".ttf,.otf,.woff,.woff2",
    fallbackName: "pixel",
    hint: (name) => [
      "Write with a font by its name: ",
      h("code", {
        text: `screen.draw.text("Hi!", [20, 20], { fontname: "${name}" })`,
      }),
    ],
  },
};

/** What code calls an asset: its path inside its folder, without the
 * ending. `images/levels/forest.png` is `levels/forest`. */
function nameInCode(path: string): string {
  return path
    .split("/")
    .slice(1)
    .join("/")
    .replace(/\.[^./]+$/, "");
}

/** Asset names are lowercase letters, digits and _, starting with a letter. */
function usableInCode(path: string): boolean {
  return nameInCode(path)
    .split("/")
    .every((segment) => /^[a-z][a-z0-9_]*$/.test(segment));
}

function inferAssetKind(file: File, fallback: AssetDirectory): AssetDirectory {
  if (file.type.startsWith("image/") || /\.svg$/i.test(file.name)) {
    return "images";
  }
  if (file.type.startsWith("font/") || /\.(woff2?|ttf|otf)$/i.test(file.name)) {
    return "fonts";
  }
  if (
    file.type.startsWith("audio/") ||
    /\.(ogg|wav|mp3|m4a)$/i.test(file.name)
  ) {
    if (fallback === "sounds" || fallback === "music") return fallback;
    return file.name.toLowerCase().includes("music") ? "music" : "sounds";
  }
  return fallback;
}

function storedKind(): AssetDirectory | null {
  try {
    const value = localStorage.getItem(PANEL_KEY);
    return (ASSET_DIRECTORIES as readonly string[]).includes(value ?? "")
      ? (value as AssetDirectory)
      : null;
  } catch {
    return null;
  }
}

export type AssetPanelCallbacks = {
  readonly onUploadFiles: (kind: AssetDirectory, files: FileList) => void;
  readonly onRequestDeleteAsset: (path: string) => void;
};

export type AssetPanelHandle = {
  update(project: ProjectSummary | null): void;
  open(kind: AssetDirectory): void;
};

/**
 * The bar down the left (Code, Images, Sounds, Music, Fonts) and the panel
 * it opens for each kind of asset: how to use one in code, a place to drop
 * new files, and the ones the game already has.
 */
export function createAssetPanel(
  root: HTMLElement,
  callbacks: AssetPanelCallbacks,
): AssetPanelHandle {
  const shell = qs<HTMLElement>(root, "[data-jgz-app-shell]");
  const rail = qs<HTMLElement>(root, "[data-jgz-rail]");
  const panel = qs<HTMLElement>(root, "[data-jgz-asset-panel]");
  const title = qs<HTMLHeadingElement>(root, "[data-jgz-asset-title]");
  const closeButton = qs<HTMLButtonElement>(root, "[data-jgz-asset-close]");
  const hint = qs<HTMLParagraphElement>(root, "[data-jgz-asset-hint]");
  const dropZone = qs<HTMLDivElement>(root, "[data-jgz-asset-drop]");
  const dropTitle = qs<HTMLSpanElement>(root, "[data-jgz-drop-title]");
  const dropTypes = qs<HTMLSpanElement>(root, "[data-jgz-drop-types]");
  const input = qs<HTMLInputElement>(root, "[data-jgz-asset-file]");
  const grid = qs<HTMLUListElement>(root, "[data-jgz-asset-grid]");

  let project: ProjectSummary | null = null;
  let openKind: AssetDirectory | null = storedKind();
  let playing: {
    readonly path: string;
    readonly audio: HTMLAudioElement;
  } | null = null;
  const fontFamilies = new Map<string, string>();

  function remember(): void {
    try {
      if (openKind) localStorage.setItem(PANEL_KEY, openKind);
      else localStorage.removeItem(PANEL_KEY);
    } catch {
      // Remembering the open panel is a convenience.
    }
  }

  function setOpen(kind: AssetDirectory | null): void {
    openKind = kind;
    remember();
    render();
  }

  function stopSound(): void {
    playing?.audio.pause();
    playing = null;
  }

  function toggleSound(path: string, url: string): void {
    const wasPlaying = playing?.path === path;
    stopSound();
    if (!wasPlaying) {
      const audio = new Audio(url);
      audio.addEventListener("ended", () => {
        if (playing?.audio === audio) {
          playing = null;
          render();
        }
      });
      void audio.play().catch(() => {
        playing = null;
        render();
      });
      playing = { path, audio };
    }
    render();
  }

  /** Loads an uploaded font under a name of its own, for its "Aa". */
  function fontFamily(url: string): string {
    const existing = fontFamilies.get(url);
    if (existing) return existing;
    const family = `jgz-asset-font-${fontFamilies.size + 1}`;
    fontFamilies.set(url, family);
    const face = new FontFace(family, `url(${JSON.stringify(url)})`);
    void face.load().then(
      (loaded) => document.fonts.add(loaded),
      () => fontFamilies.set(url, "inherit"),
    );
    return family;
  }

  function preview(
    path: string,
    kind: AssetDirectory,
    url: string,
  ): HTMLElement {
    if (kind === "images") {
      return h("span", { className: "asset-preview" }, [
        h("img", {
          className: "asset-thumb",
          attrs: { src: url, alt: "", loading: "lazy" },
        }),
      ]);
    }
    if (kind === "fonts") {
      const sample = h("span", { className: "asset-font-sample", text: "Aa" });
      sample.style.fontFamily = fontFamily(url);
      return h("span", { className: "asset-preview" }, [sample]);
    }
    const isPlaying = playing?.path === path;
    return h(
      "button",
      {
        className: "asset-preview asset-play",
        attrs: {
          type: "button",
          "aria-label": `${isPlaying ? "Stop" : "Play"} ${nameInCode(path)}`,
          "aria-pressed": String(isPlaying),
          "data-jgz-asset-play": path,
        },
        onClick: () => toggleSound(path, url),
      },
      [icon(isPlaying ? "stop" : "play", 22)],
    );
  }

  function tile(path: string, kind: AssetDirectory): HTMLLIElement {
    const url = assetSourceUrl(project?.name ?? "", path);
    const usable = usableInCode(path);
    const fileName = path.split("/").slice(1).join("/");
    return h(
      "li",
      {
        className: usable ? "asset-tile" : "asset-tile asset-tile-warning",
        attrs: { "data-jgz-asset": path, title: fileName },
      },
      [
        preview(path, kind, url),
        h("span", { className: "asset-name", text: nameInCode(path) }),
        ...(usable
          ? []
          : [
              h(
                "span",
                {
                  className: "asset-warning",
                  attrs: {
                    title:
                      "Names in code use lowercase letters, numbers and _, and start with a letter. Upload it again with a name like that to use it.",
                  },
                },
                [icon("warning", 14), "Rename to use"],
              ),
            ]),
        h(
          "button",
          {
            className: "icon-button icon-button-danger asset-delete",
            attrs: {
              type: "button",
              title: "Delete",
              "aria-label": `Delete ${fileName}`,
              "data-jgz-asset-delete": path,
            },
          },
          [icon("trash", 16)],
        ),
      ],
    );
  }

  function render(): void {
    const files = project?.files ?? [];
    const counts = new Map<AssetDirectory, number>();
    for (const path of files) {
      const kind = assetKindOf(path);
      if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    for (const button of rail.querySelectorAll<HTMLButtonElement>(
      "[data-jgz-rail]",
    )) {
      const kind = button.dataset.jgzRail;
      button.setAttribute(
        "aria-pressed",
        String(kind === (openKind ?? "code")),
      );
    }
    for (const badge of rail.querySelectorAll<HTMLElement>(
      "[data-jgz-rail-count]",
    )) {
      const count =
        counts.get(badge.dataset.jgzRailCount as AssetDirectory) ?? 0;
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }

    panel.hidden = openKind === null;
    shell.dataset.assetPanel = openKind ? "open" : "closed";
    const kind = openKind ?? "images";
    const text = KINDS[kind];
    input.accept = text.accept;
    if (!openKind) {
      stopSound();
      return;
    }
    const assets = files.filter((path) => assetKindOf(path) === kind).sort();
    const named = assets.find(usableInCode);
    title.textContent = text.title;
    grid.setAttribute("aria-label", text.title);
    hint.replaceChildren(
      ...text.hint(named ? nameInCode(named) : text.fallbackName),
    );
    dropTitle.textContent = `Drop ${text.noun} here`;
    dropTypes.textContent = text.types;
    grid.replaceChildren(
      ...(assets.length === 0
        ? [h("li", { className: "asset-empty", text: `No ${text.noun} yet.` })]
        : assets.map((path) => tile(path, kind))),
    );
  }

  function upload(
    files: FileList | readonly File[],
    fallback: AssetDirectory,
  ): void {
    const byKind = new Map<AssetDirectory, File[]>();
    for (const file of Array.from(files)) {
      const kind = inferAssetKind(file, fallback);
      byKind.set(kind, [...(byKind.get(kind) ?? []), file]);
    }
    for (const [kind, kindFiles] of byKind) {
      const transfer = new DataTransfer();
      for (const file of kindFiles) transfer.items.add(file);
      callbacks.onUploadFiles(kind, transfer.files);
    }
    const first = byKind.keys().next().value;
    if (first && first !== openKind) setOpen(first);
  }

  delegate(rail, "click", "[data-jgz-rail]", (_event, target) => {
    const kind = target.dataset.jgzRail;
    if (kind === "code" || kind === openKind) setOpen(null);
    else if ((ASSET_DIRECTORIES as readonly string[]).includes(kind ?? "")) {
      setOpen(kind as AssetDirectory);
    }
  });
  closeButton.addEventListener("click", () => {
    setOpen(null);
    qs<HTMLButtonElement>(rail, '[data-jgz-rail="code"]').focus();
  });
  input.addEventListener("change", () => {
    if (!input.files || input.files.length === 0) return;
    upload(input.files, openKind ?? "images");
    input.value = "";
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
    if (files && files.length > 0) upload(files, openKind ?? "images");
  });
  delegate(grid, "click", "[data-jgz-asset-delete]", (event, target) => {
    event.stopPropagation();
    const path = target.dataset.jgzAssetDelete;
    if (!path) return;
    void (async () => {
      const ok = await confirmDialog({
        title: `Delete "${path.split("/").slice(1).join("/")}"?`,
        body: "This removes the file from your game. This can't be undone.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (ok) {
        if (playing?.path === path) stopSound();
        callbacks.onRequestDeleteAsset(path);
      }
    })();
  });

  render();

  return {
    update(next: ProjectSummary | null): void {
      if (next?.name !== project?.name) stopSound();
      project = next;
      render();
    },
    open(kind: AssetDirectory): void {
      setOpen(kind);
    },
  };
}
