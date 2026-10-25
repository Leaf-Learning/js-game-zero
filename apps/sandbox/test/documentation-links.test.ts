import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { marked, type Token } from "marked";
import {
  documentationLink,
  REPOSITORY_URL,
} from "../client/documentation-links";
import { documentationManifest } from "../src/documentation";

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const documents = documentationManifest();

describe("documentation links", () => {
  test("links between served documents stay in the viewer", () => {
    expect(
      documentationLink("cli.md", "docs/getting-started.md", documents),
    ).toEqual({ kind: "document", id: "cli", hash: "" });
    expect(
      documentationLink(
        "sandbox.md#example-gallery",
        "docs/examples.md",
        documents,
      ),
    ).toEqual({ kind: "document", id: "sandbox", hash: "#example-gallery" });
    expect(
      documentationLink("docs/reference/", "README.md", documents),
    ).toEqual({ kind: "document", id: "reference/hooks", hash: "" });
    expect(
      documentationLink("../README.md#credits", "docs/examples.md", documents),
    ).toEqual({ kind: "document", id: "readme", hash: "#license-and-credits" });
  });

  test("other repository files open on GitHub, where the same link works", () => {
    expect(
      documentationLink("CONTRIBUTING.md", "README.md", documents),
    ).toEqual({
      kind: "new-tab",
      href: `${REPOSITORY_URL}/blob/main/CONTRIBUTING.md`,
    });
    expect(documentationLink("LICENSE", "README.md", documents)).toEqual({
      kind: "new-tab",
      href: `${REPOSITORY_URL}/blob/main/LICENSE`,
    });
    expect(
      documentationLink(
        "../examples/sandbox-starter/README.md",
        "docs/sandbox.md",
        documents,
      ),
    ).toEqual({
      kind: "new-tab",
      href: `${REPOSITORY_URL}/blob/main/examples/sandbox-starter/README.md`,
    });
    expect(
      documentationLink("../examples/", "docs/sandbox.md", documents),
    ).toEqual({
      kind: "new-tab",
      href: `${REPOSITORY_URL}/tree/main/examples/`,
    });
  });

  test("sandbox pages and websites open in a new tab unchanged", () => {
    expect(
      documentationLink("/examples", "docs/getting-started.md", documents),
    ).toEqual({ kind: "new-tab", href: "/examples" });
    expect(
      documentationLink("https://bun.sh", "docs/getting-started.md", documents),
    ).toEqual({ kind: "external" });
  });

  test("every link in a served document leads somewhere that exists", async () => {
    for (const document of documents) {
      const markdown = await Bun.file(
        resolve(REPO_ROOT, document.sourcePath),
      ).text();
      const hrefs: string[] = [];
      marked.walkTokens(marked.lexer(markdown), (token: Token) => {
        if (token.type === "link") hrefs.push(token.href);
      });
      for (const href of hrefs) {
        const destination = documentationLink(
          href,
          document.sourcePath,
          documents,
        );
        const where = `${document.sourcePath}: ${href}`;
        expect(destination, where).not.toBeNull();
        if (destination?.kind !== "new-tab") continue;
        // Relative links in these docs are files, not sandbox pages.
        expect(destination.href.startsWith(REPOSITORY_URL), where).toBe(true);
        const path = decodeURIComponent(
          new URL(destination.href).pathname.replace(
            /^\/[^/]+\/[^/]+\/(?:blob|tree)\/main\//,
            "",
          ),
        );
        expect(existsSync(resolve(REPO_ROOT, path)), where).toBe(true);
      }
    }
  });
});
