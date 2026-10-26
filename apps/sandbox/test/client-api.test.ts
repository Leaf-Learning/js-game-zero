import { afterEach, describe, expect, test } from "bun:test";
import {
  ApiError,
  WriteConflictError,
  assetSourceUrl,
  createFile,
  createProject,
  deleteAsset,
  deleteFile,
  deleteProject,
  getProject,
  listProjects,
  listDocumentation,
  listExamples,
  readDocumentation,
  readFile,
  renameFile,
  renameProject,
  uploadAsset,
  writeFile,
} from "../client/api";
import {
  DocumentSession,
  StaleDocumentWriteError,
} from "../client/document-session";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(
  handler: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Response | Promise<Response>,
): void {
  globalThis.fetch = (async (input, init) =>
    handler(input, init)) as typeof fetch;
}

function deferredResponse(): {
  readonly promise: Promise<Response>;
  resolve(response: Response): void;
} {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

describe("sandbox client API contracts", () => {
  test("writeFile rejects failed HTTP responses with the stable server code", async () => {
    stubFetch(() =>
      Response.json(
        { error: "Disk full.", code: "internal_error" },
        { status: 500 },
      ),
    );

    const result = writeFile("demo", "main.js", "draw();");
    await expect(result).rejects.toMatchObject({
      name: "ApiError",
      message: "Disk full.",
      code: "internal_error",
      status: 500,
    });
  });

  test("a stale current revision remains dirty until the server acknowledges a retry", async () => {
    const bodies: unknown[] = [];
    stubFetch((_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({
        ok: true,
        project: "stale-client",
        path: "collision.js",
        version: 1,
        stale: true,
      });
    });
    const session = new DocumentSession({
      write: ({ project, path, content, revision }) =>
        writeFile(project, path, content, { revision }),
      debounceMs: 60_000,
    });

    session.edit("stale-client", "collision.js", "CLIENT_B");
    await expect(session.flush()).rejects.toBeInstanceOf(
      StaleDocumentWriteError,
    );
    expect(session.state).toBe("error");
    expect(session.pendingSnapshot()?.content).toBe("CLIENT_B");

    await expect(session.flush()).rejects.toBeInstanceOf(
      StaleDocumentWriteError,
    );
    expect(session.state).toBe("error");
    expect(session.pendingSnapshot()?.content).toBe("CLIENT_B");
    expect(bodies).toHaveLength(2);
    expect(bodies).toEqual([
      expect.objectContaining({
        content: "CLIENT_B",
        baseVersion: 0,
        revision: 1,
      }),
      expect.objectContaining({
        content: "CLIENT_B",
        baseVersion: 0,
        revision: 1,
      }),
    ]);
    expect(
      bodies.every(
        (body) =>
          typeof (body as { sessionId?: unknown }).sessionId === "string",
      ),
    ).toBe(true);
  });

  test("an older read response cannot downgrade the next write's base version", async () => {
    const older = deferredResponse();
    const newer = deferredResponse();
    const writeBodies: Array<{ baseVersion: number }> = [];
    let reads = 0;
    stubFetch((_input, init) => {
      if (!init?.method || init.method === "GET") {
        reads += 1;
        return reads === 1 ? older.promise : newer.promise;
      }
      writeBodies.push(
        JSON.parse(String(init.body)) as { baseVersion: number },
      );
      return Response.json({
        ok: true,
        project: "read-race",
        path: "main.js",
        version: 3,
        stale: false,
      });
    });

    const first = readFile("read-race", "main.js");
    const second = readFile("read-race", "main.js");
    newer.resolve(
      Response.json({
        project: "read-race",
        path: "main.js",
        content: "NEWEST",
        version: 2,
      }),
    );
    expect(await second).toBe("NEWEST");
    older.resolve(
      Response.json({
        project: "read-race",
        path: "main.js",
        content: "OLDER",
        version: 1,
      }),
    );
    expect(await first).toBe("OLDER");

    await writeFile("read-race", "main.js", "EDITED", { revision: 1 });
    expect(writeBodies).toHaveLength(1);
    expect(writeBodies[0]?.baseVersion).toBe(2);
  });

  test("successful responses are validated instead of trusted casts", async () => {
    stubFetch(() =>
      Response.json({ projects: [{ name: "demo", files: [42] }] }),
    );

    const result = listProjects();
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ code: "invalid_response" });
  });

  test("read and upload operations use the same checked decoder", async () => {
    let call = 0;
    stubFetch(() => {
      call += 1;
      return call === 1
        ? Response.json({ error: "Gone.", code: "not_found" }, { status: 404 })
        : Response.json({ ok: true });
    });

    await expect(readFile("demo", "main.js")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
    await expect(
      uploadAsset("demo", "images/pixel.png", new File(["x"], "pixel.png")),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  test("network failures are normalized without losing the cause", async () => {
    const cause = new Error("socket closed");
    globalThis.fetch = (async () => {
      throw cause;
    }) as unknown as typeof fetch;

    try {
      await listProjects();
      throw new Error("Expected listProjects to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code: "network_error" });
      expect((error as ApiError).cause).toBe(cause);
    }
  });

  test("all public operations share the decoder and encode route segments", async () => {
    const requests: { readonly url: string; readonly init?: RequestInit }[] =
      [];
    stubFetch((input, init) => {
      const url = String(input);
      requests.push({ url, ...(init ? { init } : {}) });
      if (url === "/api/projects" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { name: string };
        return Response.json({
          project: { name: body.name, files: ["main.js"] },
        });
      }
      if (url === "/api/projects") {
        return Response.json({
          projects: [{ name: "demo", files: ["main.js"] }],
        });
      }
      if (url === "/api/examples") {
        return Response.json({
          examples: [
            {
              slug: "movement",
              title: "Movement",
              description: "Move around",
              expectsInput: "keyboard",
              gallery: "start-here",
            },
          ],
        });
      }
      if (url === "/api/docs") {
        return Response.json({
          documents: [
            {
              id: "getting-started",
              title: "Getting Started",
              section: "Learn",
              sourcePath: "docs/getting-started.md",
              navigation: true,
            },
          ],
        });
      }
      if (url === "/api/docs/reference/actor") {
        return Response.json({
          document: {
            id: "reference/actor",
            title: "Actor",
            section: "API Reference",
            sourcePath: "docs/reference/actor.md",
            navigation: true,
            markdown: "# Actor",
          },
        });
      }
      if (url.endsWith("/rename") && !url.endsWith("/files/rename")) {
        return Response.json({ project: { name: "next", files: ["main.js"] } });
      }
      if (init?.method === "GET" || init?.method === undefined) {
        if (url.includes("/files/")) {
          return Response.json({
            project: "demo",
            path: "src/main.js",
            content: "draw()",
            version: 0,
          });
        }
        return Response.json({ project: { name: "demo", files: ["main.js"] } });
      }
      return Response.json({
        ok: true,
        project: "demo",
        path: "main.js",
        version: 1,
      });
    });

    expect(assetSourceUrl("my game", "images/a b.png")).toBe(
      "/assets/my%20game/images/a%20b.png",
    );
    expect(await listProjects()).toHaveLength(1);
    expect(await getProject("my game")).toMatchObject({ name: "demo" });
    expect(await createProject("blank")).toMatchObject({ name: "blank" });
    expect(await createProject("clone", "movement")).toMatchObject({
      name: "clone",
    });
    await deleteProject("my game");
    expect(await renameProject("demo", "next")).toMatchObject({ name: "next" });
    expect(await readFile("demo", "src/main.js")).toBe("draw()");
    await writeFile("demo", "src/main.js", "updated", {
      keepalive: true,
      revision: 7,
    });
    await deleteFile("demo", "src/main.js");
    await renameFile("demo", "old.js", "new.js");
    await createFile("demo", "new.js");
    await uploadAsset("demo", "images/a b.png", new File(["x"], "a b.png"));
    await deleteAsset("demo", "images/a b.png");
    expect(await listExamples()).toHaveLength(1);
    expect(await listDocumentation()).toHaveLength(1);
    expect(await readDocumentation("reference/actor")).toMatchObject({
      id: "reference/actor",
      markdown: "# Actor",
    });

    expect(requests.some(({ url }) => url.includes("my%20game"))).toBe(true);
    expect(requests.some(({ url }) => url.includes("images/a%20b.png"))).toBe(
      true,
    );
    expect(
      requests.some(
        ({ init }) => init?.method === "PUT" && init.keepalive === true,
      ),
    ).toBe(true);
    const versionedWrite = requests.find(
      ({ init }) => init?.method === "PUT" && init.keepalive === true,
    );
    expect(JSON.parse(String(versionedWrite?.init?.body))).toEqual({
      content: "updated",
      baseVersion: 0,
      revision: 7,
      sessionId: expect.any(String),
    });
  });

  test("a version cache ahead of a restarted server rebases and retries the write once", async () => {
    const puts: Array<{ baseVersion: number; sessionId: string }> = [];
    let bootId = "boot-alpha";
    let serverVersion = 3;
    stubFetch((_input, init) => {
      if (!init?.method || init.method === "GET") {
        return Response.json({
          project: "restart-race",
          path: "main.js",
          content: "SERVER",
          version: serverVersion,
          bootId,
        });
      }
      const body = JSON.parse(String(init.body)) as {
        baseVersion: number;
        sessionId: string;
      };
      puts.push(body);
      if (body.baseVersion !== serverVersion) {
        return Response.json(
          {
            error: "The file changed after this edit was loaded.",
            code: "conflict",
          },
          { status: 409 },
        );
      }
      serverVersion += 1;
      return Response.json({
        ok: true,
        project: "restart-race",
        path: "main.js",
        version: serverVersion,
        stale: false,
        bootId,
      });
    });

    // The editor loads the file while the first server process is running.
    expect(await readFile("restart-race", "main.js")).toBe("SERVER");

    // The server restarts: fresh boot id, in-memory version state gone.
    bootId = "boot-beta";
    serverVersion = 0;

    const outcome = writeFile("restart-race", "main.js", "EDIT", {
      revision: 4,
    });
    await expect(outcome).resolves.toBe("written");
    // First attempt carries the stale cached base version; after the boot-id
    // resync the retry adopts the server's version verbatim (0, not max(3,0))
    // with a fresh write session.
    expect(puts.map((body) => body.baseVersion)).toEqual([3, 0]);
    expect(puts[0]!.sessionId).not.toBe(puts[1]!.sessionId);
  });

  test("a genuine conflict on the same boot is surfaced for recovery, not auto-retried", async () => {
    const puts: Array<{ baseVersion: number; content: string }> = [];
    let serverVersion = 1;
    stubFetch((_input, init) => {
      if (!init?.method || init.method === "GET") {
        return Response.json({
          project: "conflict-ui",
          path: "main.js",
          content: "THEIRS",
          version: serverVersion,
          bootId: "boot-conflict",
        });
      }
      const body = JSON.parse(String(init.body)) as {
        baseVersion: number;
        content: string;
      };
      puts.push(body);
      if (body.baseVersion !== serverVersion) {
        return Response.json(
          {
            error: "The file changed after this edit was loaded.",
            code: "conflict",
          },
          { status: 409 },
        );
      }
      serverVersion += 1;
      return Response.json({
        ok: true,
        project: "conflict-ui",
        path: "main.js",
        version: serverVersion,
        stale: false,
        bootId: "boot-conflict",
      });
    });

    await readFile("conflict-ui", "main.js");
    // Another client bumps the server version behind our back.
    serverVersion = 2;

    const conflicted = writeFile("conflict-ui", "main.js", "MINE", {
      revision: 1,
    });
    await expect(conflicted).rejects.toBeInstanceOf(WriteConflictError);
    await expect(conflicted).rejects.toMatchObject({
      project: "conflict-ui",
      path: "main.js",
      code: "conflict",
      status: 409,
    });
    expect(puts.map((body) => body.baseVersion)).toEqual([1]);

    // "Overwrite with my copy": the conflict re-read already rebased the
    // cached version, so a plain retry now succeeds.
    expect(
      await writeFile("conflict-ui", "main.js", "MINE", { revision: 2 }),
    ).toBe("written");
    expect(puts.map((body) => body.baseVersion)).toEqual([1, 2]);
  });

  test("createFile is exclusive: an existing file is a conflict with no rebase retry", async () => {
    const requests: Array<{ method: string; body?: unknown }> = [];
    stubFetch((_input, init) => {
      requests.push({
        method: init?.method ?? "GET",
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      });
      return Response.json(
        { error: "File already exists: main.js", code: "conflict" },
        { status: 409 },
      );
    });

    await expect(createFile("exclusive", "main.js")).rejects.toMatchObject({
      name: "ApiError",
      message: "File already exists: main.js",
      code: "conflict",
      status: 409,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "PUT",
      body: expect.objectContaining({ content: "", createOnly: true }),
    });
  });
});
