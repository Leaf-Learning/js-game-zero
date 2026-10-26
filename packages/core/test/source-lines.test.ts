import { describe, expect, test } from "bun:test";
import {
  lineWith,
  onlyLineOf,
  readCalibration,
  syntaxErrorLine,
} from "../src/runtime-source";

/**
 * An error as an engine reports it: its stack, and JavaScriptCore's own position. Made without
 * the test engine's own, so only what's given is there.
 */
const thrown = (
  stack: string,
  own: { line?: number; sourceURL?: string } = {},
  message = "boom",
): Error =>
  Object.assign(Object.create(Error.prototype) as Error, {
    name: "Error",
    message,
    stack,
    ...own,
  });

describe("an error's line in the game source", () => {
  test("V8: from the frames compiled where the calibration throw was", () => {
    const calibration = readCalibration(
      thrown(
        "Error: calibrate\n    at eval (eval at compileSource (https://x/jgz.js:10:5), <anonymous>:5:15)\n    at calibrateFrames (https://x/jgz.js:20:3)",
        {},
        "calibrate",
      ),
    );
    expect(calibration).toEqual({
      kind: "stack",
      marker: "eval at compileSource (https://x/jgz.js:10:5), <anonymous>",
      offset: 4,
    });
    const error = thrown(
      "ReferenceError: O is not defined\n    at update (eval at compileSource (https://x/jgz.js:10:5), <anonymous>:11:30)\n    at https://x/jgz.js:40:7",
    );
    expect(lineWith(calibration!, error)).toBe(7);
    // Thrown in the library: no game frame.
    expect(
      lineWith(calibration!, thrown("Error\n    at https://x/jgz.js:40:7")),
    ).toBeUndefined();
    // Thrown in the library for a caller that is `<anonymous>` code too, as
    // a devtools console's is: compiled somewhere else, so not the game.
    expect(
      lineWith(
        calibration!,
        thrown(
          "SyntaxError: missing ) after argument list\n    at new Function (<anonymous>)\n    at Object.run (https://x/jgz.js:7113:19)\n    at eval (eval at evaluate (:311:30), <anonymous>:14:11)",
        ),
      ),
    ).toBeUndefined();
  });

  test("SpiderMonkey: from the frames compiled where the calibration throw was", () => {
    const at =
      "https://cdn.jsdelivr.net/npm/@js-game-zero/browser-runtime@0.2/dist/browser/browser.js";
    const calibration = readCalibration(
      thrown(
        `@${at} line 10 > Function:5:15\ncalibrateFrames@${at}:20:3`,
        {},
        "calibrate",
      ),
    );
    expect(calibration).toEqual({
      kind: "stack",
      marker: `${at} line 10 > Function`,
      offset: 4,
    });
    expect(
      lineWith(
        calibration!,
        thrown(
          `anonymous/<@${at} line 10 > Function:7:1\nrun@${at}:7114:45\nanonymous@debugger eval code line 2 > Function:3:12`,
        ),
      ),
    ).toBe(3);
    // The caller's own `new Function` code is not the game's.
    expect(
      lineWith(
        calibration!,
        thrown(
          `run@${at}:7113:19\nanonymous@debugger eval code line 2 > Function:9:12`,
        ),
      ),
    ).toBeUndefined();
  });

  test("JavaScriptCore: a game frame has no location, so the error's own line, in the same script", () => {
    // JavaScriptCore's stack for `new Function` code: no message line, and `anonymous@` with no place.
    const calibration = readCalibration(
      thrown(
        "@\nanonymous@\nglobal code@https://x/page.html:4:33",
        { line: 5 },
        "calibrate",
      ),
    );
    expect(calibration).toEqual({ kind: "line", offset: 4, url: undefined });
    expect(
      lineWith(
        calibration!,
        thrown("update@\nstep@https://x/page.html:90:3", { line: 13 }),
      ),
    ).toBe(9);
    // Thrown in the library's own script: not a game line.
    expect(
      lineWith(
        calibration!,
        thrown("fill@https://x/page.html:300:9", {
          line: 300,
          sourceURL: "https://x/page.html",
        }),
      ),
    ).toBeUndefined();
    expect(lineWith(calibration!, thrown("@", { line: 2 }))).toBeUndefined();
  });

  test("an engine with no usable position gives no line", () => {
    expect(
      readCalibration(thrown("@\nanonymous@", {}, "calibrate")),
    ).toBeNull();
    expect(readCalibration("not an error")).toBeNull();
  });
});

/** The syntax error this engine gives for `source`. */
const syntaxError = (source: string): string => {
  try {
    new Function("scope", source);
  } catch (error) {
    if (error instanceof SyntaxError) return error.message;
  }
  throw new Error("It compiled");
};

// A missing bracket, which V8 reports where the parser noticed, is in the CLI test (Chromium).
describe("a syntax error's line, for engines that give none", () => {
  const at = (source: string) => syntaxErrorLine(source, syntaxError(source));

  test("an unexpected token: its line", () => {
    expect(at("let x = 5;\nfunction draw() {\n  if (x > 3 {\n  }\n}")).toBe(3);
  });

  test("a block left open at the end: the line it opens on", () => {
    expect(
      at('let x = 5;\n\nfunction draw() {\n  screen.fill("navy");\n'),
    ).toBe(3);
  });

  test("an error the prefixes never give is left without a line", () => {
    expect(syntaxErrorLine("let x = 5;", "Something else")).toBeUndefined();
  });
});

describe("an undefined name's line, where the engine gives none", () => {
  test("the one line that reads it", () => {
    expect(
      onlyLineOf(
        "O",
        'let fish = new Actor("fish", [180, 0]);\nfunction update() {\n  fish.y = O;\n}',
      ),
    ).toBe(3);
  });

  test("not in strings, comments or after a dot", () => {
    expect(
      onlyLineOf(
        "scren",
        '// scren is my typo\nlet note = "scren";\nlet a = {}; a.scren = 1;\nscren.fill("red");',
      ),
    ).toBe(4);
  });

  test("none when it's on no line or on more than one", () => {
    expect(onlyLineOf("x", "let y = 1;")).toBeUndefined();
    expect(onlyLineOf("playr", "playr.x = 1;\nplayr.y = 2;")).toBeUndefined();
  });
});
