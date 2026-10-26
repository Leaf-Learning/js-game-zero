import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chromium,
  errors,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import type { ProtocolCommand, StatePath } from "./protocol";
import { keyName, ProtocolError } from "./protocol";
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
  /** Aborting it abandons a session that is still starting. */
  readonly signal?: AbortSignal;
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
  __jgzSeed?: string;
};

/** A command that found the game stuck, after which its page was replaced. */
class StuckGameError extends ProtocolError {
  constructor(message: string) {
    super("command_failed", message);
  }
}

export class GameSession {
  readonly #options: SessionOptions;
  readonly #server: ProjectServer;
  readonly #browser: Browser;
  readonly #context: BrowserContext;
  #page: Page;
  /** Where screenshots taken without a path go: made on the first one, so
   * a session that takes none leaves no empty folder behind. */
  #artifactsRoot: string | null = null;
  /** The held keys, as Playwright presses them. */
  readonly #heldKeys = new Set<string>();
  readonly #heldMouseButtons = new Set<"left" | "middle" | "right">();
  readonly #consoleMessages: { level: string; text: string }[] = [];
  readonly #pageErrors: string[] = [];
  #screenshotNumber = 0;
  #replacingPage = false;
  #closed = false;

  private constructor(
    options: SessionOptions,
    server: ProjectServer,
    browser: Browser,
    context: BrowserContext,
    page: Page,
  ) {
    this.#options = options;
    this.#server = server;
    this.#browser = browser;
    this.#context = context;
    this.#page = page;
  }

  static async create(options: SessionOptions): Promise<GameSession> {
    const server = await startProjectServer(options.projectDirectory);
    let browser: Browser;
    try {
      // The CLI handles these signals itself, closing the browser as it exits,
      // so Playwright mustn't close the browser under a session that goes on.
      browser = await chromium.launch({
        headless: !options.headed,
        handleSIGHUP: false,
        handleSIGINT: false,
        handleSIGTERM: false,
      });
    } catch (error) {
      server.close();
      throw await launchError(error);
    }
    const abandon = (): void => void browser.close().catch(() => undefined);
    options.signal?.addEventListener("abort", abandon);
    let context: BrowserContext | undefined;
    try {
      if (options.signal?.aborted) throw new Error("Interrupted.");
      // Device pixel ratio 1 keeps games at pixel density 1, so screenshots
      // and pixel summaries are WIDTH × HEIGHT unless a game sets
      // PIXEL_DENSITY itself.
      context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      });
      // The driver passes the seed to run(), the same seeding a host page
      // gets from run(source, { seed }).
      if (options.seed !== undefined) {
        await context.addInitScript((seed: string) => {
          (window as DriverWindow).__jgzSeed = seed;
        }, options.seed);
      }
      const page = await context.newPage();
      const session = new GameSession(options, server, browser, context, page);
      await session.#preparePage();
      return session;
    } catch (error) {
      await context?.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      server.close();
      throw isTimeout(error)
        ? new Error(startupMessage(error, options.timeout))
        : error;
    } finally {
      options.signal?.removeEventListener("abort", abandon);
    }
  }

  /** The project folder, as the server resolved it. */
  get projectRoot(): string {
    return this.#server.projectRoot;
  }

  /** The folder holding images/, sounds/, music/ and fonts/. */
  get assetRoot(): string {
    return this.#server.assetRoot;
  }

  async execute(command: ProtocolCommand): Promise<unknown> {
    if (this.#closed)
      throw new ProtocolError("command_failed", "Session is closed.");
    switch (command.command) {
      case "status":
        return this.status(command.pixels === true);
      case "step": {
        const status = await this.#drive((page) =>
          page.evaluate(
            ({ dt, count }) =>
              (window as DriverWindow).__jgzDriver?.step(dt, count),
            command,
          ),
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
    const status = await this.#drive((page) =>
      page.evaluate(
        (options) => (window as DriverWindow).__jgzDriver?.status(options),
        { pixels },
      ),
    );
    return this.#decorateStatus(requireResult(status));
  }

  async restart(source: "command" | "watch"): Promise<unknown> {
    await this.#releaseHeldInput();
    this.#consoleMessages.length = 0;
    this.#pageErrors.length = 0;
    await this.#drive((page) => page.reload({ waitUntil: "load" }));
    await this.#drive((page) => this.#waitForInitialization(page));
    const status = await this.status();
    this.#options.onEvent({ event: "restarted", source, status });
    return status;
  }

  /** An uncaught error reaches the session twice, from the driver page and
   * from the browser: the copy arriving within a moment of the first isn't
   * reported again. */
  #recentErrors = new Map<string, number>();
  #reportedAlready(event: SessionEvent): boolean {
    const message = String(event.message ?? "");
    const now = Date.now();
    const seen = this.#recentErrors.get(message);
    this.#recentErrors.set(message, now);
    if (this.#recentErrors.size > 50) {
      const oldest = this.#recentErrors.keys().next().value;
      if (oldest !== undefined) this.#recentErrors.delete(oldest);
    }
    return seen !== undefined && now - seen < 1000;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    // Closing the browser closes its pages, a stuck one too.
    await withTimeout(this.#browser.close(), this.#options.timeout).catch(
      () => undefined,
    );
    this.#server.close();
  }

  async #preparePage(): Promise<void> {
    const page = this.#page;
    page.setDefaultTimeout(this.#options.timeout);
    page.setDefaultNavigationTimeout(this.#options.timeout);
    await page.exposeBinding("__jgzEmit", (_source, event: SessionEvent) => {
      if (
        event &&
        typeof event === "object" &&
        typeof event.event === "string"
      ) {
        if (event.event === "runtime-error" && this.#reportedAlready(event)) {
          return;
        }
        this.#options.onEvent(event);
      }
    });
    page.on("console", (message) => {
      const entry = { level: message.type(), text: message.text() };
      pushBounded(this.#consoleMessages, entry);
      this.#options.onEvent({
        event: "console",
        ...entry,
      });
    });
    page.on("pageerror", (error) => {
      pushBounded(this.#pageErrors, error.message);
      const event: SessionEvent = {
        event: "runtime-error",
        message: error.message,
      };
      if (!this.#reportedAlready(event)) this.#options.onEvent(event);
    });
    await page.goto(this.#server.url, { waitUntil: "load" });
    await this.#waitForInitialization(page);
  }

  async #waitForInitialization(page: Page): Promise<void> {
    await page.waitForFunction(
      () => (window as DriverWindow).__jgzDriver?.initialized === true,
    );
  }

  /**
   * Every call into the browser goes through here, bounded by `--timeout`:
   * Playwright gives `evaluate`, key presses and clicks no timeout of their
   * own. A page stuck in an endless loop can't be interrupted, so after a
   * timeout the page is replaced, as `restart` would, and the call fails
   * saying so. Any other failure keeps only its message (see `driverMessage`).
   */
  async #drive<T>(operation: (page: Page) => Promise<T>): Promise<T> {
    if (this.#closed) {
      throw new ProtocolError("command_failed", "Session is closed.");
    }
    try {
      return await withTimeout(operation(this.#page), this.#options.timeout);
    } catch (error) {
      if (!isTimeout(error)) {
        throw new ProtocolError("command_failed", driverMessage(error));
      }
      if (this.#replacingPage) throw error;
      throw await this.#replaceStuckPage();
    }
  }

  /** Closes a page that didn't answer in time and loads the game afresh on a
   * new one in the same context, so browser storage survives. */
  async #replaceStuckPage(): Promise<StuckGameError> {
    const stuck = `The game didn't answer within ${this.#options.timeout} ms (--timeout), so it may be stuck in an endless loop.`;
    if (this.#closed) return new StuckGameError(stuck);
    this.#replacingPage = true;
    try {
      this.#heldKeys.clear();
      this.#heldMouseButtons.clear();
      this.#consoleMessages.length = 0;
      this.#pageErrors.length = 0;
      await withTimeout(this.#page.close(), this.#options.timeout).catch(
        () => undefined,
      );
      this.#page = await this.#context.newPage();
      await this.#preparePage();
      const status = await this.status();
      this.#options.onEvent({ event: "restarted", source: "timeout", status });
      return new StuckGameError(
        `${stuck} jgz restarted it, as restart does, so it's back at its start.`,
      );
    } catch (error) {
      return new StuckGameError(
        `${stuck} Restarting it failed too: ${startupMessage(error, this.#options.timeout)}`,
      );
    } finally {
      this.#replacingPage = false;
    }
  }

  #decorateStatus(status: DriverStatus): unknown {
    return {
      ...status,
      heldKeys: [...this.#heldKeys].map(keyName).sort(),
      heldMouseButtons: [...this.#heldMouseButtons].sort(),
      console: [...this.#consoleMessages],
      pageErrors: [...this.#pageErrors],
    };
  }

  async #key(action: "down" | "up" | "tap", key: string): Promise<unknown> {
    if (action === "down") {
      if (!this.#heldKeys.has(key)) {
        await this.#drive((page) => page.keyboard.down(key));
        this.#heldKeys.add(key);
      }
    } else if (action === "up") {
      await this.#drive((page) => page.keyboard.up(key));
      this.#heldKeys.delete(key);
    } else {
      // A tap ends with the key up, held before or not.
      await this.#drive((page) => page.keyboard.press(key));
      this.#heldKeys.delete(key);
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
        await this.#drive((page) => page.mouse.down({ button }));
        this.#heldMouseButtons.add(button);
      }
    } else if (command.action === "up") {
      await this.#drive((page) => page.mouse.up({ button }));
      this.#heldMouseButtons.delete(button);
    } else if (command.action === "click") {
      // The pointer is already there, so the button goes down and up in
      // place: page.mouse.click() would move it there again, and the game
      // would see a second, zero-length onMouseMove. A click ends with the
      // button up, held before or not.
      if (!this.#heldMouseButtons.has(button)) {
        await this.#drive((page) => page.mouse.down({ button }));
      }
      await this.#drive((page) => page.mouse.up({ button }));
      this.#heldMouseButtons.delete(button);
    }
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
    await this.#drive((page) =>
      page.locator("[data-jgz-canvas]").dispatchEvent("wheel", {
        clientX,
        clientY,
        deltaY: direction === "up" ? -100 : 100,
        buttons: 0,
      }),
    );
    return this.status();
  }

  async #moveMouse(x: number, y: number): Promise<void> {
    const [clientX, clientY] = await this.#logicalPoint(x, y);
    await this.#drive((page) => page.mouse.move(clientX, clientY));
  }

  async #logicalPoint(x: number, y: number): Promise<[number, number]> {
    const dimensions = await this.#drive((page) =>
      page.evaluate(() => {
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
      }),
    );
    if (!dimensions) throw new Error("Game canvas is unavailable.");
    return [
      dimensions.left + (x / dimensions.width) * dimensions.displayedWidth,
      dimensions.top + (y / dimensions.height) * dimensions.displayedHeight,
    ];
  }

  /** One value, every top-level binding, or a map keyed by each path's text.
   * The actions have run by now, so a value that can't be read is reported
   * in its place rather than failing the whole request. */
  async #inspectMany(
    request: StatePath | readonly StatePath[] | true,
  ): Promise<unknown> {
    if (request === true) return this.#inspectInPlace(undefined);
    if (!Array.isArray(request)) {
      return this.#inspectInPlace(request as StatePath);
    }
    const values: Record<string, unknown> = {};
    for (const path of request as readonly StatePath[]) {
      values[path.source] = await this.#inspectInPlace(path);
    }
    return values;
  }

  async #inspectInPlace(path?: StatePath): Promise<unknown> {
    try {
      return await this.#inspect(path);
    } catch (error) {
      // A stuck game has been restarted, so it no longer shows the actions.
      if (error instanceof StuckGameError) throw error;
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  async #inspect(path?: StatePath): Promise<unknown> {
    return this.#drive((page) =>
      page.evaluate(
        (target) => (window as DriverWindow).__jgzDriver?.inspect(target),
        path,
      ),
    );
  }

  async #call(binding: string): Promise<unknown> {
    return this.#drive((page) =>
      page.evaluate(
        (name) => (window as DriverWindow).__jgzDriver?.call(name),
        binding,
      ),
    );
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
    for (const [index, action] of command.actions.entries()) {
      try {
        await this.execute(action);
      } catch (error) {
        throw new ProtocolError(
          error instanceof ProtocolError ? error.code : "command_failed",
          `actions[${index}]: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
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
    const shot = await this.#drive((page) =>
      page.evaluate(() => (window as DriverWindow).__jgzDriver?.screenshot()),
    );
    if (!shot) throw new Error("Game canvas is unavailable.");
    const comma = shot.dataUrl.indexOf(",");
    if (comma === -1) throw new Error("Browser returned an invalid PNG.");
    const data = shot.dataUrl.slice(comma + 1);
    const status = (await this.status()) as { canvas: DriverStatus["canvas"] };
    if (inline) return { data, ...status.canvas, pixels: shot.pixels };
    this.#screenshotNumber += 1;
    if (requestedPath === undefined) {
      this.#artifactsRoot ??= await mkdtemp(
        join(tmpdir(), "js-game-zero-cli-"),
      );
    }
    const path = resolveScreenshotPath(
      requestedPath,
      this.#options.cwd ?? process.cwd(),
      this.#artifactsRoot ?? "",
      this.#screenshotNumber,
    );
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, Buffer.from(data, "base64"));
    return { path, ...status.canvas, pixels: shot.pixels };
  }

  async #releaseHeldInput(): Promise<void> {
    const keys = [...this.#heldKeys];
    const buttons = [...this.#heldMouseButtons];
    this.#heldKeys.clear();
    this.#heldMouseButtons.clear();
    for (const key of keys) {
      await this.#drive((page) => page.keyboard.up(key)).catch(unlessStuck);
    }
    for (const button of buttons) {
      await this.#drive((page) => page.mouse.up({ button })).catch(unlessStuck);
    }
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

/** Where the Playwright this CLI loads keeps its command-line installer. A
 * global install has a Playwright of its own, apart from any project's, so
 * `bunx playwright` may install another version's Chromium. */
export async function playwrightInstaller(): Promise<{
  readonly version: string;
  readonly script: string;
}> {
  const manifestPath = fileURLToPath(
    import.meta.resolve("playwright/package.json"),
  );
  const manifest = (await Bun.file(manifestPath).json()) as {
    version: string;
    bin?: { playwright?: string };
  };
  return {
    version: manifest.version,
    script: join(dirname(manifestPath), manifest.bin?.playwright ?? "cli.js"),
  };
}

/** The command that installs Chromium for the Playwright this CLI loads. */
export function chromiumInstallCommand(script: string): string {
  return ["bun", script, "install", "chromium"].map(shellWord).join(" ");
}

/** A failed launch, naming the command that installs the missing Chromium
 * when that is what failed. */
export async function launchError(error: unknown): Promise<Error> {
  const message = error instanceof Error ? error.message : String(error);
  const missing = /Executable doesn't exist at (.+)/.exec(message);
  if (!missing) return error instanceof Error ? error : new Error(message);
  // Playwright's own advice, `npx playwright install`, may run another
  // Playwright than this one.
  const installer = await playwrightInstaller().catch(() => null);
  if (!installer) return new Error(`Chromium isn't installed: ${missing[1]}`);
  return new Error(
    `jgz uses Playwright ${installer.version}, whose Chromium isn't installed (there's no ${missing[1]}).\nInstall it with: ${chromiumInstallCommand(installer.script)}`,
  );
}

function shellWord(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word)
    ? word
    : `'${word.replaceAll("'", `'\\''`)}'`;
}

class TimedOut extends Error {}

/** Rejects with `TimedOut` if `pending` takes longer than `timeout` ms. */
function withTimeout<T>(pending: Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    pending,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimedOut()), timeout);
    }),
  ]).finally(() => clearTimeout(timer));
}

function isTimeout(error: unknown): boolean {
  return error instanceof TimedOut || error instanceof errors.TimeoutError;
}

function unlessStuck(error: unknown): void {
  if (error instanceof StuckGameError) throw error;
}

function startupMessage(error: unknown, timeout: number): string {
  return isTimeout(error)
    ? `The game didn't finish starting within ${timeout} ms (--timeout), so it may be stuck in an endless loop.`
    : driverMessage(error);
}

/** The first line of a failure in the browser. Playwright prefixes it with
 * its own method (`evaluate: `) and follows it with the in-page stack, which
 * holds the session's URL; the game's own message is the only useful part,
 * without its class (`TypeError: `) either. */
export function driverMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.split("\n")[0] ?? message)
    .replace(/^[a-z]\w*(?:\.[a-z]\w*)*: /, "")
    .replace(/^(?:[A-Z]\w*)?Error: /, "");
}

function requireResult<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Game driver is unavailable.");
  return value;
}

function pushBounded<T>(values: T[], value: T): void {
  values.push(value);
  if (values.length > 100) values.shift();
}
