import { describe, expect, test } from "bun:test";
import { collectRuntimeDiagnostics } from "@js-game-zero/core/host";

function typos(source: string): string[] {
  return collectRuntimeDiagnostics(source)
    .filter(
      (diagnostic) =>
        diagnostic.code === "hook-typo" || diagnostic.code === "constant-typo",
    )
    .map((diagnostic) => `${diagnostic.name}->${diagnostic.suggestion}`);
}

describe("source typo diagnostics", () => {
  test("flags top-level functions whose names misspell a hook", () => {
    expect(typos("function drow() {}")).toEqual(["drow->draw"]);
    expect(typos("function darw() {}")).toEqual(["darw->draw"]);
    expect(typos("function udpate(dt) {}")).toEqual(["udpate->update"]);
    expect(typos("function on_key_dwon(key) {}")).toEqual([
      "on_key_dwon->on_key_down",
    ]);
    expect(typos("function onKeyDwon(key) {}")).toEqual([
      "onKeyDwon->onKeyDown",
    ]);
    expect(typos("function Draw() {}")).toEqual(["Draw->draw"]);
  });

  test("flags function-shaped top-level assignments too", () => {
    expect(typos("drow = function () {}")).toEqual(["drow->draw"]);
    expect(typos("const udpate = (dt) => {}")).toEqual(["udpate->update"]);
    expect(typos("let drow = async () => {}")).toEqual(["drow->draw"]);
    expect(typos("var darw = x => x")).toEqual(["darw->draw"]);
  });

  test("flags top-level assignments whose names misspell a constant", () => {
    expect(typos("WIDHT = 800")).toEqual(["WIDHT->WIDTH"]);
    expect(typos("let HEIGTH = 600")).toEqual(["HEIGTH->HEIGHT"]);
    expect(typos("const TITEL = 'Game'")).toEqual(["TITEL->TITLE"]);
    expect(typos("var Icon = 'icon.png'")).toEqual(["Icon->ICON"]);
  });

  test("never flags ordinary names, however close to a hook", () => {
    expect(
      typos(`
for (let row = 0; row < 3; row++) grid[row] = rows[row];
const col = 2;
let dogW = 32;
let dow = 1;
const raw = JSON.parse(text);
crow = new Actor("crow.png");
function redraw() {}
function draws() {}
function updates() {}
const dogH = 24;
`),
    ).toEqual([]);
  });

  test("never flags identifiers that are used rather than defined", () => {
    expect(
      typos(`
drow();
foo(drow, udpate);
function helper(drow, udpate = () => {}) {}
const { drow: a } = pkg;
const [darw] = list;
obj.drow = () => {};
obj?.udpate = function () {};
x == drow;
`),
    ).toEqual([]);
  });

  test("only checks constants against plain assignments, not hooks", () => {
    expect(typos("drow = 1")).toEqual([]);
    expect(typos("let udpate = 0")).toEqual([]);
    expect(typos("const Drow = 1")).toEqual([]);
  });

  test("uses a length-aware distance", () => {
    expect(typos("function dra() {}")).toEqual(["dra->draw"]);
    expect(typos("function dr() {}")).toEqual([]);
    expect(typos("function upd_te() {}")).toEqual(["upd_te->update"]);
    expect(typos("function upxyzte() {}")).toEqual([]);
    expect(typos("function on_key_dow() {}")).toEqual([
      "on_key_dow->on_key_down",
    ]);
    expect(typos("function on_mouse_downs() {}")).toEqual([]);
  });

  test("stays quiet when the suggested name is itself defined", () => {
    expect(typos("function draw() {}\nfunction drawn() {}")).toEqual([]);
    expect(typos("function draw() {}\nconst drow = () => {}")).toEqual([]);
    expect(typos("WIDTH = 800;\nconst WIDHT = 1;")).toEqual([]);
    expect(typos("function draw() {}\nfunction drwa() {}")).toEqual([]);
    expect(typos("function drwa() {}")).toEqual(["drwa->draw"]);
  });

  test("ignores definitions nested inside other code", () => {
    expect(
      typos(`
function draw() {
  function drow() {}
  const udpate = () => {};
  WIDHT = 1;
}
const settings = { WIDHT: 1, drwa: () => {} };
class Game { darw() {} }
if (ready) { HEIGTH = 2; }
`),
    ).toEqual([]);
  });

  test("ignores hook-like words inside strings, comments, templates and regexes", () => {
    expect(
      typos(`
// function drow() {}
/* function darw() {} */
const label = "function drew() {}";
const text = \`WIDHT = \${1} function udpate() {}\`;
const pattern = /function drwa\\(\\) \\{\\}/;
`),
    ).toEqual([]);
  });

  test("emits nothing when the source cannot be scanned", () => {
    expect(typos("function drow() {}\nconst s = 'unterminated")).toEqual([]);
    expect(typos("function drow() {} }")).toEqual([]);
  });

  test("reports each name once and keeps asset-name checks", () => {
    const diagnostics = collectRuntimeDiagnostics(`
function drow() {}
drow = () => {};
const asset = "Player Ship.svg";
`);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "hook-typo",
      "asset-name",
    ]);
  });
});

describe("module typo diagnostics", () => {
  function moduleTypos(module: Record<string, unknown>): string[] {
    return collectRuntimeDiagnostics(module)
      .filter(
        (diagnostic) =>
          diagnostic.code === "hook-typo" ||
          diagnostic.code === "constant-typo",
      )
      .map((diagnostic) => `${diagnostic.name}->${diagnostic.suggestion}`);
  }

  test("flags misspelled keys with the length-aware distance", () => {
    expect(moduleTypos({ drow() {} })).toEqual(["drow->draw"]);
    expect(moduleTypos({ udpate() {} })).toEqual(["udpate->update"]);
    expect(moduleTypos({ WIDHT: 800 })).toEqual(["WIDHT->WIDTH"]);
    expect(moduleTypos({ dow: 1, crow: 2, redraw() {} })).toEqual([]);
  });

  test("stays quiet when the real key is present", () => {
    expect(moduleTypos({ draw() {}, drawn() {} })).toEqual([]);
    expect(moduleTypos({ WIDTH: 800, WIDHT: 1 })).toEqual([]);
  });
});

describe("hook parameter diagnostics", () => {
  function parameterWarnings(module: Record<string, unknown>): string[] {
    return collectRuntimeDiagnostics(module)
      .filter((diagnostic) => diagnostic.code === "hook-parameter")
      .map((diagnostic) => diagnostic.message);
  }

  test("says which value an unfamiliar parameter name receives", () => {
    expect(parameterWarnings({ on_mouse_down(position: unknown) {} })).toEqual([
      "on_mouse_down's position parameter receives pos, because it is in that place in the list. Rename it to pos to make that clear (on_mouse_down receives pos, button, buttons, rel).",
    ]);
    expect(
      parameterWarnings({ onKeyDown(key: unknown, shift: unknown) {} }),
    ).toEqual([
      "onKeyDown's shift parameter receives mod, because it is in that place in the list. Rename it to mod to make that clear (onKeyDown receives key, mod, unicode, repeat).",
    ]);
  });

  test("flags parameters a hook can never fill", () => {
    expect(parameterWarnings({ on_music_end(track: unknown) {} })).toEqual([
      "on_music_end receives nothing, so its track parameter will always be undefined.",
    ]);
  });

  test("stays quiet for documented names and a lone event parameter", () => {
    expect(
      parameterWarnings({
        on_key_down(mod: unknown, key: unknown) {},
        on_mouse_move(pos: unknown, rel: unknown, buttons: unknown) {},
        onMouseDown(event: unknown) {},
      }),
    ).toEqual([]);
  });
});
