import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandboxServerHandler, phaseOneHandler } from "../src/server";
import { normalizeSandboxRelativePath } from "../src/sandbox";

let projectsRoot = "";
let handler: (request: Request) => Promise<Response>;

beforeEach(async () => {
  projectsRoot = await mkdtemp(join(tmpdir(), "jgz-sandbox-"));
  handler = createSandboxServerHandler({ projectsRoot });
});

afterEach(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
});

function request(path: string, init?: RequestInit): Promise<Response> {
  return handler(new Request(`http://localhost${path}`, init));
}

async function createProject(name = "demo_game"): Promise<void> {
  const response = await request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(201);
}

describe("phase 6 sandbox routes", () => {
  test("health, project create/list/open, file read/write, and legacy routes work", async () => {
    const health = await request("/api/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, phase: 6 });

    const initial = await request("/api/projects");
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({ projects: [] });

    await createProject();

    const list = await request("/api/projects");
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({
      projects: [{ name: "demo_game", files: ["main.js"] }],
    });

    const starter = await request("/api/projects/demo_game/files/main.js");
    expect(starter.status).toBe(200);
    expect(await starter.json()).toMatchObject({
      project: "demo_game",
      path: "main.js",
    });

    const write = await request("/api/projects/demo_game/files/src/notes.md", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "hello sandbox" }),
    });
    expect(write.status).toBe(200);
    expect(
      await readFile(
        join(projectsRoot, "demo_game", "src", "notes.md"),
        "utf8",
      ),
    ).toBe("hello sandbox");

    const read = await request("/api/projects/demo_game/files/src/notes.md");
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({
      project: "demo_game",
      path: "src/notes.md",
      content: "hello sandbox",
    });

    const legacy = await phaseOneHandler(
      new Request("http://localhost/phase-one"),
    );
    expect(legacy.status).toBe(200);
    expect(await legacy.text()).toContain("data-jgz-phase-one-canvas");
  });

  test("asset upload is binary-safe and asset reads are confined", async () => {
    await createProject();
    const bytes = new Uint8Array([0, 1, 2, 255]);
    const upload = await request(
      "/api/projects/demo_game/assets/images/pixel.png",
      {
        method: "PUT",
        body: bytes,
      },
    );
    expect(upload.status).toBe(200);
    expect(await upload.json()).toMatchObject({
      ok: true,
      path: "images/pixel.png",
      bytes: 4,
    });
    expect(
      await readFile(join(projectsRoot, "demo_game", "images", "pixel.png")),
    ).toEqual(Buffer.from(bytes));

    const asset = await request("/assets/demo_game/images/pixel.png");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await asset.arrayBuffer())).toEqual(bytes);

    const deleted = await request(
      "/api/projects/demo_game/assets/images/pixel.png",
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(200);
    const afterDelete = await request("/assets/demo_game/images/pixel.png");
    expect(afterDelete.status).toBe(404);
  });

  test("asset paths can never be opened or overwritten as code files", async () => {
    await createProject();
    await request("/api/projects/demo_game/assets/images/pixel.png", {
      method: "PUT",
      body: new Uint8Array([0, 1, 2, 255]),
    });

    const readAsCode = await request(
      "/api/projects/demo_game/files/images/pixel.png",
    );
    expect(readAsCode.status).toBe(400);

    const writeAsCode = await request(
      "/api/projects/demo_game/files/images/pixel.png",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "corrupted" }),
      },
    );
    expect(writeAsCode.status).toBe(400);

    // Bytes on disk must be untouched by the rejected code-editor write.
    expect(
      await readFile(join(projectsRoot, "demo_game", "images", "pixel.png")),
    ).toEqual(Buffer.from([0, 1, 2, 255]));
  });

  test("files can be created, renamed, and deleted", async () => {
    await createProject();

    const created = await request(
      "/api/projects/demo_game/files/levels/one.js",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "// level one" }),
      },
    );
    expect(created.status).toBe(200);

    const renamed = await request("/api/projects/demo_game/files/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "levels/one.js", to: "levels/first.js" }),
    });
    expect(renamed.status).toBe(200);
    expect(
      await readFile(
        join(projectsRoot, "demo_game", "levels", "first.js"),
        "utf8",
      ),
    ).toBe("// level one");

    const missingOld = await request(
      "/api/projects/demo_game/files/levels/one.js",
    );
    expect(missingOld.status).toBe(404);

    const deleted = await request(
      "/api/projects/demo_game/files/levels/first.js",
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(200);
    const afterDelete = await request(
      "/api/projects/demo_game/files/levels/first.js",
    );
    expect(afterDelete.status).toBe(404);
  });

  test("projects can be renamed and deleted", async () => {
    await createProject();

    const renamed = await request("/api/projects/demo_game/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "renamed_game" }),
    });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({
      project: { name: "renamed_game" },
    });

    const oldGone = await request("/api/projects/demo_game/files/main.js");
    expect(oldGone.status).toBe(404);
    const newThere = await request("/api/projects/renamed_game/files/main.js");
    expect(newThere.status).toBe(200);

    const deleted = await request("/api/projects/renamed_game", {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    const list = await request("/api/projects");
    expect(await list.json()).toEqual({ projects: [] });
  });

  test("examples manifest is exposed and can be cloned into a new project", async () => {
    const examples = await request("/api/examples");
    expect(examples.status).toBe(200);
    const body = (await examples.json()) as {
      examples: { slug: string; expectsInput: string }[];
    };
    expect(body.examples.length).toBeGreaterThan(0);
    expect(body.examples.map((example) => example.slug)).toContain(
      "actor-movement",
    );
    // Import-mode examples aren't clonable into the zero-boilerplate sandbox.
    expect(body.examples.map((example) => example.slug)).not.toContain(
      "sandbox-starter",
    );

    const clone = await request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "cloned_game",
        exampleSlug: "actor-movement",
      }),
    });
    expect(clone.status).toBe(201);
    expect(await clone.json()).toMatchObject({
      project: { name: "cloned_game" },
    });

    const source = await readFile(
      join(projectsRoot, "cloned_game", "main.js"),
      "utf8",
    );
    expect(source).toContain("Actor Movement");
    expect(
      await Bun.file(
        join(projectsRoot, "cloned_game", "images", "player.svg"),
      ).exists(),
    ).toBe(true);
  });

  test("missing projects, missing files, invalid names, and invalid bodies fail clearly", async () => {
    const missingProject = await request("/api/projects/missing/files/main.js");
    expect(missingProject.status).toBe(404);

    const invalidProject = await request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "../bad" }),
    });
    expect(invalidProject.status).toBe(400);

    await createProject();
    const duplicate = await request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "demo_game" }),
    });
    expect(duplicate.status).toBe(409);

    const missingFile = await request("/api/projects/demo_game/files/nope.js");
    expect(missingFile.status).toBe(404);

    const invalidBody = await request("/api/projects/demo_game/files/main.js", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: 42 }),
    });
    expect(invalidBody.status).toBe(400);
  });

  test("path safety rejects traversal, absolute paths, backslashes, and encoded escapes", async () => {
    await createProject();
    const unsafePaths = [
      "../evil.js",
      "safe/..%2Fevil.js",
      "%2Ftmp%2Fevil.js",
      "C:%5Ctmp%5Cevil.js",
      "safe%5Cevil.js",
      "safe//evil.js",
    ];

    for (const unsafePath of unsafePaths) {
      const response = await request(
        `/api/projects/demo_game/files/${unsafePath}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: "escape" }),
        },
      );
      expect(response.status).not.toBe(200);
    }

    expect(normalizeSandboxRelativePath("src/main.js")).toBe("src/main.js");
    expect(() => normalizeSandboxRelativePath("src%5Cmain.js")).toThrow();
    expect(() => normalizeSandboxRelativePath("..%2Fmain.js")).toThrow();
  });

  test("symlink roots and symlink parent escapes are rejected before reads or writes", async () => {
    await createProject();
    const outside = join(projectsRoot, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "secret.txt"), "secret", "utf8");
    await symlink(outside, join(projectsRoot, "demo_game", "escape"), "dir");

    const readEscape = await request(
      "/api/projects/demo_game/files/escape/secret.txt",
    );
    expect(readEscape.status).toBe(400);

    const writeEscape = await request(
      "/api/projects/demo_game/files/escape/new.txt",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "bad" }),
      },
    );
    expect(writeEscape.status).toBe(400);

    const escapedFile = Bun.file(join(outside, "new.txt"));
    expect(await escapedFile.exists()).toBe(false);

    await rm(join(projectsRoot, "demo_game", "main.js"));
    await symlink(
      join(outside, "secret.txt"),
      join(projectsRoot, "demo_game", "main.js"),
    );
    const finalSymlink = await request("/api/projects/demo_game/files/main.js");
    expect(finalSymlink.status).toBe(400);
  });

  test("the client shell, bundle, styles, and preview HTML are served", async () => {
    await createProject();

    const index = await request("/");
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(await index.text()).toContain('src="/client/app.js"');

    const appBundle = await request("/client/app.js");
    expect(appBundle.status).toBe(200);
    expect(appBundle.headers.get("content-type")).toContain("text/javascript");
    expect((await appBundle.text()).length).toBeGreaterThan(0);

    const styles = await request("/client/app.css");
    expect(styles.status).toBe(200);
    expect(styles.headers.get("content-type")).toContain("text/css");

    const previewBundle = await request("/client/preview.js");
    expect(previewBundle.status).toBe(200);
    expect(previewBundle.headers.get("content-type")).toContain(
      "text/javascript",
    );

    const runtime = await request("/runtime/browser.js");
    expect(runtime.status).toBe(200);
    expect(runtime.headers.get("content-type")).toContain("text/javascript");
    const runtimeSource = await runtime.text();
    expect(runtimeSource).toContain("document.querySelector");

    const preview = await request("/play/demo_game");
    expect(preview.status).toBe(200);
    const previewHtml = await preview.text();
    expect(previewHtml).toContain('data-jgz-entry="main.js"');
    expect(previewHtml).toContain('src="/client/preview.js"');
  });
});
