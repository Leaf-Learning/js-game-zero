import { expect, test } from "bun:test";
import { exampleManifest } from "../../../examples/manifest";
import { phaseOneHandler } from "../src/server";

test("phase 5 example manifest exposes complete smoke metadata", async () => {
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
        await Bun.file(`examples/phase-five/assets/${asset}`).exists(),
      ).toBe(true);
    }
  }

  expect([...slugs].sort()).toEqual([
    "actor-movement",
    "animation-basics",
    "drawing-basics",
    "sandbox-starter",
    "sound-tone",
    "storage-save",
  ]);
});

test("phase 5 example routes serve an index, pages, and learner source", async () => {
  const index = await phaseOneHandler(new Request("http://localhost/examples"));
  expect(index.status).toBe(200);
  expect(await index.text()).toContain("data-jgz-example-link");

  const page = await phaseOneHandler(
    new Request("http://localhost/examples/drawing-basics"),
  );
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("__jgzExampleStatus");

  const source = await phaseOneHandler(
    new Request("http://localhost/examples/drawing-basics/main.js"),
  );
  expect(source.status).toBe(200);
  expect(await source.text()).toContain("function draw()");
});
