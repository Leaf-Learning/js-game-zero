import { describe, expect, test } from "bun:test";
import { SandboxController } from "../client/controller";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("SandboxController selection ordering", () => {
  test("an older project save barrier cannot replace a newer selection", async () => {
    const barriers = [deferred<boolean>(), deferred<boolean>()];
    let call = 0;
    const controller = new SandboxController({
      flushSave: () => barriers[call++]!.promise,
      readFile: async () => "",
    });

    const first = controller.selectProject("first");
    const second = controller.selectProject("second");
    barriers[1]!.resolve(true);
    expect(await second).toBe(true);
    barriers[0]!.resolve(true);
    expect(await first).toBe(false);
    expect(controller.selectedProject).toBe("second");
  });

  test("an older file read cannot overwrite the newest file", async () => {
    const reads = new Map<string, ReturnType<typeof deferred<string>>>();
    const controller = new SandboxController({
      flushSave: async () => true,
      readFile: async (_project, path) => {
        const pending = deferred<string>();
        reads.set(path, pending);
        return pending.promise;
      },
    });
    await controller.selectProject("demo");

    const first = controller.selectFile("first.js");
    while (!reads.has("first.js")) await Promise.resolve();
    const second = controller.selectFile("second.js");
    while (!reads.has("second.js")) await Promise.resolve();
    reads.get("second.js")!.resolve("newest");
    expect(await second).toEqual({
      project: "demo",
      path: "second.js",
      content: "newest",
    });
    reads.get("first.js")!.resolve("stale");
    expect(await first).toBeNull();
    expect(controller.selectedFile).toBe("second.js");
  });

  test("a stale rejected file read is ignored", async () => {
    const reads = new Map<string, ReturnType<typeof deferred<string>>>();
    const controller = new SandboxController({
      flushSave: async () => true,
      readFile: async (_project, path) => {
        const pending = deferred<string>();
        reads.set(path, pending);
        return pending.promise;
      },
    });
    await controller.selectProject("demo");

    const first = controller.selectFile("first.js");
    while (!reads.has("first.js")) await Promise.resolve();
    const second = controller.selectFile("second.js");
    while (!reads.has("second.js")) await Promise.resolve();
    reads.get("second.js")!.resolve("newest");
    await second;
    reads.get("first.js")!.reject(new Error("stale failure"));
    await expect(first).resolves.toBeNull();
  });
});
