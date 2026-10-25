import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  mapBrowserKeyEvent,
  parseStatePath as parseHostStatePath,
} from "@js-game-zero/core/host";
import { parseCliOptions } from "../src/cli";
import {
  decodeJsonLine,
  decodeTextLine,
  DEFAULT_STEP,
  keyName,
  normalizeKey,
  parseStatePath,
  ProtocolError,
} from "../src/protocol";
import {
  chromiumInstallCommand,
  driverMessage,
  launchError,
  playwrightInstaller,
  resolveScreenshotPath,
} from "../src/session";

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

  test("parses install-chromium, which takes no arguments", () => {
    expect(parseCliOptions(["install-chromium"])).toMatchObject({
      mode: "install-chromium",
    });
    expect(() => parseCliOptions(["install-chromium", "game"])).toThrow(
      "takes no arguments",
    );
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
      key: "ArrowLeft",
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

  test("rejects an unknown key while decoding", () => {
    for (const decode of [
      () => decodeTextLine("key tap zz"),
      () => decodeJsonLine('{"command":"key","action":"down","key":"zz"}'),
    ]) {
      expect(decode).toThrow("Unsupported key: zz");
      expect(decode).toThrow(ProtocolError);
    }
  });

  test("reads a lone quote or backslash ending the line as itself", () => {
    expect(decodeTextLine("key tap '").value).toMatchObject({ key: "Quote" });
    expect(decodeTextLine("key tap \\").value).toMatchObject({
      key: "Backslash",
    });
    expect(decodeTextLine("key tap \\'").value).toMatchObject({
      key: "Quote",
    });
    expect(decodeTextLine("key tap \\\\").value).toMatchObject({
      key: "Backslash",
    });
    // A quote that closes, or opens a word, is still a quote.
    expect(decodeTextLine("screenshot 'a b '").value).toEqual({
      command: "screenshot",
      path: "a b ",
    });
    expect(() => decodeTextLine("screenshot 'a b")).toThrow(
      "Unterminated quote or escape.",
    );
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
  expect(normalizeKey("backspace")).toBe("Backspace");
  expect(normalizeKey("PageUp")).toBe("PageUp");
  expect(normalizeKey(",")).toBe("Comma");
  expect(normalizeKey("/")).toBe("Slash");
  expect(normalizeKey("numpad1")).toBe("Numpad1");
  expect(normalizeKey("ShiftLeft")).toBe("ShiftLeft");
  expect(normalizeKey("keyq")).toBe("KeyQ");
  expect(() => normalizeKey("Hyper")).toThrow("Unsupported key");
  // Shifted marks are typed with Shift held, as on a keyboard.
  expect(() => normalizeKey("!")).toThrow("Unsupported key");
  // Playwright can't press these.
  expect(() => normalizeKey("F13")).toThrow("Unsupported key");
});

test("names each key as status lists it", () => {
  expect(keyName(normalizeKey("right"))).toBe("right");
  expect(keyName(normalizeKey("ArrowRight"))).toBe("right");
  expect(keyName(normalizeKey("keyb"))).toBe("b");
  expect(keyName(normalizeKey("B"))).toBe("b");
  expect(keyName(normalizeKey("Digit7"))).toBe("7");
  expect(keyName(normalizeKey("semicolon"))).toBe(";");
  expect(keyName(normalizeKey("control"))).toBe("ctrl");
  expect(keyName(normalizeKey("return"))).toBe("enter");
  expect(keyName(normalizeKey("esc"))).toBe("escape");
  expect(keyName(normalizeKey("numpad1"))).toBe("Numpad1");
  expect(keyName(normalizeKey("shiftleft"))).toBe("ShiftLeft");
  expect(keyName(normalizeKey("f5"))).toBe("F5");
  // Each name gives back the key it names.
  for (const input of ["space", "a", "0", "'", "\\", "Numpad9", "F12"]) {
    const key = normalizeKey(input);
    expect(normalizeKey(keyName(key)), input).toBe(key);
  }
});

test("every key jgz presses is one the engine maps", () => {
  const names = [
    ..."abcdefghijklmnopqrstuvwxyz0123456789-=[]\\;'`,./",
    "left",
    "right",
    "up",
    "down",
    "space",
    "enter",
    "escape",
    "backspace",
    "tab",
    "delete",
    "insert",
    "home",
    "end",
    "pageup",
    "pagedown",
    "capslock",
    "numlock",
    "scrolllock",
    "pause",
    "printscreen",
    "contextmenu",
    "shiftleft",
    "shiftright",
    "controlleft",
    "altright",
    "metaleft",
    "numpadenter",
    "numpadadd",
    "numpad0",
    "numpad9",
    "f1",
    "f12",
  ];
  for (const name of names) {
    const code = normalizeKey(name);
    expect(mapBrowserKeyEvent({ code, key: "" })?.key, name).toBeGreaterThan(0);
  }
});

test("resolves supplied screenshots from the invocation directory", () => {
  expect(resolveScreenshotPath("capture", "/work", "/tmp/session", 1)).toBe(
    "/work/capture",
  );
  expect(resolveScreenshotPath(undefined, "/work", "/tmp/session", 7)).toBe(
    "/tmp/session/screenshot-0007.png",
  );
});

test("keeps only the game's message from a browser failure", () => {
  expect(
    driverMessage(
      new Error(
        "evaluate: TypeError: Unknown game-state binding: nothere\n    at Object.read (http://127.0.0.1:64215/abc/driver.js:6511:17)",
      ),
    ),
  ).toBe("Unknown game-state binding: nothere");
  expect(driverMessage(new Error("evaluate: Error: score: too low"))).toBe(
    "score: too low",
  );
  expect(
    driverMessage(
      new Error("locator.dispatchEvent: Target page has been closed"),
    ),
  ).toBe("Target page has been closed");
  expect(driverMessage("evaluate: oops")).toBe("oops");
});

test("names the Playwright installer to run, quoting where a shell needs it", () => {
  expect(chromiumInstallCommand("/opt/node_modules/playwright/cli.js")).toBe(
    "bun /opt/node_modules/playwright/cli.js install chromium",
  );
  expect(chromiumInstallCommand("/Users/My Name/it's/cli.js")).toBe(
    "bun '/Users/My Name/it'\\''s/cli.js' install chromium",
  );
});

test("a missing Chromium names the installer of the CLI's own Playwright", async () => {
  const manifest = (await Bun.file(
    fileURLToPath(import.meta.resolve("playwright/package.json")),
  ).json()) as { version: string };
  const installer = await playwrightInstaller();
  expect(installer.version).toBe(manifest.version);
  expect(await Bun.file(installer.script).exists()).toBe(true);

  const error = await launchError(
    new Error(
      "launch: Executable doesn't exist at /cache/chromium_headless_shell-1248/chrome-headless-shell\n╔═══╗\n║ npx playwright install ║",
    ),
  );
  expect(error.message).toBe(
    `jgz uses Playwright ${manifest.version}, whose Chromium isn't installed (there's no /cache/chromium_headless_shell-1248/chrome-headless-shell).\nInstall it with: ${chromiumInstallCommand(installer.script)}`,
  );
  const other = new Error("launch: something else");
  expect(await launchError(other)).toBe(other);
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
          { command: "key", action: "down", key: "ArrowRight" },
          { command: "step", dt: DEFAULT_STEP, count: 30 },
          { command: "key", action: "up", key: "ArrowRight" },
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

  test("checks every action, keys too, before a play runs any", () => {
    const request = JSON.stringify({
      id: 3,
      command: "play",
      actions: [
        { command: "step", count: 30 },
        { command: "key", action: "tap", key: "zz" },
      ],
    });
    expect(() => decodeJsonLine(request)).toThrow(
      "actions[1]: Unsupported key: zz.",
    );
    try {
      decodeJsonLine(request);
    } catch (error) {
      expect(error).toMatchObject({ code: "invalid_request", id: 3 });
    }
    expect(() =>
      decodeJsonLine(
        '{"command":"play","actions":[{"command":"mouse","action":"click"}]}',
      ),
    ).toThrow("actions[0]: mouse click requires x and y.");
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
