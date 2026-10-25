import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  browserHostnames,
  createSandboxPreviewServerHandler,
  createSandboxServerHandler,
  testFixtureRoutesLoaded,
} from "../src/server";
import { normalizeSandboxRelativePath } from "../src/sandbox";
import { exampleManifest } from "../../../examples/manifest";

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

describe("sandbox routes", () => {
  test("every global example can be cloned under its own name with independent assets", async () => {
    for (const example of exampleManifest) {
      if (example.mode !== "global") continue;
      const created = await request("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: example.slug, exampleSlug: example.slug }),
      });
      expect(created.status).toBe(201);
      const source = await request(
        `/api/projects/${example.slug}/files/main.js`,
      );
      expect(await source.json()).toMatchObject({
        content: await Bun.file(example.entryPoint).text(),
      });
      for (const asset of example.assets) {
        const projectAsset = await request(`/assets/${example.slug}/${asset}`);
        const builtInAsset = await request(
          `/example-assets/${example.slug}/${asset}`,
        );
        expect(projectAsset.status).toBe(200);
        expect(builtInAsset.status).toBe(200);
        expect(await projectAsset.arrayBuffer()).toEqual(
          await builtInAsset.arrayBuffer(),
        );
      }
    }
    const original = await request("/example-assets/snake/images/fruit.png");
    const originalBytes = await original.arrayBuffer();
    const custom = new Uint8Array([1, 2, 3, 4]);
    expect(
      (
        await request("/api/projects/snake/assets/images/fruit.png", {
          method: "PUT",
          body: custom,
        })
      ).status,
    ).toBe(200);
    expect(
      new Uint8Array(
        await (await request("/assets/snake/images/fruit.png")).arrayBuffer(),
      ),
    ).toEqual(custom);
    expect(
      await (
        await request("/example-assets/snake/images/fruit.png")
      ).arrayBuffer(),
    ).toEqual(originalBytes);
    expect(
      (
        await request("/api/projects/snake/assets/images/fruit.png", {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    expect((await request("/assets/snake/images/fruit.png")).status).toBe(404);
    expect(
      (await request("/example-assets/snake/images/fruit.png")).status,
    ).toBe(200);
  });

  test("old flying-game links redirect to Tappy Plane", async () => {
    const response = await request("/examples/flappy-bird");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/examples/tappy-plane");
    const source = await request("/examples/flappy-bird/main.js");
    expect(source.headers.get("location")).toBe(
      "/examples/tappy-plane/main.js",
    );
  });

  test("the health endpoint responds with ok", async () => {
    const health = await request("/api/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
  });

  test("the project list starts empty", async () => {
    const initial = await request("/api/projects");
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({ projects: [] });
  });

  test("documentation routes expose only allowlisted pages and confined media", async () => {
    const manifest = await request("/api/docs");
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("content-type")).toContain("application/json");
    const manifestBody = (await manifest.json()) as {
      documents: Array<{
        id: string;
        navigation: boolean;
        sourcePath: string;
      }>;
    };
    expect(manifestBody.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "getting-started",
          navigation: true,
          sourcePath: "docs/getting-started.md",
        }),
        expect.objectContaining({
          id: "reference/actor",
          navigation: true,
          sourcePath: "docs/reference/actor.md",
        }),
        expect.objectContaining({
          id: "readme",
          navigation: false,
          sourcePath: "README.md",
        }),
      ]),
    );
    expect(
      manifestBody.documents
        .filter((document) => document.navigation)
        .map((document) => document.id),
    ).toEqual([
      "getting-started",
      "tutorial",
      "cookbook",
      "sandbox",
      "examples",
      "migrating-from-pgzero",
      "cli",
      "reference/hooks",
      "reference/screen",
      "reference/actor",
      "reference/rect",
      "reference/clock",
      "reference/helpers",
      "reference/audio",
      "reference/storage",
      "reference/loaders",
      "reference/runtime",
    ]);
    for (const document of manifestBody.documents) {
      const response = await request(
        `/api/docs/${document.id.split("/").map(encodeURIComponent).join("/")}`,
      );
      expect(response.status).toBe(200);
    }

    const actor = await request("/api/docs/reference/actor");
    expect(actor.status).toBe(200);
    expect(actor.headers.get("content-type")).toContain("application/json");
    expect(await actor.json()).toMatchObject({
      document: {
        id: "reference/actor",
        markdown: expect.stringContaining("# Actor"),
      },
    });

    const media = await request("/docs/media/main-view-running-game.png");
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("image/png");

    for (const path of [
      "/api/docs/not-allowlisted",
      "/api/docs/%2e%2e%2fpackage.json",
      "/api/docs/%252e%252e%252fpackage.json",
      "/docs/media/%2e%2e%2fgetting-started.md",
      "/docs/media/%252e%252e%252fgetting-started.md",
      "/docs/media/not-found.png",
    ]) {
      expect((await request(path)).status).toBe(404);
    }
    expect(
      (
        await request("/api/docs", {
          method: "POST",
        })
      ).status,
    ).toBe(405);
    expect(
      (
        await request("/docs/media/main-view-running-game.png", {
          method: "POST",
        })
      ).status,
    ).toBe(405);
  });

  test("creating a project lists it with its starter main.js", async () => {
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
  });

  test("files can be written and read back from nested directories", async () => {
    await createProject();

    const write = await request("/api/projects/demo_game/files/src/notes.md", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "hello sandbox",
        baseVersion: 0,
        revision: 1,
        sessionId: "session-a",
      }),
    });
    expect(write.status).toBe(200);
    expect(
      await readFile(
        join(projectsRoot, "demo_game", "src", "notes.md"),
        "utf8",
      ),
    ).toBe("hello sandbox");
    expect(
      (await readdir(join(projectsRoot, "demo_game", "src"))).filter((name) =>
        name.includes(".jgz-tmp-"),
      ),
    ).toEqual([]);

    const read = await request("/api/projects/demo_game/files/src/notes.md");
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({
      project: "demo_game",
      path: "src/notes.md",
      content: "hello sandbox",
      version: 1,
      bootId: expect.any(String),
    });
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
        body: JSON.stringify({
          content: "// level one",
          baseVersion: 0,
          revision: 1,
          sessionId: "session-a",
        }),
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
      examples: {
        slug: string;
        title: string;
        description: string;
        expectsInput: string;
      }[];
    };
    expect(body.examples.length).toBeGreaterThan(0);
    expect(body.examples.map((example) => example.slug)).toContain(
      "actor-movement",
    );
    // Import-mode examples aren't clonable into the zero-boilerplate sandbox.
    expect(body.examples.map((example) => example.slug)).not.toContain(
      "sandbox-starter",
    );
    // The gallery shows each example's own title and learner description.
    expect(body.examples).toContainEqual({
      slug: "sound-tone",
      title: "Sound and Tone",
      description: "Click to play a sound effect and a short generated tone.",
      expectsInput: "mouse",
    });

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
    expect(
      (await readdir(projectsRoot)).filter((name) =>
        name.startsWith(".jgz-staging-"),
      ),
    ).toEqual([]);
  });

  test("versioned writes keep the newest revision regardless of arrival order", async () => {
    await createProject();
    const path = "/api/projects/demo_game/files/main.js";
    const put = (content: string, revision: number) =>
      request(path, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          baseVersion: 0,
          revision,
          sessionId: "session-a",
        }),
      });

    const [newer, older] = await Promise.all([
      put("REVISION_TWO", 2),
      put("REVISION_ONE", 1),
    ]);
    expect(newer.status).toBe(200);
    expect(older.status).toBe(200);
    expect(
      await readFile(join(projectsRoot, "demo_game", "main.js"), "utf8"),
    ).toBe("REVISION_TWO");

    const response = await request(path);
    const responseBody = (await response.json()) as {
      content: string;
      version: number;
    };
    expect(responseBody).toMatchObject({
      content: "REVISION_TWO",
    });
    expect(responseBody.version).toBeGreaterThanOrEqual(1);
  });

  test("independent sessions cannot supersede a stale base with a higher local revision", async () => {
    await createProject();
    const path = "/api/projects/demo_game/files/main.js";
    const put = (content: string, revision: number, sessionId: string) =>
      request(path, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          baseVersion: 0,
          revision,
          sessionId,
        }),
      });

    const first = await put("CLIENT_A", 1, "session-a");
    const second = await put("CLIENT_B", 99, "session-b");
    expect(await first.json()).toMatchObject({ ok: true, stale: false });
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "conflict" });
    expect(
      await readFile(join(projectsRoot, "demo_game", "main.js"), "utf8"),
    ).toBe("CLIENT_A");
  });

  test("same-session exact replays are idempotent but mismatched duplicates conflict", async () => {
    await createProject();
    const path = "/api/projects/demo_game/files/main.js";
    const put = (content: string) =>
      request(path, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          baseVersion: 0,
          revision: 4,
          sessionId: "session-a",
        }),
      });

    const first = await put("LATEST");
    const replay = await put("LATEST");
    const mismatch = await put("DIFFERENT");
    expect(await first.json()).toMatchObject({
      ok: true,
      stale: false,
      version: 1,
    });
    expect(await replay.json()).toMatchObject({
      ok: true,
      stale: false,
      version: 1,
    });
    expect(mismatch.status).toBe(409);
    expect(
      await readFile(join(projectsRoot, "demo_game", "main.js"), "utf8"),
    ).toBe("LATEST");
  });

  test("version state follows renames and clears when files or projects are deleted", async () => {
    await createProject();
    const write = (
      project: string,
      path: string,
      content: string,
      baseVersion: number,
      revision: number,
    ) =>
      request(`/api/projects/${project}/files/${path}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          baseVersion,
          revision,
          sessionId: "session-a",
        }),
      });

    expect(
      (await write("demo_game", "levels/one.js", "one", 0, 1)).status,
    ).toBe(200);
    expect(
      (
        await request("/api/projects/demo_game/files/rename", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            from: "levels/one.js",
            to: "levels/first.js",
          }),
        })
      ).status,
    ).toBe(200);
    expect(
      await (
        await request("/api/projects/demo_game/files/levels/first.js")
      ).json(),
    ).toMatchObject({ version: 1 });

    expect(
      (
        await request("/api/projects/demo_game/files/levels/first.js", {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    expect(
      (await write("demo_game", "levels/first.js", "recreated", 0, 2)).status,
    ).toBe(200);

    expect((await write("demo_game", "main.js", "moved", 0, 3)).status).toBe(
      200,
    );
    expect(
      (
        await request("/api/projects/demo_game/rename", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "renamed_game" }),
        })
      ).status,
    ).toBe(200);
    expect(
      await (await request("/api/projects/renamed_game/files/main.js")).json(),
    ).toMatchObject({ content: "moved", version: 1 });
    expect((await write("renamed_game", "main.js", "next", 1, 4)).status).toBe(
      200,
    );

    expect(
      (
        await request("/api/projects/renamed_game", {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    await createProject("renamed_game");
    expect(
      await (await request("/api/projects/renamed_game/files/main.js")).json(),
    ).toMatchObject({ version: 0 });
    expect((await write("renamed_game", "main.js", "fresh", 0, 5)).status).toBe(
      200,
    );
  });

  test("missing projects, missing files, invalid names, and invalid bodies fail clearly", async () => {
    const missingProject = await request("/api/projects/missing/files/main.js");
    expect(missingProject.status).toBe(404);
    expect(await missingProject.json()).toMatchObject({ code: "not_found" });

    const invalidProject = await request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "../bad" }),
    });
    expect(invalidProject.status).toBe(400);
    expect(await invalidProject.json()).toMatchObject({
      code: "invalid_request",
    });

    await createProject();
    const duplicate = await request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "demo_game" }),
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ code: "conflict" });

    const missingFile = await request("/api/projects/demo_game/files/nope.js");
    expect(missingFile.status).toBe(404);

    const invalidBody = await request("/api/projects/demo_game/files/main.js", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: 42 }),
    });
    expect(invalidBody.status).toBe(400);
    expect(await invalidBody.json()).toMatchObject({ code: "invalid_request" });
  });

  test("the preview-only handler exposes reads but no project mutations", async () => {
    await createProject();
    const parentOrigin = "http://127.0.0.1:4173";
    const preview = createSandboxPreviewServerHandler({
      projectsRoot,
      parentOrigin,
    });
    const previewRequest = (path: string, init?: RequestInit) =>
      preview(new Request(`http://127.0.0.1:4174${path}`, init));

    const source = await previewRequest(
      "/api/projects/demo_game/files/main.js",
    );
    expect(source.status).toBe(200);
    expect(source.headers.get("access-control-allow-origin")).toBe(
      parentOrigin,
    );

    const mutation = await previewRequest(
      "/api/projects/demo_game/files/main.js",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "malicious" }),
      },
    );
    expect(mutation.status).toBe(404);
    expect(
      await readFile(join(projectsRoot, "demo_game", "main.js"), "utf8"),
    ).toContain("Use the arrow keys!");

    const shell = await previewRequest("/play/demo_game");
    expect(shell.status).toBe(200);
    expect(shell.headers.get("content-security-policy")).toBe(
      `frame-ancestors ${parentOrigin}`,
    );
    expect(await shell.text()).toContain(
      `data-jgz-parent-origin="${parentOrigin}"`,
    );
  });

  test("the editor shell publishes its separate preview origin", async () => {
    const configured = createSandboxServerHandler({
      projectsRoot,
      access: "editor",
      previewOrigin: "http://127.0.0.1:4174",
    });
    const response = await configured(new Request("http://127.0.0.1:4173/"));
    expect(await response.text()).toContain(
      'data-jgz-preview-origin="http://127.0.0.1:4174"',
    );
  });

  test("the editor and preview pair up at whichever loopback name the editor was opened with", async () => {
    // A server on 127.0.0.1 also answers at localhost, a different origin.
    // Opened at localhost, the editor must embed the preview at localhost,
    // and that preview must allow exactly that editor to frame it.
    await createProject();
    const hostnames = browserHostnames("127.0.0.1");
    expect(hostnames).toEqual(["127.0.0.1", "localhost", "[::1]"]);
    const editor = createSandboxServerHandler({
      projectsRoot,
      access: "editor",
      previewOrigin: "http://127.0.0.1:4174",
      hostnames,
    });
    const preview = createSandboxPreviewServerHandler({
      projectsRoot,
      parentOrigin: "http://127.0.0.1:4173",
      hostnames,
    });

    for (const [hostname, expectedHostname] of [
      ["localhost", "localhost"],
      ["127.0.0.1", "127.0.0.1"],
      ["[::1]", "[::1]"],
      // Names that aren't the server's keep the printed address, so a
      // rebound DNS name can't make the preview trust its own origin.
      ["attacker.example", "127.0.0.1"],
    ] as const) {
      const shell = await editor(new Request(`http://${hostname}:4173/`));
      expect(await shell.text()).toContain(
        `data-jgz-preview-origin="http://${expectedHostname}:4174"`,
      );

      const play = await preview(
        new Request(`http://${hostname}:4174/play/demo_game`),
      );
      expect(play.status).toBe(200);
      expect(play.headers.get("content-security-policy")).toBe(
        `frame-ancestors http://${expectedHostname}:4173`,
      );
      expect(await play.text()).toContain(
        `data-jgz-parent-origin="http://${expectedHostname}:4173"`,
      );

      const source = await preview(
        new Request(
          `http://${hostname}:4174/api/projects/demo_game/files/main.js`,
        ),
      );
      expect(source.headers.get("access-control-allow-origin")).toBe(
        `http://${expectedHostname}:4173`,
      );
    }
  });

  test("only a loopback server is offered under its other loopback names", () => {
    expect(browserHostnames("localhost")).toEqual([
      "localhost",
      "127.0.0.1",
      "[::1]",
    ]);
    expect(browserHostnames("[::1]")).toEqual([
      "[::1]",
      "127.0.0.1",
      "localhost",
    ]);
    expect(browserHostnames("192.168.1.20")).toEqual(["192.168.1.20"]);
    expect(browserHostnames("example.test")).toEqual(["example.test"]);
  });

  test("editor mutations reject learner-preview origins", async () => {
    const response = await request("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: "http://127.0.0.1:4274",
      },
      body: JSON.stringify({ name: "created_by_learner" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "forbidden" });
    expect(await readdir(projectsRoot)).not.toContain("created_by_learner");
  });

  test("editor mutations reject Sec-Fetch-Site: same-site from the preview port (same host, different origin)", async () => {
    // Real browsers classify same-host/different-port as `same-site`, so the
    // isolated preview's mutations arrive with this header; it must fall
    // through to the host comparison rather than being accepted outright.
    const response = await request("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: "http://127.0.0.1:4274",
        "sec-fetch-site": "same-site",
      },
      body: JSON.stringify({ name: "created_by_learner_same_site" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "forbidden" });
    expect(await readdir(projectsRoot)).not.toContain(
      "created_by_learner_same_site",
    );
  });

  test("editor mutations accept an https origin against an http request URL (TLS-terminating proxy)", async () => {
    const response = await request("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: "https://localhost",
      },
      body: JSON.stringify({ name: "created_behind_proxy" }),
    });
    expect(response.status).toBe(201);
    expect(await readdir(projectsRoot)).toContain("created_behind_proxy");
  });

  test("editor mutations accept Sec-Fetch-Site: same-origin even with a mismatched Origin scheme", async () => {
    const response = await request("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: "https://totally-different-host.example",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ name: "created_via_sec_fetch_site" }),
    });
    expect(response.status).toBe(201);
    expect(await readdir(projectsRoot)).toContain("created_via_sec_fetch_site");
  });

  test("editor mutations reject Sec-Fetch-Site: cross-site regardless of Origin host", async () => {
    const response = await request("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        origin: "http://localhost",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ name: "created_cross_site" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "forbidden" });
    expect(await readdir(projectsRoot)).not.toContain("created_cross_site");
  });

  test("JGZ_ALLOWED_ORIGINS allows a cross-host origin to be explicitly trusted", async () => {
    const previous = process.env.JGZ_ALLOWED_ORIGINS;
    process.env.JGZ_ALLOWED_ORIGINS =
      "example.dev, forwarded-host.example:4173";
    try {
      const response = await request("/api/projects", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "https://forwarded-host.example:4173",
        },
        body: JSON.stringify({ name: "created_via_allowlist" }),
      });
      expect(response.status).toBe(201);
      expect(await readdir(projectsRoot)).toContain("created_via_allowlist");
    } finally {
      if (previous === undefined) delete process.env.JGZ_ALLOWED_ORIGINS;
      else process.env.JGZ_ALLOWED_ORIGINS = previous;
    }
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

    const docs = await request("/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
    expect(await docs.text()).toContain('src="/client/docs.js"');
    expect((await request("/docs/")).status).toBe(200);
    expect((await request("/docs", { method: "POST" })).status).toBe(405);

    const docsBundle = await request("/client/docs.js");
    expect(docsBundle.status).toBe(200);
    expect(docsBundle.headers.get("content-type")).toContain("text/javascript");
    expect((await docsBundle.text()).length).toBeGreaterThan(0);

    const styles = await request("/client/app.css");
    expect(styles.status).toBe(200);
    expect(styles.headers.get("content-type")).toContain("text/css");

    const previewBundle = await request("/client/preview.js");
    expect(previewBundle.status).toBe(200);
    expect(previewBundle.headers.get("content-type")).toContain(
      "text/javascript",
    );

    const preview = await request("/play/demo_game");
    expect(preview.status).toBe(200);
    const previewHtml = await preview.text();
    expect(previewHtml).toContain('data-jgz-entry="main.js"');
    expect(previewHtml).toContain('src="/client/preview.js"');
  });

  test("e2e fixture routes are gated behind testFixtures", async () => {
    expect(testFixtureRoutesLoaded()).toBe(false);
    // Default handler (as used by the real product server without
    // --test-fixtures / JGZ_TEST_FIXTURES=1): fixture pages/assets 404,
    // while real product routes keep working.
    const fixturesOff = createSandboxServerHandler({ projectsRoot });
    const gatedPage = await fixturesOff(
      new Request("http://localhost/fixtures/rendering/drawing"),
    );
    expect(gatedPage.status).toBe(404);
    const gatedAsset = await fixturesOff(
      new Request(
        "http://localhost/fixture-assets/rendering-fixture/images/player.svg",
      ),
    );
    expect(gatedAsset.status).toBe(404);
    const gatedRuntime = await fixturesOff(
      new Request("http://localhost/test-fixtures/runtime.js"),
    );
    expect(gatedRuntime.status).toBe(404);
    const health = await fixturesOff(
      new Request("http://localhost/api/health"),
    );
    expect(health.status).toBe(200);
    const examples = await fixturesOff(
      new Request("http://localhost/examples"),
    );
    expect(examples.status).toBe(200);
    expect(testFixtureRoutesLoaded()).toBe(false);

    // With testFixtures enabled (as playwright.config.ts's webServer command
    // does via --test-fixtures), the fixture pages/assets respond.
    const fixturesOn = createSandboxServerHandler({
      projectsRoot,
      testFixtures: true,
    });
    // Constructing the opted-in handler is still lazy; the test-owned module
    // is evaluated only when a request falls through the product routes.
    expect(testFixtureRoutesLoaded()).toBe(false);
    const openPage = await fixturesOn(
      new Request("http://localhost/fixtures/rendering/drawing"),
    );
    expect(openPage.status).toBe(200);
    expect(testFixtureRoutesLoaded()).toBe(true);
    const openAsset = await fixturesOn(
      new Request(
        "http://localhost/fixture-assets/rendering-fixture/images/player.svg",
      ),
    );
    expect(openAsset.status).toBe(200);
    const openRuntime = await fixturesOn(
      new Request("http://localhost/test-fixtures/runtime.js"),
    );
    expect(openRuntime.status).toBe(200);
    expect(openRuntime.headers.get("content-type")).toContain(
      "text/javascript",
    );

    const syncedAsset = await fixturesOn(
      new Request(
        "http://localhost/fixture-assets/asset-sync-fixture/images/player.svg",
      ),
    );
    expect(syncedAsset.status).toBe(200);
    expect(syncedAsset.headers.get("content-type")).toBe("image/svg+xml");
  });
});
