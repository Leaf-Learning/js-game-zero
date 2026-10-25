import { realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type {
  DocumentationDocument,
  DocumentationSummary,
} from "../shared/contracts";

const REPO_ROOT = resolve(import.meta.dir, "../../..");

const documents: readonly DocumentationSummary[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    section: "Learn",
    sourcePath: "docs/getting-started.md",
    navigation: true,
  },
  {
    id: "tutorial",
    title: "Tutorial",
    section: "Learn",
    sourcePath: "docs/tutorial.md",
    navigation: true,
  },
  {
    id: "cookbook",
    title: "Cookbook",
    section: "Learn",
    sourcePath: "docs/cookbook.md",
    navigation: true,
  },
  {
    id: "sandbox",
    title: "Sandbox Guide",
    section: "Learn",
    sourcePath: "docs/sandbox.md",
    navigation: true,
  },
  {
    id: "examples",
    title: "Examples",
    section: "Learn",
    sourcePath: "docs/examples.md",
    navigation: true,
  },
  {
    id: "migrating-from-pgzero",
    title: "Migrating from Pygame Zero",
    section: "Learn",
    sourcePath: "docs/migrating-from-pgzero.md",
    navigation: true,
  },
  {
    id: "cli",
    title: "Game Verification CLI",
    section: "Learn",
    sourcePath: "docs/cli.md",
    navigation: true,
  },
  {
    id: "reference/hooks",
    title: "Hooks and Input",
    section: "API Reference",
    sourcePath: "docs/reference/hooks.md",
    navigation: true,
  },
  {
    id: "reference/screen",
    title: "Screen",
    section: "API Reference",
    sourcePath: "docs/reference/screen.md",
    navigation: true,
  },
  {
    id: "reference/actor",
    title: "Actor",
    section: "API Reference",
    sourcePath: "docs/reference/actor.md",
    navigation: true,
  },
  {
    id: "reference/rect",
    title: "Rect",
    section: "API Reference",
    sourcePath: "docs/reference/rect.md",
    navigation: true,
  },
  {
    id: "reference/clock",
    title: "Clock and Animation",
    section: "API Reference",
    sourcePath: "docs/reference/clock.md",
    navigation: true,
  },
  {
    id: "reference/helpers",
    title: "Helpers",
    section: "API Reference",
    sourcePath: "docs/reference/helpers.md",
    navigation: true,
  },
  {
    id: "reference/audio",
    title: "Audio",
    section: "API Reference",
    sourcePath: "docs/reference/audio.md",
    navigation: true,
  },
  {
    id: "reference/storage",
    title: "Storage",
    section: "API Reference",
    sourcePath: "docs/reference/storage.md",
    navigation: true,
  },
  {
    id: "reference/loaders",
    title: "Loading Assets",
    section: "API Reference",
    sourcePath: "docs/reference/loaders.md",
    navigation: true,
  },
  {
    id: "reference/runtime",
    title: "Runtime",
    section: "API Reference",
    sourcePath: "docs/reference/runtime.md",
    navigation: true,
  },
  {
    id: "readme",
    title: "About js-game-zero",
    section: "Project",
    sourcePath: "README.md",
    navigation: false,
  },
];

const documentsById = new Map(
  documents.map((document) => [document.id, document]),
);
const mediaRoot = resolve(REPO_ROOT, "docs/media");

export function documentationManifest(): readonly DocumentationSummary[] {
  return documents;
}

export async function readDocumentation(
  id: string,
): Promise<DocumentationDocument | null> {
  const summary = documentsById.get(id);
  if (!summary) return null;
  const file = Bun.file(resolve(REPO_ROOT, summary.sourcePath));
  if (!(await file.exists())) return null;
  return { ...summary, markdown: await file.text() };
}

export async function documentationMediaResponse(
  encodedPath: string,
): Promise<Response> {
  let requestedPath: string;
  try {
    requestedPath = decodeURIComponent(encodedPath);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (
    requestedPath.length === 0 ||
    requestedPath.includes("\\") ||
    requestedPath.split("/").some((segment) => segment === "..")
  ) {
    return new Response("Not found", { status: 404 });
  }

  const candidate = resolve(mediaRoot, requestedPath);
  if (candidate !== mediaRoot && !candidate.startsWith(`${mediaRoot}${sep}`)) {
    return new Response("Not found", { status: 404 });
  }

  let canonical: string;
  try {
    canonical = await realpath(candidate);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const withinMedia =
    canonical === mediaRoot || !relative(mediaRoot, canonical).startsWith("..");
  if (!withinMedia) return new Response("Not found", { status: 404 });

  const file = Bun.file(canonical);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  const mediaType = documentationMediaContentType(canonical);
  if (!mediaType) return new Response("Not found", { status: 404 });
  return new Response(file, {
    headers: { "content-type": mediaType },
  });
}

function documentationMediaContentType(path: string): string | null {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".gif") return "image/gif";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  return null;
}
