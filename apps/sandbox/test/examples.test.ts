import { expect, test } from "bun:test";
import { collectRuntimeDiagnostics } from "@js-game-zero/core";
import { exampleManifest } from "../../../examples/manifest";
import { testFixtureServerHandler } from "../src/server";

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

  expect([...slugs].sort()).toEqual([
    "actor-movement",
    "animation-basics",
    "breakout",
    "drawing-basics",
    "flappy-bird",
    "platformer",
    "sandbox-starter",
    "snake",
    "sound-tone",
    "space-shooter",
    "storage-save",
  ]);
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
  const index = await testFixtureServerHandler(
    new Request("http://localhost/examples"),
  );
  expect(index.status).toBe(200);
  expect(await index.text()).toContain("data-jgz-example-link");

  const page = await testFixtureServerHandler(
    new Request("http://localhost/examples/drawing-basics"),
  );
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("__jgzExampleStatus");

  const source = await testFixtureServerHandler(
    new Request("http://localhost/examples/drawing-basics/main.js"),
  );
  expect(source.status).toBe(200);
  expect(await source.text()).toContain("function draw()");
});
