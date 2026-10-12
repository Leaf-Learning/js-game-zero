import { describe, expect, test } from "bun:test";
import { scanSource, tokenizeSource } from "../src/source-scan";

function values(source: string): string[] {
  const tokens = tokenizeSource(source);
  if (!tokens) throw new Error("expected the source to tokenize");
  return tokens.map((token) =>
    token.type === "literal" ? `<${token.value}>` : token.value,
  );
}

describe("tokenizeSource", () => {
  test("splits identifiers, punctuators and literals", () => {
    expect(values("let x = a.b(1, 'two') === c => d;")).toEqual([
      "let",
      "x",
      "=",
      "a",
      ".",
      "b",
      "(",
      "<number>",
      ",",
      "<string>",
      ")",
      "===",
      "c",
      "=>",
      "d",
      ";",
    ]);
  });

  test("drops line and block comments, even ones mentioning hooks", () => {
    expect(
      values("// function draw() {\nx /* update = 1 */ = 2 /* multi\nline */"),
    ).toEqual(["x", "=", "<number>"]);
  });

  test("keeps string contents out of the token stream", () => {
    expect(values(`a = "draw } {" + 'update(' + "esc\\"aped"`)).toEqual([
      "a",
      "=",
      "<string>",
      "+",
      "<string>",
      "+",
      "<string>",
    ]);
  });

  test("tokenizes template substitutions one brace deeper, with nesting", () => {
    const tokens = tokenizeSource("a = `x ${b + `y ${c} }`} { z`; d = 1");
    expect(tokens).not.toBeNull();
    const byName = Object.fromEntries(
      (tokens ?? [])
        .filter((token) => token.type === "identifier")
        .map((token) => [token.value, token.depth]),
    );
    expect(byName).toEqual({ a: 0, b: 1, c: 2, d: 0 });
  });

  test("template text containing braces does not change depth", () => {
    expect(scanSource("title = `{ not code }`; draw = () => {}")).toEqual({
      complete: true,
      topLevelFunctions: ["draw"],
      topLevelAssignments: ["title", "draw"],
    });
  });

  test("treats a regex literal (even one containing braces) as one literal", () => {
    expect(values("x = /[}{]\\/+/g.test(s); y = a / b / c")).toEqual([
      "x",
      "=",
      "<regex>",
      ".",
      "test",
      "(",
      "s",
      ")",
      ";",
      "y",
      "=",
      "a",
      "/",
      "b",
      "/",
      "c",
    ]);
  });

  test("starts a regex after keywords and punctuators but divides after values", () => {
    expect(values("return /a/; k = x ? /b/i : /c/; z = (1) / 2 / 3")).toEqual([
      "return",
      "<regex>",
      ";",
      "k",
      "=",
      "x",
      "?",
      "<regex>",
      ":",
      "<regex>",
      ";",
      "z",
      "=",
      "(",
      "<number>",
      ")",
      "/",
      "<number>",
      "/",
      "<number>",
    ]);
  });

  test("records brace and paren depth on each token", () => {
    const tokens = tokenizeSource("f(a, { b: (c) })");
    const find = (name: string) =>
      tokens?.find((token) => token.value === name);
    expect(find("f")).toMatchObject({ depth: 0, parens: 0 });
    expect(find("a")).toMatchObject({ depth: 0, parens: 1 });
    expect(find("b")).toMatchObject({ depth: 1, parens: 1 });
    expect(find("c")).toMatchObject({ depth: 1, parens: 2 });
  });

  test("handles numbers, hashbangs, unicode identifiers and unknown characters", () => {
    expect(values("#!/usr/bin/env bun\nπ = .5 + 1_000n + 0xFF; @x")).toEqual([
      "π",
      "=",
      "<number>",
      "+",
      "<number>",
      "+",
      "<number>",
      ";",
      "@",
      "x",
    ]);
  });

  test("gives up on anything it cannot tokenize confidently", () => {
    for (const source of [
      "x = 'unterminated",
      'x = "line\nbreak"',
      "x = `never closed ${a}",
      "x = `${a",
      "/* open comment",
      "x = /open regex",
      "x = /newline\n/",
      "}",
      ")",
      "{",
      "(",
    ]) {
      expect(tokenizeSource(source)).toBeNull();
      expect(scanSource(source)).toEqual({
        complete: false,
        topLevelFunctions: [],
        topLevelAssignments: [],
      });
    }
  });
});

describe("scanSource", () => {
  test("finds top-level function declarations", () => {
    expect(
      scanSource(`
function draw() {}
async function onKeyDown(key) {}
function* gen() {}
export function update(dt) {}
`).topLevelFunctions,
    ).toEqual(["draw", "onKeyDown", "gen", "update"]);
  });

  test("finds every function-shaped top-level assignment", () => {
    expect(
      scanSource(`
a = function () {};
const b = function named() {};
let c = async () => {};
var d = (x, { y }) => x + y;
e = x => x;
f = async x => x;
g = () => {};
h = 1;
let i;
`),
    ).toEqual({
      complete: true,
      topLevelFunctions: ["a", "b", "c", "d", "e", "f", "g"],
      topLevelAssignments: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
    });
  });

  test("finds comma-separated identifier declarations without reading initializer contents", () => {
    expect(
      scanSource(`
const a = 1, b = [first, second], c = { nested: value };
let d, e = () => 1, f = call(one, two);
var g = "done";
`),
    ).toEqual({
      complete: true,
      topLevelFunctions: ["e"],
      topLevelAssignments: ["a", "b", "c", "d", "e", "f", "g"],
    });
  });

  test("ignores names that are merely used", () => {
    expect(
      scanSource(`
for (let row = 0; row < 3; row++) rows[row] = row;
draw();
foo(update, onKeyDown);
const { drow } = pkg;
const [darw] = list;
obj.draw = () => {};
obj?.update = function () {};
x == y; x === y; x <= y; x >= y; x != y; x += 1; x => x;
`),
    ).toEqual({
      complete: true,
      topLevelFunctions: [],
      topLevelAssignments: [],
    });
  });

  test("ignores definitions nested in braces, objects, classes and templates", () => {
    expect(
      scanSource(`
function draw() {
  function drow() {}
  const udpate = () => {};
  helper = function () {};
}
const settings = { WIDHT: 1, drwa: () => {} };
class Game { darw() {} }
if (x) { HEIGTH = 2; }
msg = \`\${(() => { function drew() {} })()}\`;
`),
    ).toEqual({
      complete: true,
      topLevelFunctions: ["draw"],
      topLevelAssignments: ["settings", "msg"],
    });
  });

  test("ignores function expressions and parameter defaults", () => {
    expect(
      scanSource(`
run(function drow() {});
(function darw() {})();
const value = cond ? function drew() {} : null;
function helper(udpate = () => {}) {}
`),
    ).toEqual({
      complete: true,
      topLevelFunctions: ["helper"],
      topLevelAssignments: ["value"],
    });
  });

  test("ignores hook-like words in strings, comments and templates", () => {
    expect(
      scanSource(`
// function drow() {}
/* darw = () => {} */
label = "function drew() {}";
text = \`udpate = function\`;
pattern = /function drwa\\(\\)/;
`),
    ).toEqual({
      complete: true,
      topLevelFunctions: [],
      topLevelAssignments: ["label", "text", "pattern"],
    });
  });
});
