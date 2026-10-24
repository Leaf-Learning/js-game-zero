import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The comment a built file carrying js-game-zero's code opens with, after
 * any hashbang: the package, its version and the whole of LICENSE, since the
 * MIT License asks for its notice in every copy. Bundlers and minifiers keep
 * `/*!` comments, so a page or an app that bundles the file keeps it too.
 */
export async function licenseBanner(
  repoRoot: string,
  packageDir: string,
): Promise<string> {
  const manifest = JSON.parse(
    await readFile(join(repoRoot, packageDir, "package.json"), "utf8"),
  ) as { name: string; version: string };
  const license = await readFile(join(repoRoot, "LICENSE"), "utf8");
  const lines = [
    `${manifest.name} ${manifest.version}`,
    "https://github.com/Leaf-Learning/js-game-zero",
    "",
    ...license.trimEnd().split("\n"),
  ];
  return `/*!\n${lines.map((line) => (line ? ` * ${line}` : " *")).join("\n")}\n */`;
}
