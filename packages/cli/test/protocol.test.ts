import { describe, expect, test } from "bun:test";
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
});

test("normalizes documented key aliases", () => {
  expect(normalizeKey("left")).toBe("ArrowLeft");
  expect(normalizeKey("a")).toBe("A");
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
