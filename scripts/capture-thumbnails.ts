// Draws the sandbox example gallery's thumbnails. Each short example runs
// in jgz for a moment, long enough to have something on screen, and its
// canvas is saved. The full games reuse the gameplay screenshots in
// docs/media, which show a game in the middle of being played.
//
//   bun scripts/capture-thumbnails.ts
//
// Needs Chromium for Playwright (`bunx playwright install chromium`).
import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { exampleManifest } from "../examples/manifest";

const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "apps/sandbox/client/thumbnails");

/** How many 60fps frames each short example runs before its picture. */
const framesBeforeCapture: Readonly<Record<string, number>> = {
  "drawing-basics": 45,
  "actor-movement": 45,
  "sound-tone": 45,
  "animation-basics": 45,
  "storage-save": 45,
};

const gameplayScreenshots: Readonly<Record<string, string>> = {
  "tappy-plane": "docs/media/game-flappy.png",
  breakout: "docs/media/game-breakout.png",
  "space-shooter": "docs/media/game-space-shooter.png",
  snake: "docs/media/game-snake.png",
  platformer: "docs/media/game-platformer.png",
};

async function capture(slug: string, frames: number): Promise<void> {
  const target = join(OUT, `${slug}.png`);
  const session = Bun.spawn(
    ["bun", "packages/cli/src/cli.ts", "test", `examples/${slug}`],
    { cwd: ROOT, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  session.stdin.write(
    `step 0.0166666667 ${frames}\nscreenshot ${JSON.stringify(target)}\nquit\n`,
  );
  await session.stdin.end();
  if ((await session.exited) !== 0) {
    throw new Error(
      `jgz couldn't capture ${slug}: ${await new Response(session.stderr).text()}`,
    );
  }
}

await mkdir(OUT, { recursive: true });
for (const example of exampleManifest) {
  if (example.mode !== "global") continue;
  const screenshot = gameplayScreenshots[example.slug];
  const frames = framesBeforeCapture[example.slug];
  if (screenshot) {
    await copyFile(join(ROOT, screenshot), join(OUT, `${example.slug}.png`));
  } else if (frames !== undefined) {
    await capture(example.slug, frames);
  } else {
    throw new Error(`Say how to draw a thumbnail for ${example.slug}.`);
  }
  console.log(`thumbnails/${example.slug}.png`);
}
