import type { DocumentationSummary } from "../shared/contracts";

/** Stands in for the repository root while resolving relative links. */
const DOCS_ORIGIN = "https://jgz-docs.invalid";
export const REPOSITORY_URL = "https://github.com/Leaf-Learning/js-game-zero";

/** Where a link in a rendered documentation page should go. */
export type DocumentationLink =
  | { readonly kind: "document"; readonly id: string; readonly hash: string }
  | { readonly kind: "external" }
  | { readonly kind: "new-tab"; readonly href: string };

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** Resolves `href` against the repository file it appears in. */
export function resolvedSourceUrl(
  href: string,
  sourcePath: string,
): URL | null {
  try {
    return new URL(href, new URL(`/${sourcePath}`, DOCS_ORIGIN));
  } catch {
    return null;
  }
}

/** The repository path a resolved link points at, or null if it leaves the
 * repository (an external website). */
export function repositoryPath(url: URL): string | null {
  if (url.origin !== DOCS_ORIGIN) return null;
  try {
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    return null;
  }
}

/** The local URL the sandbox serves a `docs/media/` image at. */
export function documentationMediaUrl(path: string): string | null {
  return path.startsWith("docs/media/")
    ? `/docs/media/${encodePath(path.slice("docs/media/".length))}`
    : null;
}

function compatibleDocumentHash(
  document: DocumentationSummary,
  hash: string,
): string {
  // README.md#credits was retired in favor of the heading-derived
  // #license-and-credits anchor; keep remapping the old link for
  // backward compatibility with links that predate the rename.
  if (document.sourcePath === "README.md" && hash === "#credits") {
    return "#license-and-credits";
  }
  return hash;
}

function documentBySourcePath(
  documents: readonly DocumentationSummary[],
  sourcePath: string,
): DocumentationSummary | undefined {
  if (sourcePath === "docs/reference/") {
    return documents.find((document) => document.id === "reference/hooks");
  }
  return documents.find((document) => document.sourcePath === sourcePath);
}

/**
 * Decides where a link in a documentation page leads. Links between the
 * documents the viewer serves stay in the viewer. The docs are written to
 * work on GitHub too, so a relative link to any other repository file (such
 * as CONTRIBUTING.md or an example's README) opens that file on GitHub.
 * A root-relative link (`/examples`) is a sandbox page, opened beside the
 * viewer. Both open in a new tab, as external websites do.
 */
export function documentationLink(
  href: string,
  sourcePath: string,
  documents: readonly DocumentationSummary[],
): DocumentationLink | null {
  const resolved = resolvedSourceUrl(href, sourcePath);
  if (!resolved) return null;
  if (resolved.origin !== DOCS_ORIGIN) return { kind: "external" };
  const path = repositoryPath(resolved);
  if (path === null) return null;

  const destination = documentBySourcePath(documents, path);
  if (destination) {
    return {
      kind: "document",
      id: destination.id,
      hash: compatibleDocumentHash(destination, resolved.hash),
    };
  }

  if (href.startsWith("/")) {
    return {
      kind: "new-tab",
      href: `${resolved.pathname}${resolved.search}${resolved.hash}`,
    };
  }
  const view = path === "" || path.endsWith("/") ? "tree" : "blob";
  return {
    kind: "new-tab",
    href: `${REPOSITORY_URL}/${view}/main/${encodePath(path)}${resolved.hash}`,
  };
}
