import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import type { ProtocolCommand, StatePath } from "./protocol";
import { ProtocolError } from "./protocol";
import { startProjectServer, type ProjectServer } from "./project-server";

export type SessionEvent = {
  readonly event:
    "ready" | "restarted" | "diagnostic" | "console" | "runtime-error";
  readonly [key: string]: unknown;
};

export type SessionOptions = {
  readonly projectDirectory: string;
  readonly headed: boolean;
  readonly seed?: string;
  readonly timeout: number;
  readonly cwd?: string;
  readonly onEvent: (event: SessionEvent) => void;
};

type DriverStatus = {
  readonly state: string;
  readonly elapsed: number;
  readonly frames: number;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly density: number;
  };
  readonly diagnostics: readonly unknown[];
  readonly failure: unknown;
  readonly startupError: string | null;
  readonly pixels?: PixelSummary;
};

type PixelSummary = {
  readonly distinctColors: number;
  readonly frameHash: string;
};

type DriverWindow = Window & {
  __jgzDriver?: {
    initialized: boolean;
    status(options?: { pixels?: boolean }): DriverStatus;
    step(dt: number, count: number): DriverStatus;
    inspect(path?: StatePath): unknown;
    call(binding: string): unknown;
    screenshot(): { dataUrl: string; pixels: PixelSummary };
  };
};

export class GameSession {
  readonly #options: SessionOptions;
  readonly #server: ProjectServer;
  readonly #browser: Browser;
  readonly #context: BrowserContext;
  readonly #page: Page;
  readonly #artifactsRoot: string;
  /** Canonical Playwright key name -> first user-facing spelling. */
  readonly #heldKeys = new Map<string, string>();
  readonly #heldMouseButtons = new Set<"left" | "middle" | "right">();
  readonly #consoleMessages: { level: string; text: string }[] = [];
  readonly #pageErrors: string[] = [];
  #screenshotNumber = 0;
  #closed = false;

  private constructor(
    options: SessionOptions,
    server: ProjectServer,
    browser: Browser,
    context: BrowserContext,
    page: Page,
    artifactsRoot: string,
  ) {
    this.#options = options;
    this.#server = server;
    this.#browser = browser;
    this.#context = context;
    this.#page = page;
    this.#artifactsRoot = artifactsRoot;
  }

  static async create(options: SessionOptions): Promise<GameSession> {
    const server = await startProjectServer(options.projectDirectory);
    let browser: Browser;
    try {
      browser = await chromium.launch({ headless: !options.headed });
    } catch (error) {
      server.close();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${message}\nInstall Chromium with: bunx playwright install chromium`,
      );
    }
    let context: BrowserContext | undefined;
    try {
      // Device pixel ratio 1 keeps games at pixel density 1, so screenshots
      // and pixel summaries are WIDTH × HEIGHT unless a game sets
      // PIXEL_DENSITY itself.
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      });
      if (options.seed !== undefined) {
        await context.addInitScript(seedRandom, hashSeed(options.seed));
      }
      const page = await context.newPage();
      page.setDefaultTimeout(options.timeout);
      page.setDefaultNavigationTimeout(options.timeout);
      const artifactsRoot = await mkdtemp(join(tmpdir(), "js-game-zero-cli-"));
      const session = new GameSession(
        options,
        server,
        browser,
        context,
        page,
        artifactsRoot,
      );
      await session.#preparePage();
      return session;
    } catch (error) {
      await context?.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      server.close();
      throw error;
    }
  }

  async execute(command: ProtocolCommand): Promise<unknown> {
    if (this.#closed)
      throw new ProtocolError("command_failed", "Session is closed.");
    switch (command.command) {
      case "status":
        return this.status(command.pixels === true);
      case "step": {
        const status = await this.#page.evaluate(
          ({ dt, count }) =>
            (window as DriverWindow).__jgzDriver?.step(dt, count),
          command,
        );
        return this.#decorateStatus(requireResult(status));
      }
      case "key":
        return this.#key(command.action, command.key);
      case "mouse":
        return this.#mouse(command);
      case "wheel":
        return this.#wheel(command.direction, command.x, command.y);
      case "inspect":
        return this.#inspect(command.path);
      case "call":
        return this.#call(command.binding);
      case "play":
        return this.#play(command);
      case "screenshot":
        return this.#screenshot(command.path, command.inline === true);
      case "restart":
        return this.restart("command");
      case "help":
        return { commands: HELP_COMMANDS };
      case "quit":
        return { closing: true };
    }
  }

  async status(pixels = false): Promise<unknown> {
    const status = await this.#page.evaluate(
      (options) => (window as DriverWindow).__jgzDriver?.status(options),
      { pixels },
    );
    return this.#decorateStatus(requireResult(status));
  }

  async restart(source: "command" | "watch"): Promise<unknown> {
    await this.#releaseHeldInput();
    this.#consoleMessages.length = 0;
    this.#pageErrors.length = 0;
    await this.#page.reload({
      waitUntil: "load",
      timeout: this.#options.timeout,
    });
    await this.#waitForInitialization();
    const status = await this.status();
    this.#options.onEvent({ event: "restarted", source, status });
    return status;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#releaseHeldInput().catch(() => undefined);
    await this.#context.close().catch(() => undefined);
    await this.#browser.close().catch(() => undefined);
    this.#server.close();
  }

  async #preparePage(): Promise<void> {
    await this.#page.exposeBinding(
      "__jgzEmit",
      (_source, event: SessionEvent) => {
        if (
          event &&
          typeof event === "object" &&
          typeof event.event === "string"
        ) {
          this.#options.onEvent(event);
        }
      },
    );
    this.#page.on("console", (message) => {
      const entry = { level: message.type(), text: message.text() };
      pushBounded(this.#consoleMessages, entry);
      this.#options.onEvent({
        event: "console",
        ...entry,
      });
    });
    this.#page.on("pageerror", (error) => {
      pushBounded(this.#pageErrors, error.message);
      this.#options.onEvent({ event: "runtime-error", message: error.message });
    });
    await this.#page.goto(this.#server.url, {
      waitUntil: "load",
      timeout: this.#options.timeout,
    });
    await this.#waitForInitialization();
  }

  async #waitForInitialization(): Promise<void> {
    await this.#page.waitForFunction(
      () => (window as DriverWindow).__jgzDriver?.initialized === true,
      undefined,
      { timeout: this.#options.timeout },
    );
  }

  #decorateStatus(status: DriverStatus): unknown {
    return {
      ...status,
      heldKeys: [...this.#heldKeys.values()].sort(),
      heldMouseButtons: [...this.#heldMouseButtons].sort(),
      console: [...this.#consoleMessages],
      pageErrors: [...this.#pageErrors],
    };
  }

  async #key(action: "down" | "up" | "tap", input: string): Promise<unknown> {
    const key = normalizeKey(input);
    if (action === "down") {
      if (!this.#heldKeys.has(key)) {
        await this.#page.keyboard.down(key);
        this.#heldKeys.set(key, input.toLowerCase());
      }
    } else if (action === "up") {
      await this.#page.keyboard.up(key);
      this.#heldKeys.delete(key);
    } else {
      await this.#page.keyboard.press(key);
    }
    return this.status();
  }

  async #mouse(
    command: Extract<ProtocolCommand, { command: "mouse" }>,
  ): Promise<unknown> {
    if (command.x !== undefined && command.y !== undefined) {
      await this.#moveMouse(command.x, command.y);
    }
    const button = command.button ?? "left";
    if (command.action === "down") {
      if (!this.#heldMouseButtons.has(button)) {
        await this.#page.mouse.down({ button });
        this.#heldMouseButtons.add(button);
      }
    } else if (command.action === "up") {
      await this.#page.mouse.up({ button });
      this.#heldMouseButtons.delete(button);
    } else if (command.action === "click")
      await this.#page.mouse.click(
        ...(await this.#logicalPoint(command.x!, command.y!)),
        { button },
      );
    return this.status();
  }

  async #wheel(
    direction: "up" | "down",
    x?: number,
    y?: number,
  ): Promise<unknown> {
    const status = (await this.status()) as { canvas: DriverStatus["canvas"] };
    const logicalX = x ?? status.canvas.width / 2;
    const logicalY = y ?? status.canvas.height / 2;
    const [clientX, clientY] = await this.#logicalPoint(logicalX, logicalY);
    await this.#moveMouse(logicalX, logicalY);
    await this.#page.locator("[data-jgz-canvas]").dispatchEvent("wheel", {
      clientX,
      clientY,
      deltaY: direction === "up" ? -100 : 100,
      buttons: 0,
    });
    return this.status();
  }

  async #moveMouse(x: number, y: number): Promise<void> {
    const [clientX, clientY] = await this.#logicalPoint(x, y);
    await this.#page.mouse.move(clientX, clientY);
  }

  async #logicalPoint(x: number, y: number): Promise<[number, number]> {
    const dimensions = await this.#page.evaluate(() => {
      const canvas =
        document.querySelector<HTMLCanvasElement>("[data-jgz-canvas]");
      if (!canvas) return null;
      const box = canvas.getBoundingClientRect();
      // The logical screen size: density multiplies canvas.width/height.
      const logical = (window as DriverWindow).__jgzDriver?.status().canvas;
      return {
        left: box.left,
        top: box.top,
        displayedWidth: box.width,
        displayedHeight: box.height,
        width: logical?.width ?? canvas.width,
        height: logical?.height ?? canvas.height,
      };
    });
    if (!dimensions) throw new Error("Game canvas is unavailable.");
    return [
      dimensions.left + (x / dimensions.width) * dimensions.displayedWidth,
      dimensions.top + (y / dimensions.height) * dimensions.displayedHeight,
    ];
  }

  /** One value, every top-level binding, or a map keyed by each path's text. */
  async #inspectMany(
    request: StatePath | readonly StatePath[] | true,
  ): Promise<unknown> {
    if (request === true) return this.#inspect(undefined);
    if (!Array.isArray(request)) return this.#inspect(request as StatePath);
    const values: Record<string, unknown> = {};
    for (const path of request as readonly StatePath[]) {
      try {
        values[path.source] = await this.#inspect(path);
      } catch (error) {
        values[path.source] = { error: firstLine(error) };
      }
    }
    return values;
  }

  async #inspect(path?: StatePath): Promise<unknown> {
    return this.#page.evaluate(
      (target) => (window as DriverWindow).__jgzDriver?.inspect(target),
      path,
    );
  }

  async #call(binding: string): Promise<unknown> {
    try {
      return await this.#page.evaluate(
        (name) => (window as DriverWindow).__jgzDriver?.call(name),
        binding,
      );
    } catch (error) {
      throw new ProtocolError("command_failed", firstLine(error));
    }
  }

  /** Runs a batch of input and time actions, then reports once: the status
   * with pixel summary, plus an inspection and an inline screenshot on
   * request. One round trip per scenario instead of one per keystroke. With
   * `restart` the project is reloaded from disk and stepped one frame first,
   * so a boot check, a scenario and its evidence fit in one request. */
  async #play(
    command: Extract<ProtocolCommand, { command: "play" }>,
  ): Promise<unknown> {
    if (command.restart) {
      await this.restart("command");
      await this.execute({ command: "step", dt: 1 / 60, count: 1 });
    }
    for (const action of command.actions) await this.execute(action);
    const status = await this.status(true);
    return {
      status,
      ...(command.inspect === undefined
        ? {}
        : { inspect: await this.#inspectMany(command.inspect) }),
      ...(command.screenshot
        ? { screenshot: await this.#screenshot(undefined, true) }
        : {}),
    };
  }

  async #screenshot(requestedPath?: string, inline = false): Promise<unknown> {
    const shot = await this.#page.evaluate(() =>
      (window as DriverWindow).__jgzDriver?.screenshot(),
    );
    if (!shot) throw new Error("Game canvas is unavailable.");
    const comma = shot.dataUrl.indexOf(",");
    if (comma === -1) throw new Error("Browser returned an invalid PNG.");
    const data = shot.dataUrl.slice(comma + 1);
    const status = (await this.status()) as { canvas: DriverStatus["canvas"] };
    if (inline) return { data, ...status.canvas, pixels: shot.pixels };
    this.#screenshotNumber += 1;
    const path = resolveScreenshotPath(
      requestedPath,
      this.#options.cwd ?? process.cwd(),
      this.#artifactsRoot,
      this.#screenshotNumber,
    );
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, Buffer.from(data, "base64"));
    return { path, ...status.canvas, pixels: shot.pixels };
  }

  async #releaseHeldInput(): Promise<void> {
    for (const key of this.#heldKeys.keys()) {
      await this.#page.keyboard.up(key).catch(() => undefined);
    }
    this.#heldKeys.clear();
    for (const button of this.#heldMouseButtons) {
      await this.#page.mouse.up({ button }).catch(() => undefined);
    }
    this.#heldMouseButtons.clear();
  }
}

export function resolveScreenshotPath(
  requestedPath: string | undefined,
  invocationDirectory: string,
  artifactsRoot: string,
  number: number,
): string {
  if (requestedPath !== undefined) {
    return isAbsolute(requestedPath)
      ? requestedPath
      : resolve(invocationDirectory, requestedPath);
  }
  const name = `screenshot-${String(number).padStart(4, "0")}.png`;
  return join(artifactsRoot, name);
}

export const HELP_COMMANDS = [
  "status",
  "step [dt=0.0166666667] [count=1]",
  "key down|up|tap <key>",
  "mouse move <x> <y>",
  "mouse down|up <left|middle|right> [x y]",
  "mouse click <left|middle|right> <x> <y>",
  "wheel <up|down> [x y]",
  "inspect [binding.property[index]]",
  "state",
  "call <binding>",
  "play (JSON only: actions[], restart, inspect, screenshot)",
  "screenshot [path]",
  "restart",
  "help",
  "quit",
] as const;

const keyAliases: Record<string, string> = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  space: "Space",
  enter: "Enter",
  return: "Enter",
  escape: "Escape",
  esc: "Escape",
  shift: "Shift",
  control: "Control",
  ctrl: "Control",
  alt: "Alt",
  meta: "Meta",
};

export function normalizeKey(input: string): string {
  const lower = input.toLowerCase();
  const alias = keyAliases[lower];
  if (alias) return alias;
  if (/^[a-z0-9]$/i.test(input)) return input.toUpperCase();
  if (/^f(?:[1-9]|1[0-5])$/i.test(input)) return input.toUpperCase();
  throw new ProtocolError("invalid_request", `Unsupported key: ${input}`);
}

/** Playwright prefixes evaluate errors with "evaluate:" and appends the
 * in-page stack; the game's own message is the only useful part. */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.split("\n")[0] ?? message).replace(
    /^(evaluate: )?(Error: )?/,
    "",
  );
}

function requireResult<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Game driver is unavailable.");
  return value;
}

function pushBounded<T>(values: T[], value: T): void {
  values.push(value);
  if (values.length > 100) values.shift();
}

/** A plain integer seed is used as-is, so a seed chosen for one harness
 * reproduces the same Math.random sequence here; other strings are hashed. */
function hashSeed(value: string): number {
  if (/^\d{1,9}$/.test(value)) return Number(value) >>> 0;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seedRandom(seed: number): void {
  let state = seed || 0x6d2b79f5;
  Math.random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
