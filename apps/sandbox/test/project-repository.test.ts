import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SandboxConflictError } from "../src/path-policy";
import { ProjectRepository } from "../src/project-repository";
import { createSandboxServerHandler } from "../src/server";

const repoRoot = resolve(import.meta.dir, "../../..");

let projectsRoot = "";

beforeEach(async () => {
  projectsRoot = await mkdtemp(join(tmpdir(), "jgz-repository-"));
});

afterEach(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
});

function makeRepository(): ProjectRepository {
  return new ProjectRepository(projectsRoot, repoRoot);
}

describe("ProjectRepository boot id and restart behavior", () => {
  test("every repository instance announces a distinct boot id", () => {
    const first = makeRepository();
    const second = makeRepository();
    expect(first.bootId.length).toBeGreaterThan(0);
    expect(second.bootId.length).toBeGreaterThan(0);
    expect(first.bootId).not.toBe(second.bootId);
    expect(first.bootId).toBe(first.bootId);
  });

  test("a write rebased onto a restarted server's version state is accepted", async () => {
    const before = makeRepository();
    await before.createProject("demo_game");
    const first = await before.writeCodeFile("demo_game", "main.js", {
      content: "EDIT_ONE",
      baseVersion: 0,
      revision: 1,
      sessionId: "session-a",
    });
    expect(first).toMatchObject({ status: "written", version: 1 });

    // Restart: a new repository over the same projects root has no memory of
    // the previous version state.
    const after = makeRepository();
    const reread = await after.readCodeFile("demo_game", "main.js");
    expect(reread).toMatchObject({ content: "EDIT_ONE", version: 0 });

    // A rebased client adopts the fresh server version verbatim and retries.
    const retried = await after.writeCodeFile("demo_game", "main.js", {
      content: "EDIT_TWO",
      baseVersion: reread.version,
      revision: 1,
      sessionId: "session-a-rebased",
    });
    expect(retried).toMatchObject({ status: "written", version: 1 });
    expect(
      await readFile(join(projectsRoot, "demo_game", "main.js"), "utf8"),
    ).toBe("EDIT_TWO");
  });
});

describe("ProjectRepository exclusive create", () => {
  test("createOnly conflicts for on-disk files absent from version state", async () => {
    const repository = makeRepository();
    await repository.createProject("demo_game");
    // The scaffolded main.js was never written through writeCodeFile, so it
    // has no version state — only the filesystem knows it exists.
    const attempt = repository.writeCodeFile("demo_game", "main.js", {
      content: "",
      baseVersion: 0,
      revision: 0,
      sessionId: "session-a",
      createOnly: true,
    });
    await expect(attempt).rejects.toBeInstanceOf(SandboxConflictError);
    expect(
      await readFile(join(projectsRoot, "demo_game", "main.js"), "utf8"),
    ).toContain("Use the arrow keys!");
  });

  test("createOnly conflicts after a restart and leaves disk content intact", async () => {
    const before = makeRepository();
    await before.createProject("demo_game");
    await before.writeCodeFile("demo_game", "levels/one.js", {
      content: "// level one",
      baseVersion: 0,
      revision: 1,
      sessionId: "session-a",
    });

    const after = makeRepository();
    const attempt = after.writeCodeFile("demo_game", "levels/one.js", {
      content: "",
      baseVersion: 0,
      revision: 0,
      sessionId: "session-b",
      createOnly: true,
    });
    await expect(attempt).rejects.toBeInstanceOf(SandboxConflictError);
    expect(
      await readFile(
        join(projectsRoot, "demo_game", "levels", "one.js"),
        "utf8",
      ),
    ).toBe("// level one");
  });

  test("createOnly succeeds for a genuinely new file", async () => {
    const repository = makeRepository();
    await repository.createProject("demo_game");
    const created = await repository.writeCodeFile(
      "demo_game",
      "levels/two.js",
      {
        content: "",
        baseVersion: 0,
        revision: 0,
        sessionId: "session-a",
        createOnly: true,
      },
    );
    expect(created).toMatchObject({ status: "written", version: 1 });
    expect(
      await readFile(
        join(projectsRoot, "demo_game", "levels", "two.js"),
        "utf8",
      ),
    ).toBe("");
  });
});

describe("sandbox file routes carry the boot id and honor createOnly", () => {
  test("file reads and writes return the server's boot id, and createOnly over an existing file is a 409", async () => {
    const handler = createSandboxServerHandler({ projectsRoot });
    const request = (path: string, init?: RequestInit) =>
      handler(new Request(`http://localhost${path}`, init));

    const created = await request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "demo_game" }),
    });
    expect(created.status).toBe(201);

    const read = await request("/api/projects/demo_game/files/main.js");
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as { bootId?: string };
    expect(typeof readBody.bootId).toBe("string");

    const write = await request("/api/projects/demo_game/files/main.js", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "EDIT",
        baseVersion: 0,
        revision: 1,
        sessionId: "session-a",
      }),
    });
    expect(write.status).toBe(200);
    expect(await write.json()).toMatchObject({
      ok: true,
      bootId: readBody.bootId,
    });

    const clobber = await request("/api/projects/demo_game/files/main.js", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "",
        baseVersion: 0,
        revision: 0,
        sessionId: "session-b",
        createOnly: true,
      }),
    });
    expect(clobber.status).toBe(409);
    expect(await clobber.json()).toMatchObject({ code: "conflict" });
    expect(
      await readFile(join(projectsRoot, "demo_game", "main.js"), "utf8"),
    ).toBe("EDIT");
  });
});
