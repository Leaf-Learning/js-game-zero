import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listAssets,
  resolveConfinedFile,
  validateProject,
} from "../src/project-server";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("CLI project validation", () => {
  test("requires a regular main.js", async () => {
    const root = await temporaryRoot();
    await expect(validateProject(root)).rejects.toThrow("must contain main.js");
    await symlink(join(root, "missing.js"), join(root, "main.js"));
    await expect(validateProject(root)).rejects.toThrow("regular file");
  });

  test("lists only regular assets and ignores symlinks", async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, "main.js"), "function draw() {}", "utf8");
    await mkdir(join(root, "images", "nested"), { recursive: true });
    await writeFile(join(root, "images", "hero.png"), "png");
    await writeFile(join(root, "images", "nested", "enemy.svg"), "svg");
    await symlink(join(root, "main.js"), join(root, "images", "ignored.png"));

    const validated = await validateProject(root);
    expect(await listAssets(validated)).toEqual([
      "images/hero.png",
      "images/nested/enemy.svg",
    ]);
  });

  test("confines files even when a validated entry is replaced", async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await writeFile(join(root, "main.js"), "function draw() {}", "utf8");
    await writeFile(join(outside, "secret.js"), "not project data", "utf8");
    await unlink(join(root, "main.js"));
    await symlink(join(outside, "secret.js"), join(root, "main.js"));
    await expect(resolveConfinedFile(root, "main.js")).rejects.toThrow(
      "escapes the project",
    );
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "jgz-cli-project-"));
  temporaryRoots.push(root);
  return root;
}
