#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import {
  decodeJsonLine,
  decodeTextLine,
  DEFAULT_TIMEOUT,
  ProtocolError,
  type DecodedCommand,
  type RequestId,
} from "./protocol";
import { GameSession, HELP_COMMANDS, type SessionEvent } from "./session";
import { watchProject, type ProjectWatcher } from "./watcher";

export const VERSION = "0.2.0";

export type CliOptions = {
  readonly mode: "help" | "version" | "test";
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
  if (parsed.positionals[0] !== "test") {
    throw new CliUsageError("Expected: jgz test <project-directory>");
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
      ...(options.seed === undefined ? {} : { seed: options.seed }),
    });
  } catch (error) {
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
    watcher = watchProject(options.projectDirectory!, () => {
      void enqueue(() => session.restart("watch")).catch((error) => {
        writeEvent({
          event: "runtime-error",
          message: error instanceof Error ? error.message : String(error),
          source: "watch",
        });
      });
    });
  }

  if (!options.json) {
    console.log(
      `Testing ${options.projectDirectory} in ${options.headed ? "headed" : "headless"} Chromium.`,
    );
    console.log("Enter `help` for commands.");
  }

  const terminal = !options.json && Boolean(process.stdin.isTTY);
  const lines = createInterface({
    input: process.stdin,
    output: terminal ? process.stdout : undefined,
    terminal,
    crlfDelay: Infinity,
    prompt: terminal ? "jgz> " : undefined,
  });
  let interrupted = false;
  const interrupt = (): void => {
    interrupted = true;
    lines.close();
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  if (terminal) lines.prompt();

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
        const result = await enqueue(() => session.execute(decoded.value));
        writeSuccess(options.json, decoded.id, result);
        if (decoded.value.command === "quit") {
          lines.close();
          break;
        }
      } catch (error) {
        writeCommandError(options.json, error, decoded.id);
      }
      if (terminal) lines.prompt();
    }
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    watcher?.close();
    await queue.catch(() => undefined);
    await session.close();
  }
  return interrupted ? 130 : 0;
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

const HELP_TEXT = `js-game-zero browser-backed game verification

Usage:
  jgz test <project-directory> [--json] [--headed] [--watch]
      [--seed <value>] [--timeout <milliseconds>]
  jgz --help
  jgz --version

Commands:
${HELP_COMMANDS.map((command) => `  ${command}`).join("\n")}

Use --json for newline-delimited JSON requests and responses.`;

if (import.meta.main) {
  process.exitCode = await runCli();
}
