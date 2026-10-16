import { describe, expect, test } from "bun:test";
import { lineWith, readCalibration } from "../src/runtime-source";

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
  test("V8: from the frame whose file token the calibration throw had", () => {
    const calibration = readCalibration(
      thrown(
        "Error: calibrate\n    at eval (eval at calibrateFrames (https://x/jgz.js:10:5), <anonymous>:5:15)\n    at https://x/jgz.js:12:3",
        {},
        "calibrate",
      ),
    );
    expect(calibration).toEqual({
      kind: "stack",
      marker: "<anonymous>",
      offset: 4,
    });
    const error = thrown(
      "ReferenceError: O is not defined\n    at update (eval at run (https://x/jgz.js:1:1), <anonymous>:11:30)\n    at https://x/jgz.js:40:7",
    );
    expect(lineWith(calibration!, error)).toBe(7);
    // Thrown in the library: no game frame.
    expect(
      lineWith(calibration!, thrown("Error\n    at https://x/jgz.js:40:7")),
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
