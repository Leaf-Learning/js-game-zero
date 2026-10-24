import { describe, expect, test } from "bun:test";
import { parseStatePath as parseHostStatePath } from "@js-game-zero/core/host";
import { parseCliOptions } from "../src/cli";
import {
  decodeJsonLine,
  decodeTextLine,
  DEFAULT_STEP,
  parseStatePath,
  ProtocolError,
} from "../src/protocol";
import { normalizeKey, resolveScreenshotPath } from "../src/session";

describe("CLI options", () => {
  test("parses the test session flags", () => {
    expect(
      parseCliOptions([
        "test",
        "game",
        "--json",
        "--headed",
        "--watch",
        "--seed",
        "abc",
        "--timeout",
        "2000",
      ]),
    ).toEqual({
      mode: "test",
      projectDirectory: "game",
      json: true,
      headed: true,
      watch: true,
      seed: "abc",
      timeout: 2000,
    });
  });
});

describe("command protocol", () => {
  test("applies step defaults and preserves JSON request IDs", () => {
    expect(decodeTextLine("step")).toEqual({
      value: { command: "step", dt: DEFAULT_STEP, count: 1 },
    });
    expect(
      decodeJsonLine('{"id":"move-1","command":"step","dt":0.1,"count":3}'),
    ).toEqual({
      id: "move-1",
      value: { command: "step", dt: 0.1, count: 3 },
    });
  });

  test("decodes human input and quoted screenshot paths", () => {
    expect(decodeTextLine("key down left").value).toEqual({
      command: "key",
      action: "down",
      key: "left",
    });
    expect(decodeTextLine('screenshot "artifacts/game state"').value).toEqual({
      command: "screenshot",
      path: "artifacts/game state",
    });
    expect(decodeTextLine("mouse click left 20 30").value).toEqual({
      command: "mouse",
      action: "click",
      button: "left",
      x: 20,
      y: 30,
    });
    expect(decodeJsonLine('{"command":"state"}').value).toEqual({
      command: "inspect",
    });
  });

  test("returns a correlated error for an invalid JSON command", () => {
    try {
      decodeJsonLine('{"id":7,"command":"step","count":0}');
      throw new Error("expected decoder to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ProtocolError);
      expect(error).toMatchObject({ code: "invalid_request", id: 7 });
    }
  });
});

describe("read-only state paths", () => {
  test("supports identifier properties and numeric indexes", () => {
    expect(parseStatePath("snake[0].position.x")).toEqual({
      source: "snake[0].position.x",
      binding: "snake",
      segments: [0, "position", "x"],
    });
  });

  test("rejects calls, assignments, quoted indexes, and prototype access", () => {
    for (const path of [
      "resetGame()",
      "score=10",
      'player["x"]',
      "player.constructor",
      "player.__proto__.x",
    ]) {
      expect(() => parseStatePath(path)).toThrow(ProtocolError);
    }
  });

  test("reads every path exactly as a host page's inspector does", () => {
    for (const path of [
      "score",
      "fish[0].y",
      "snake[12].position.x",
      "$state._x9",
      "",
      "1x",
      "a.",
      "a[x]",
      "a[0",
      "a..b",
      "a.__proto__",
      "constructor",
      "resetGame()",
      'player["x"]',
    ]) {
      let host: unknown;
      let cli: unknown;
      try {
        host = parseHostStatePath(path);
      } catch {
        host = "invalid";
      }
      try {
        cli = parseStatePath(path);
      } catch {
        cli = "invalid";
      }
      expect(cli).toEqual(host);
    }
  });
});

test("normalizes documented key aliases", () => {
  expect(normalizeKey("left")).toBe("ArrowLeft");
  expect(normalizeKey("a")).toBe("KeyA");
  expect(normalizeKey("A")).toBe("KeyA");
  expect(normalizeKey("7")).toBe("Digit7");
  expect(normalizeKey("F12")).toBe("F12");
  expect(() => normalizeKey("Hyper")).toThrow("Unsupported key");
});

test("resolves supplied screenshots from the invocation directory", () => {
  expect(resolveScreenshotPath("capture", "/work", "/tmp/session", 1)).toBe(
    "/work/capture",
  );
  expect(resolveScreenshotPath(undefined, "/work", "/tmp/session", 7)).toBe(
    "/tmp/session/screenshot-0007.png",
  );
});

describe("agent batch commands", () => {
  test("decodes call for a plain top-level identifier only", () => {
    expect(decodeTextLine("call __probe")).toEqual({
      value: { command: "call", binding: "__probe" },
    });
    expect(decodeJsonLine('{"command":"call","binding":"probe"}')).toEqual({
      value: { command: "call", binding: "probe" },
    });
    expect(() => decodeTextLine("call player.pos")).toThrow(ProtocolError);
    expect(() => decodeTextLine("call __proto__")).toThrow(ProtocolError);
  });

  test("decodes play batches of input and time actions", () => {
    expect(
      decodeJsonLine(
        JSON.stringify({
          id: 7,
          command: "play",
          actions: [
            { command: "key", action: "down", key: "right" },
            { command: "step", count: 30 },
            { command: "key", action: "up", key: "right" },
          ],
          inspect: "player.x",
          screenshot: true,
        }),
      ),
    ).toEqual({
      id: 7,
      value: {
        command: "play",
        actions: [
          { command: "key", action: "down", key: "right" },
          { command: "step", dt: DEFAULT_STEP, count: 30 },
          { command: "key", action: "up", key: "right" },
        ],
        inspect: parseStatePath("player.x"),
        screenshot: true,
      },
    });
    expect(
      decodeJsonLine(
        '{"command":"play","actions":[{"command":"step"}],"inspect":true}',
      ).value,
    ).toEqual({
      command: "play",
      actions: [{ command: "step", dt: DEFAULT_STEP, count: 1 }],
      inspect: true,
    });
  });

  test("rejects play batches that nest anything but input and time", () => {
    for (const nested of ["quit", "restart", "screenshot", "play"]) {
      expect(() =>
        decodeJsonLine(
          `{"command":"play","actions":[{"command":"${nested}"}]}`,
        ),
      ).toThrow(ProtocolError);
    }
    expect(() => decodeJsonLine('{"command":"play","actions":[]}')).toThrow(
      ProtocolError,
    );
    expect(() => decodeTextLine("play")).toThrow(ProtocolError);
  });

  test("decodes a restarting play with several inspect paths", () => {
    expect(
      decodeJsonLine(
        '{"command":"play","restart":true,"inspect":["score","player.x"]}',
      ).value,
    ).toEqual({
      command: "play",
      actions: [],
      restart: true,
      inspect: [parseStatePath("score"), parseStatePath("player.x")],
    });
    expect(
      decodeJsonLine(
        '{"command":"play","restart":false,"actions":[{"command":"step"}]}',
      ).value,
    ).toEqual({
      command: "play",
      actions: [{ command: "step", dt: DEFAULT_STEP, count: 1 }],
    });
    expect(() =>
      decodeJsonLine('{"command":"play","restart":"yes","actions":[]}'),
    ).toThrow(ProtocolError);
    expect(() =>
      decodeJsonLine(
        '{"command":"play","actions":[{"command":"step"}],"inspect":["ok",""]}',
      ),
    ).toThrow(ProtocolError);
    expect(() =>
      decodeJsonLine(
        `{"command":"play","restart":true,"inspect":${JSON.stringify(Array.from({ length: 13 }, (_, i) => `v${i}`))}}`,
      ),
    ).toThrow(ProtocolError);
  });

  test("decodes pixel and inline options", () => {
    expect(decodeJsonLine('{"command":"status","pixels":true}').value).toEqual({
      command: "status",
      pixels: true,
    });
    expect(decodeJsonLine('{"command":"status"}').value).toEqual({
      command: "status",
    });
    expect(
      decodeJsonLine('{"command":"screenshot","inline":true}').value,
    ).toEqual({ command: "screenshot", inline: true });
    expect(() =>
      decodeJsonLine('{"command":"screenshot","inline":"yes"}'),
    ).toThrow(ProtocolError);
  });
});
