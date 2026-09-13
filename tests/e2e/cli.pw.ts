import { expect, test } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");
const cliBinary = join(repoRoot, "packages/cli/dist/cli.js");

test("drives a game through JSONL, inspects it, and reloads edits", async () => {
  test.setTimeout(45_000);
  const root = await mkdtemp(join(tmpdir(), "jgz-cli-e2e-"));
  const project = join(root, "game");
  await mkdir(project);
  await mkdir(join(project, "images"));
  await writeFile(join(project, "images/hero.svg"), spriteSource(10), "utf8");
  await writeFile(join(project, "main.js"), gameSource(10), "utf8");
  const cliEnvironment = { ...process.env };
  delete cliEnvironment.FORCE_COLOR;
  const client = new JsonlClient(
    spawn(
      cliBinary,
      ["test", project, "--json", "--watch", "--seed", "repeatable"],
      { cwd: repoRoot, env: cliEnvironment },
    ),
  );

  try {
    await client.waitFor(
      (record) => record.type === "event" && record.event === "ready",
    );
    expect((await client.request({ command: "status" })).result).toMatchObject({
      state: "running",
      elapsed: 0,
      frames: 1,
      canvas: { width: 200, height: 100 },
      heldKeys: [],
      console: [],
      pageErrors: [],
    });

    const initial = await client.request({ command: "inspect" });
    expect(initial.result).toMatchObject({
      WIDTH: 200,
      HEIGHT: 100,
      player: { x: 10 },
      visits: 1,
      clockFired: false,
      sprite: { $type: "Actor", image: "hero", width: 10, height: 10 },
    });
    const firstRandom = (initial.result as { randomValue: number }).randomValue;

    await client.request({ command: "key", action: "down", key: "right" });
    const stepped = await client.request({
      command: "step",
      dt: 0.1,
      count: 5,
    });
    expect(stepped.result).toMatchObject({
      state: "running",
      elapsed: 0.5,
      frames: 6,
      heldKeys: ["right"],
    });
    await client.request({ command: "key", action: "up", key: "ArrowRight" });
    expect((await client.request({ command: "status" })).result).toMatchObject({
      heldKeys: [],
    });
    expect(
      (await client.request({ command: "inspect", path: "player.x" })).result,
    ).toBe(35);
    expect(
      (await client.request({ command: "inspect", path: "clockFired" })).result,
    ).toBe(true);
    await client.request({ command: "key", action: "tap", key: "Space" });
    expect(
      (await client.request({ command: "inspect", path: "taps" })).result,
    ).toBe(1);

    await client.request({ command: "mouse", action: "move", x: 15, y: 12 });
    expect(
      (await client.request({ command: "inspect", path: "lastMove[1]" }))
        .result,
    ).toBe(12);
    await client.request({
      command: "mouse",
      action: "click",
      button: "left",
      x: 25,
      y: 30,
    });
    expect(
      (await client.request({ command: "inspect", path: "lastClick[0]" }))
        .result,
    ).toBe(25);
    await client.request({ command: "wheel", direction: "up", x: 20, y: 20 });
    expect(
      (await client.request({ command: "inspect", path: "wheelUps" })).result,
    ).toBe(1);

    const screenshotPath = join(root, "capture.png");
    const screenshot = await client.request({
      command: "screenshot",
      path: screenshotPath,
    });
    expect(screenshot.result).toEqual({
      path: screenshotPath,
      width: 200,
      height: 100,
    });
    expect([
      ...new Uint8Array(await readFile(screenshotPath)).slice(0, 8),
    ]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    await client.request({ command: "restart" });
    expect(
      (await client.request({ command: "inspect", path: "randomValue" }))
        .result,
    ).toBe(firstRandom);
    expect(
      (await client.request({ command: "inspect", path: "visits" })).result,
    ).toBe(2);

    await writeFile(join(project, "images/hero.svg"), spriteSource(20), "utf8");
    await writeFile(join(project, "main.js"), gameSource(40), "utf8");
    await client.waitFor(
      (record) =>
        record.type === "event" &&
        record.event === "restarted" &&
        record.source === "watch",
    );
    expect(
      (await client.request({ command: "inspect", path: "player.x" })).result,
    ).toBe(40);
    expect(
      (await client.request({ command: "inspect", path: "sprite.width" }))
        .result,
    ).toBe(20);

    const quit = await client.request({ command: "quit" });
    expect(quit.result).toEqual({ closing: true });
    expect(await client.exited()).toBe(0);
    expect(client.stderr).toBe("");
  } finally {
    client.stop();
    await rm(root, { force: true, recursive: true });
  }
});

test("reports a fatal game failure without corrupting JSON output", async () => {
  test.setTimeout(30_000);
  const root = await mkdtemp(join(tmpdir(), "jgz-cli-failure-"));
  const project = join(root, "game");
  await mkdir(project);
  await writeFile(
    join(project, "main.js"),
    `WIDTH = 40;
HEIGHT = 30;
function draw() { throw new Error("draw exploded"); }
`,
    "utf8",
  );
  const cliEnvironment = { ...process.env };
  delete cliEnvironment.FORCE_COLOR;
  const client = new JsonlClient(
    spawn(cliBinary, ["test", project, "--json"], {
      cwd: repoRoot,
      env: cliEnvironment,
    }),
  );

  try {
    await client.waitFor(
      (record) => record.type === "event" && record.event === "ready",
    );
    const status = await client.request({ command: "status" });
    expect(status.result).toMatchObject({
      state: "failed",
      canvas: { width: 40, height: 30 },
      failure: { phase: "draw", message: "draw exploded" },
    });
    expect(
      (status.result as { diagnostics: { severity: string }[] }).diagnostics,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: "error" })]),
    );
    await client.request({ command: "quit" });
    expect(await client.exited()).toBe(0);
    expect(client.stderr).toBe("");
  } finally {
    client.stop();
    await rm(root, { force: true, recursive: true });
  }
});

function gameSource(startX: number): string {
  return `WIDTH = 200;
HEIGHT = 100;
let player = { x: ${startX} }, lastClick = null, wheelUps = 0;
let sprite = new Actor("hero", [80, 50]);
let clockFired = false, taps = 0, lastMove = null;
let randomValue = Math.random();
storage.setdefault("visits", 0);
storage.visits += 1;
let visits = storage.visits;
clock.schedule(() => { clockFired = true; }, 0.1);

function update(dt) {
  if (keyboard.right) player.x += 50 * dt;
}

function on_key_down(key) {
  if (key === keys.SPACE) taps += 1;
}

function on_mouse_move(pos) {
  lastMove = pos;
}

function on_mouse_down(pos, button) {
  if (button === mouse.WHEEL_UP) wheelUps += 1;
  else lastClick = pos;
}

function draw() {
  screen.fill("#123456");
  screen.draw.filled_circle([player.x, 50], 5, "white");
}
`;
}

function spriteSource(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="red"/></svg>`;
}

type JsonRecord = Record<string, unknown>;

class JsonlClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #records: JsonRecord[] = [];
  readonly #waiters = new Set<() => void>();
  #buffer = "";
  #nextId = 0;
  stderr = "";

  constructor(child: ChildProcessWithoutNullStreams) {
    this.#child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.#accept(chunk));
    child.stderr.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
  }

  async request(request: JsonRecord): Promise<JsonRecord> {
    this.#nextId += 1;
    const id = this.#nextId;
    this.#child.stdin.write(`${JSON.stringify({ id, ...request })}\n`);
    return this.waitFor(
      (record) => record.type === "response" && record.id === id,
    );
  }

  async waitFor(
    predicate: (record: JsonRecord) => boolean,
    timeout = 15_000,
  ): Promise<JsonRecord> {
    const existing = this.#take(predicate);
    if (existing) return existing;
    return new Promise<JsonRecord>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.#waiters.delete(check);
        reject(
          new Error(
            `Timed out waiting for CLI output. stderr=${this.stderr} records=${JSON.stringify(this.#records)}`,
          ),
        );
      }, timeout);
      const check = () => {
        const record = this.#take(predicate);
        if (!record) return;
        clearTimeout(timer);
        this.#waiters.delete(check);
        resolvePromise(record);
      };
      this.#waiters.add(check);
    });
  }

  exited(): Promise<number | null> {
    return new Promise((resolvePromise) => {
      if (this.#child.exitCode !== null) {
        resolvePromise(this.#child.exitCode);
        return;
      }
      this.#child.once("exit", (code) => resolvePromise(code));
    });
  }

  stop(): void {
    if (this.#child.exitCode === null) this.#child.kill("SIGTERM");
  }

  #accept(chunk: string): void {
    this.#buffer += chunk;
    let newline = this.#buffer.indexOf("\n");
    while (newline !== -1) {
      const line = this.#buffer.slice(0, newline).trim();
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line) this.#records.push(JSON.parse(line) as JsonRecord);
      for (const wake of [...this.#waiters]) wake();
      newline = this.#buffer.indexOf("\n");
    }
  }

  #take(predicate: (record: JsonRecord) => boolean): JsonRecord | undefined {
    const index = this.#records.findIndex(predicate);
    if (index === -1) return undefined;
    return this.#records.splice(index, 1)[0];
  }
}
