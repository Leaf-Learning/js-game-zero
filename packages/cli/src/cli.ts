#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { createInterface, type Interface } from "node:readline";
import {
  decodeJsonLine,
  decodeTextLine,
  DEFAULT_TIMEOUT,
  ProtocolError,
  type DecodedCommand,
  type RequestId,
} from "./protocol";
import {
  GameSession,
  HELP_COMMANDS,
  playwrightInstaller,
  type SessionEvent,
} from "./session";
import { watchProject, type ProjectWatcher } from "./watcher";

export const VERSION = "0.2.0";

export type CliOptions = {
  readonly mode: "help" | "version" | "test" | "install-chromium";
  readonly projectDirectory?: string;
  readonly json: boolean;
  readonly headed: boolean;
  readonly watch: boolean;
  readonly seed?: string;
  readonly timeout: number;
};

export function parseCliOptions(args: readonly string[]): CliOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
        json: { type: "boolean", default: false },
        headed: { type: "boolean", default: false },
        watch: { type: "boolean", short: "w", default: false },
        seed: { type: "string" },
        timeout: { type: "string", default: String(DEFAULT_TIMEOUT) },
      },
    });
  } catch (error) {
    throw new CliUsageError(
      error instanceof Error ? error.message : String(error),
    );
  }
  const json = parsed.values.json === true;
  const base = {
    json,
    headed: parsed.values.headed === true,
    watch: parsed.values.watch === true,
    ...(parsed.values.seed === undefined
      ? {}
      : { seed: String(parsed.values.seed) }),
    timeout: parseTimeout(parsed.values.timeout),
  };
  if (parsed.values.help) return { mode: "help", ...base };
  if (parsed.values.version) return { mode: "version", ...base };
  if (parsed.positionals[0] === "install-chromium") {
    if (parsed.positionals.length !== 1) {
      throw new CliUsageError("install-chromium takes no arguments.");
    }
    return { mode: "install-chromium", ...base };
  }
  if (parsed.positionals[0] !== "test") {
    throw new CliUsageError(
      "Expected: jgz test <project-directory>, or jgz install-chromium",
    );
  }
  if (parsed.positionals.length !== 2 || !parsed.positionals[1]) {
    throw new CliUsageError("test requires exactly one project directory.");
  }
  return {
    mode: "test",
    projectDirectory: parsed.positionals[1],
    ...base,
  };
}

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

/** Exit codes after a signal: 128 plus its number, as a shell reports a
 * process the signal ended. Ctrl-C at the prompt counts as SIGINT. */
const signalExitCodes = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 } as const;
type StopSignal = keyof typeof signalExitCodes;

export async function runCli(args = Bun.argv.slice(2)): Promise<number> {
  const jsonRequested = args.includes("--json");
  let options: CliOptions;
  try {
    options = parseCliOptions(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (jsonRequested) {
      writeJson(errorResponse(undefined, "invalid_request", message));
    } else {
      console.error(message);
      console.error("Run `jgz --help` for usage.");
    }
    return 2;
  }

  if (options.mode === "help") {
    console.log(HELP_TEXT);
    return 0;
  }
  if (options.mode === "version") {
    console.log(VERSION);
    return 0;
  }
  if (options.mode === "install-chromium") return installChromium();

  // A signal, or Ctrl-C at the prompt, ends the session the same way at any
  // point, mid-command too: the browser is closed and the exit code names the
  // signal. A second one exits at once, and Playwright still kills the
  // browser as the process exits.
  const stopping = new AbortController();
  let stopSignal: StopSignal | undefined;
  let lines: Interface | undefined;
  const stop = (signal: StopSignal): void => {
    if (stopSignal) process.exit(signalExitCodes[stopSignal]);
    stopSignal = signal;
    stopping.abort();
    lines?.close();
  };
  const interrupted = Symbol("interrupted");
  const stopped = new Promise<typeof interrupted>((resolve) => {
    stopping.signal.addEventListener("abort", () => resolve(interrupted));
  });
  const signalHandlers = (Object.keys(signalExitCodes) as StopSignal[]).map(
    (signal) => [signal, () => stop(signal)] as const,
  );
  for (const [signal, handler] of signalHandlers) process.on(signal, handler);
  try {
    const writeEvent = (event: SessionEvent): void => {
      if (options.json) writeJson({ type: "event", ...event });
      else writeHumanEvent(event);
    };

    let session: GameSession;
    try {
      session = await GameSession.create({
        projectDirectory: options.projectDirectory!,
        headed: options.headed,
        timeout: options.timeout,
        onEvent: writeEvent,
        signal: stopping.signal,
        ...(options.seed === undefined ? {} : { seed: options.seed }),
      });
    } catch (error) {
      if (stopSignal) return signalExitCodes[stopSignal];
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) {
        writeJson(errorResponse(undefined, "startup_failed", message));
      } else {
        console.error(message);
      }
      return 1;
    }

    let queue: Promise<unknown> = Promise.resolve();
    const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
      const result = queue.then(operation, operation);
      queue = result.catch(() => undefined);
      return result;
    };
    let watcher: ProjectWatcher | undefined;
    if (options.watch) {
      watcher = watchProject(session.projectRoot, session.assetRoot, () => {
        void enqueue(() => session.restart("watch")).catch((error) => {
          writeEvent({
            event: "runtime-error",
            message: error instanceof Error ? error.message : String(error),
            source: "watch",
          });
        });
      });
    }

    if (!options.json && !stopSignal) {
      console.log(
        `Testing ${options.projectDirectory} in ${options.headed ? "headed" : "headless"} Chromium.`,
      );
      console.log("Enter `help` for commands.");
    }

    const terminal = !options.json && Boolean(process.stdin.isTTY);
    lines = createInterface({
      input: process.stdin,
      output: terminal ? process.stdout : undefined,
      terminal,
      crlfDelay: Infinity,
      prompt: terminal ? "jgz> " : undefined,
    });
    // In a terminal, readline reads Ctrl-C as a key, not as a signal.
    lines.on("SIGINT", () => {
      process.stdout.write("\n");
      stop("SIGINT");
    });
    if (stopSignal) lines.close();
    else if (terminal) lines.prompt();

    try {
      for await (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          if (terminal) lines.prompt();
          continue;
        }
        let decoded: DecodedCommand;
        try {
          decoded = options.json
            ? decodeJsonLine(trimmed)
            : decodeTextLine(trimmed);
        } catch (error) {
          writeCommandError(options.json, error);
          if (terminal) lines.prompt();
          continue;
        }

        try {
          const result = await Promise.race([
            enqueue(() => session.execute(decoded.value)),
            stopped,
          ]);
          if (result === interrupted) break;
          writeSuccess(options.json, decoded.id, result);
          if (decoded.value.command === "quit") {
            lines.close();
            break;
          }
        } catch (error) {
          if (stopSignal) break;
          writeCommandError(options.json, error, decoded.id);
        }
        if (terminal) lines.prompt();
      }
    } finally {
      watcher?.close();
      // A stopped session closes at once; a command still running then fails
      // as its browser goes.
      if (!stopSignal) await queue.catch(() => undefined);
      await session.close();
    }
    return stopSignal ? signalExitCodes[stopSignal] : 0;
  } finally {
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
  }
}

/** Runs the installer of the Playwright this CLI loads, which may not be the
 * one `bunx playwright` finds. */
async function installChromium(): Promise<number> {
  const { script } = await playwrightInstaller();
  const installer = Bun.spawn(
    [process.execPath, script, "install", "chromium"],
    { stdio: ["inherit", "inherit", "inherit"] },
  );
  return installer.exited;
}

function writeSuccess(
  json: boolean,
  id: RequestId | undefined,
  result: unknown,
): void {
  if (json) {
    writeJson({
      type: "response",
      ...(id === undefined ? {} : { id }),
      ok: true,
      result,
    });
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

function writeCommandError(
  json: boolean,
  error: unknown,
  requestId?: RequestId,
): void {
  const protocol = error instanceof ProtocolError ? error : null;
  const id = requestId !== undefined ? requestId : protocol?.id;
  const code = protocol?.code ?? "command_failed";
  const message = error instanceof Error ? error.message : String(error);
  if (json) writeJson(errorResponse(id, code, message));
  else console.error(`${code}: ${message}`);
}

function errorResponse(
  id: RequestId | undefined,
  code: string,
  message: string,
): Record<string, unknown> {
  return {
    type: "response",
    ...(id === undefined ? {} : { id }),
    ok: false,
    error: { code, message },
  };
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function writeHumanEvent(event: SessionEvent): void {
  if (event.event === "console") {
    console.log(`[console:${String(event.level)}] ${String(event.text)}`);
    return;
  }
  if (event.event === "diagnostic") {
    const diagnostic = event.diagnostic as {
      severity?: string;
      message?: string;
    };
    console.log(
      `[diagnostic:${diagnostic?.severity ?? "unknown"}] ${diagnostic?.message ?? ""}`,
    );
    return;
  }
  if (event.event === "runtime-error") {
    console.error(
      `[runtime-error] ${String(event.message ?? "Unknown error")}`,
    );
    return;
  }
  if (event.event === "restarted") {
    console.log(`[restarted:${String(event.source)}]`);
    return;
  }
  console.log(`[${event.event}]`);
}

function parseTimeout(value: unknown): number {
  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 1) {
    throw new CliUsageError(
      "--timeout must be a positive integer in milliseconds.",
    );
  }
  return timeout;
}

const HELP_TEXT = `jgz: drive, inspect and screenshot a js-game-zero game in Chromium

Usage:
  jgz test <project-directory> [options]
  jgz install-chromium
  jgz --help | --version

Options for test:
  --json          Read requests and write responses as JSON lines.
  --headed        Show the browser window.
  -w, --watch     Restart the game when main.js or an asset file changes.
  --seed <value>  Seed the game's randomness, the same after every restart.
  --timeout <ms>  How long the game may take to start, and to answer each
                  call into the browser (one step's frames, a key press),
                  before it counts as stuck and is restarted. Default ${DEFAULT_TIMEOUT}.

install-chromium installs Chromium for the Playwright jgz uses.

Commands, at the prompt or as JSON requests:
${HELP_COMMANDS.map((command) => `  ${command}`).join("\n")}

The guide covers every command, the JSON protocol and its error codes:
https://github.com/Leaf-Learning/js-game-zero/blob/main/docs/cli.md`;

if (import.meta.main) {
  process.exitCode = await runCli();
}
