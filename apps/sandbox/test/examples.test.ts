import { expect, test } from "bun:test";
import { collectRuntimeDiagnostics } from "@js-game-zero/core/host";
import { exampleManifest } from "../../../examples/manifest";
import { createSandboxServerHandler } from "../src/server";

// Example routes are part of the shipped product, not fixture-gated, so they
// are exercised through the default handler (no --test-fixtures).
const handler = createSandboxServerHandler();

test("example manifest exposes complete smoke metadata", async () => {
  const slugs = new Set<string>();
  for (const example of exampleManifest) {
    expect(example.slug).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(slugs.has(example.slug)).toBe(false);
    slugs.add(example.slug);
    expect(example.title.length).toBeGreaterThan(0);
    expect(example.entryPoint).toMatch(/^examples\/.+\.(js|ts)$/);
    expect(Array.isArray(example.assets)).toBe(true);
    expect(example.smokeMarker).toBe("__jgzExampleStatus");
    expect(example.tutorial).toMatch(/^examples\/.+\/README\.md$/);
    expect(example.e2eScenario.length).toBeGreaterThan(0);
    // Learners read the title and description on the gallery cards: a
    // title-cased name, and a sentence of its own, not the test scenario.
    expect(example.title).not.toMatch(/ (?:And|Or|Of|The|To|With|In|On) /);
    expect(example.description).toMatch(/^[A-Z].*\.$/);
    expect(example.description.toLowerCase()).not.toContain(
      example.e2eScenario.toLowerCase(),
    );
    expect(["global", "import"]).toContain(example.mode);
    expect(["keyboard", "mouse", "none"]).toContain(example.expectsInput);

    const entry = Bun.file(example.entryPoint);
    const tutorial = Bun.file(example.tutorial);
    expect(await entry.exists()).toBe(true);
    expect(await tutorial.exists()).toBe(true);
    for (const asset of example.assets) {
      expect(
        await Bun.file(`examples/${example.slug}/assets/${asset}`).exists(),
      ).toBe(true);
    }
  }
});

test("global-mode example sources are free of runtime diagnostics", async () => {
  // The example pages only report ready when the runtime emits zero
  // diagnostics, so a stray warning (e.g. an identifier the typo checker
  // mistakes for a hook name) would break every /examples/<slug> page.
  for (const example of exampleManifest) {
    if (example.mode !== "global") continue;
    const source = await Bun.file(example.entryPoint).text();
    expect({
      slug: example.slug,
      diagnostics: collectRuntimeDiagnostics(source),
    }).toEqual({ slug: example.slug, diagnostics: [] });
  }
});

test("example routes serve an index, pages, and learner source", async () => {
  const index = await handler(new Request("http://localhost/examples"));
  expect(index.status).toBe(200);
  expect(await index.text()).toContain("data-jgz-example-link");

  const page = await handler(
    new Request("http://localhost/examples/drawing-basics"),
  );
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("__jgzExampleStatus");

  const source = await handler(
    new Request("http://localhost/examples/drawing-basics/main.js"),
  );
  expect(source.status).toBe(200);
  expect(await source.text()).toContain("function draw()");
});
