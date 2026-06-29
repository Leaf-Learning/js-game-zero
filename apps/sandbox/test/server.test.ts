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
import {
  deriveSandboxUiState,
  normalizeSandboxRelativePath,
} from "../src/sandbox";

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

  test("runtime bundle and preview HTML include executable browser entry points", async () => {
    await createProject();

    const runtime = await request("/runtime/browser.js");
    expect(runtime.status).toBe(200);
    expect(runtime.headers.get("content-type")).toContain("text/javascript");
    const runtimeSource = await runtime.text();
    expect(runtimeSource).toContain("document.querySelector");

    const preview = await request("/play/demo_game");
    expect(preview.status).toBe(200);
    const previewHtml = await preview.text();
    expect(previewHtml).toContain('data-jgz-entry="main.js"');
    expect(previewHtml).toContain("/api/projects/demo_game/files/main.js");
  });

  test("UI state model covers selected file, dirty state, play enabling, and diagnostics", () => {
    expect(
      deriveSandboxUiState({
        selectedProject: null,
        selectedFile: null,
        dirty: false,
        diagnostics: [],
      }),
    ).toEqual({
      selectedFileLabel: "No file selected",
      dirtyLabel: "Saved",
      playEnabled: false,
      saveEnabled: false,
      diagnosticsText: "No diagnostics",
    });

    expect(
      deriveSandboxUiState({
        selectedProject: "demo_game",
        selectedFile: "main.js",
        dirty: true,
        diagnostics: [{ message: "Did you mean draw instead of drwa?" }],
      }),
    ).toEqual({
      selectedFileLabel: "main.js",
      dirtyLabel: "Unsaved changes",
      playEnabled: true,
      saveEnabled: true,
      diagnosticsText: "Did you mean draw instead of drwa?",
    });
  });
});
