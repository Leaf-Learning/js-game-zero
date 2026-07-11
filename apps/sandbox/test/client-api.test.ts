import { afterEach, describe, expect, test } from "bun:test";
import {
  ApiError,
  assetSourceUrl,
  createFile,
  createProject,
  deleteAsset,
  deleteFile,
  deleteProject,
  getProject,
  listProjects,
  listExamples,
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
            },
          ],
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
});
