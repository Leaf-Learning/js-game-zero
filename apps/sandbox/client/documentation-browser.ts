import DOMPurify from "dompurify";
import { marked } from "marked";
import * as api from "./api";
import { h, qs } from "./dom";
import type {
  DocumentationDocument,
  DocumentationSummary,
} from "../shared/contracts";

const DEFAULT_DOCUMENT = "getting-started";
const DOCS_ORIGIN = "https://jgz-docs.invalid";

export type DocumentationBrowser = {
  load(): Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function sourceUrl(path: string): URL {
  return new URL(`/${path}`, DOCS_ORIGIN);
}

function resolvedSourceUrl(
  href: string,
  document: DocumentationDocument,
): URL | null {
  try {
    return new URL(href, sourceUrl(document.sourcePath));
  } catch {
    return null;
  }
}

function decodedSourcePath(url: URL): string | null {
  try {
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    return null;
  }
}

function compatibleDocumentHash(
  document: DocumentationSummary,
  hash: string,
): string {
  // docs/examples.md historically links to README.md#credits, while the
  // rendered heading's deterministic ID is "license-and-credits".
  if (document.sourcePath === "README.md" && hash === "#credits") {
    return "#license-and-credits";
  }
  return hash;
}

function slugBase(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section"
  );
}

function assignHeadingIds(container: HTMLElement): void {
  const counts = new Map<string, number>();
  for (const heading of container.querySelectorAll<HTMLElement>(
    "h1, h2, h3, h4, h5, h6",
  )) {
    const base = slugBase(heading.textContent ?? "");
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    heading.id = count === 0 ? base : `${base}-${count}`;
  }
}

function scrollToHash(
  container: HTMLElement,
  hash: string,
  moveFocus = false,
): void {
  if (!hash) {
    container.scrollTop = 0;
    if (moveFocus) container.focus({ preventScroll: true });
    return;
  }
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return;
  }
  requestAnimationFrame(() => {
    const target = container.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!target) return;
    const top =
      container.scrollTop +
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top;
    container.scrollTop = top;
    if (moveFocus) {
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  });
}

export function createDocumentationBrowser(): DocumentationBrowser {
  const navigation = qs<HTMLElement>(document, "[data-jgz-docs-navigation]");
  const content = qs<HTMLElement>(document, "[data-jgz-docs-content]");

  let documents: DocumentationSummary[] | null = null;
  let currentDocument = DEFAULT_DOCUMENT;
  let requestSequence = 0;

  function renderStatus(
    title: string,
    message?: string,
    retry?: () => void,
  ): void {
    content.replaceChildren(
      h("div", { className: "docs-status" }, [
        h("h3", { text: title }),
        ...(message ? [h("p", { text: message })] : []),
        ...(retry
          ? [
              h("button", {
                className: "btn btn-secondary",
                text: "Try again",
                attrs: { type: "button", "data-jgz-docs-retry": "" },
                onClick: retry,
              }),
            ]
          : []),
      ]),
    );
  }

  function renderNavigation(): void {
    if (!documents) return;
    const listed = documents.filter((document) => document.navigation);
    const sections = Array.from(
      new Set(listed.map((document) => document.section)),
    );
    navigation.replaceChildren(
      ...sections.map((section) =>
        h("section", { className: "docs-nav-section" }, [
          h("h3", { text: section }),
          h(
            "div",
            { className: "docs-nav-list" },
            listed
              .filter((document) => document.section === section)
              .map((document) =>
                h("button", {
                  className: "docs-nav-button",
                  text: document.title,
                  attrs: {
                    type: "button",
                    "data-jgz-doc": document.id,
                    "aria-current":
                      document.id === currentDocument ? "page" : undefined,
                  },
                  onClick: () => void selectDocument(document.id),
                }),
              ),
          ),
        ]),
      ),
    );
  }

  function updateNavigationSelection(): void {
    for (const button of navigation.querySelectorAll<HTMLButtonElement>(
      "[data-jgz-doc]",
    )) {
      if (button.dataset.jgzDoc === currentDocument) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    }
  }

  function documentBySourcePath(
    sourcePath: string,
  ): DocumentationSummary | undefined {
    if (sourcePath === "docs/reference/") {
      return documents?.find((document) => document.id === "reference/hooks");
    }
    return documents?.find((document) => document.sourcePath === sourcePath);
  }

  function decorateLinks(document: DocumentationDocument): void {
    for (const image of content.querySelectorAll<HTMLImageElement>("img")) {
      const original = image.getAttribute("src");
      if (!original) continue;
      const resolved = resolvedSourceUrl(original, document);
      if (!resolved || resolved.origin !== DOCS_ORIGIN) continue;
      const sourcePath = decodedSourcePath(resolved);
      if (!sourcePath) continue;
      if (sourcePath.startsWith("docs/media/")) {
        image.src = `/docs/media/${encodePath(
          sourcePath.slice("docs/media/".length),
        )}`;
      }
      image.loading = "lazy";
    }

    for (const link of content.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const original = link.getAttribute("href");
      if (!original) continue;
      const resolved = resolvedSourceUrl(original, document);
      if (!resolved) continue;

      if (resolved.origin !== DOCS_ORIGIN) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        continue;
      }

      const sourcePath = decodedSourcePath(resolved);
      if (!sourcePath) continue;
      const destination = documentBySourcePath(sourcePath);
      if (destination) {
        const destinationHash = compatibleDocumentHash(
          destination,
          resolved.hash,
        );
        link.addEventListener("click", (event) => {
          event.preventDefault();
          if (destination.id === currentDocument) {
            scrollToHash(content, destinationHash, true);
          } else {
            void selectDocument(destination.id, destinationHash, true);
          }
        });
        continue;
      }

      // Non-document local routes (for example /examples) should not replace
      // the sandbox or the open documentation browser.
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.href = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    }
  }

  function renderDocument(
    document: DocumentationDocument,
    hash: string,
    moveFocus: boolean,
  ): void {
    const rendered = marked.parse(document.markdown, {
      async: false,
      gfm: true,
    });
    const clean = DOMPurify.sanitize(rendered, {
      USE_PROFILES: { html: true },
    });
    content.innerHTML = clean;
    assignHeadingIds(content);
    decorateLinks(document);
    scrollToHash(content, hash, moveFocus);
  }

  async function selectDocument(
    id: string,
    hash = "",
    moveFocus = false,
  ): Promise<void> {
    const summary = documents?.find((document) => document.id === id);
    if (!summary) return;
    currentDocument = id;
    updateNavigationSelection();
    renderStatus("Loading documentation…");
    if (moveFocus) content.focus();
    const sequence = ++requestSequence;
    try {
      const document = await api.readDocumentation(id);
      if (sequence !== requestSequence) return;
      renderDocument(document, hash, moveFocus);
    } catch (error) {
      if (sequence !== requestSequence) return;
      renderStatus(
        "Documentation couldn't be loaded",
        errorMessage(error),
        () => void selectDocument(id, hash, true),
      );
    }
  }

  async function load(moveFocus = false): Promise<void> {
    if (documents) {
      await selectDocument(currentDocument, "", moveFocus);
      return;
    }
    navigation.replaceChildren(
      h("p", { className: "docs-nav-loading", text: "Loading…" }),
    );
    renderStatus("Loading documentation…");
    if (moveFocus) content.focus();
    try {
      documents = await api.listDocumentation();
      renderNavigation();
      await selectDocument(
        documents.some((document) => document.id === currentDocument)
          ? currentDocument
          : (documents.find((document) => document.navigation)?.id ??
              DEFAULT_DOCUMENT),
        "",
        moveFocus,
      );
    } catch (error) {
      navigation.replaceChildren();
      renderStatus(
        "Documentation couldn't be loaded",
        errorMessage(error),
        () => void load(true),
      );
    }
  }

  return { load };
}
