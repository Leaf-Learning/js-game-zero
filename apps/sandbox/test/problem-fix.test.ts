import { describe, expect, test } from "bun:test";
import {
  applyFix,
  describeProblem,
  highlightRange,
} from "../client/problem-fix";

describe("describeProblem", () => {
  test("a misspelled drawing method offers the right one", () => {
    const problem = describeProblem(
      "draw failed: screen.draw.fillRect doesn't exist. Did you mean screen.draw.filledRect?",
    );
    expect(problem).toEqual({
      text: "screen.draw.fillRect doesn't exist. Did you mean screen.draw.filledRect?",
      where: "in draw()",
      highlight: "fillRect",
      fix: {
        find: "screen.draw.fillRect",
        replace: "screen.draw.filledRect",
        label: "Change it to filledRect",
      },
      docs: { page: "reference/screen", label: "What can screen.draw do?" },
    });
  });

  test("a suggestion on another object names it in full", () => {
    expect(
      describeProblem(
        "startup failed: Clock.schedule doesn't exist. Did you mean clock.schedule?",
      ),
    ).toMatchObject({
      where: "while starting",
      fix: {
        find: "Clock.schedule",
        replace: "clock.schedule",
        label: "Change it to clock.schedule",
      },
      docs: { page: "reference/clock", label: "What can clock do?" },
    });
    expect(
      describeProblem(
        "draw failed: screen.circle doesn't exist. Did you mean screen.draw.circle?",
      ).fix,
    ).toEqual({
      find: "screen.circle",
      replace: "screen.draw.circle",
      label: "Change it to screen.draw.circle",
    });
  });

  test("a misspelled color offers the color it's closest to", () => {
    expect(
      describeProblem(
        'draw failed: "blu" isn\'t a color name. Did you mean "blue"?',
      ),
    ).toMatchObject({
      where: "in draw()",
      highlight: "blu",
      fix: { find: "blu", replace: "blue", label: 'Change it to "blue"' },
      docs: { page: "reference/screen", hash: "#colors" },
    });
  });

  test("a misspelled name offers the name it's closest to", () => {
    expect(
      describeProblem(
        "update failed: scren is not defined. Did you mean screen?",
      ),
    ).toEqual({
      text: "scren is not defined. Did you mean screen?",
      where: "in update()",
      highlight: "scren",
      fix: { find: "scren", replace: "screen", label: "Change it to screen" },
      docs: { page: "reference/screen", label: "What can screen do?" },
    });
    expect(
      describeProblem("draw failed: playr is not defined. Did you mean player?")
        .docs,
    ).toBeUndefined();
    expect(
      applyFix("  scren.fill(scren_color);", {
        find: "scren",
        replace: "screen",
        label: "Change it to screen",
      }),
    ).toBe("  screen.fill(scren_color);");
  });

  test("other messages pass through without a fix", () => {
    expect(describeProblem("startup failed: Unexpected end of script")).toEqual(
      { text: "Unexpected end of script", where: "while starting" },
    );
    expect(describeProblem("Did you mean draw instead of drwa?")).toEqual({
      text: "Did you mean draw instead of drwa?",
    });
    expect(
      describeProblem("screen.draw.wobble doesn't exist.").fix,
    ).toBeUndefined();
  });
});

describe("applyFix", () => {
  const fillRect = {
    find: "screen.draw.fillRect",
    replace: "screen.draw.filledRect",
    label: "Change it to filledRect",
  };

  test("replaces the one place the misspelling appears", () => {
    expect(
      applyFix(
        '  screen.draw.fillRect([0, 130, WIDTH, 50], "#334155");',
        fillRect,
      ),
    ).toBe('  screen.draw.filledRect([0, 130, WIDTH, 50], "#334155");');
  });

  test("changes only the member when the code uses its own variable", () => {
    expect(
      applyFix("  let angle = player.angle_to(target);", {
        find: "actor.angle_to",
        replace: "actor.angleTo",
        label: "Change it to angleTo",
      }),
    ).toBe("  let angle = player.angleTo(target);");
  });

  test("refuses when the text is missing, repeated, or part of a longer name", () => {
    expect(applyFix("screen.draw.filledRect(r, c);", fillRect)).toBeNull();
    expect(
      applyFix("screen.draw.fillRect(a); screen.draw.fillRect(b);", fillRect),
    ).toBeNull();
    expect(applyFix("myscreen.draw.fillRect(r, c);", fillRect)).toBeNull();
    expect(applyFix("screen.draw.fillRectangle(r, c);", fillRect)).toBeNull();
  });

  test("fixes a quoted color", () => {
    expect(
      applyFix('  screen.fill("blu");', {
        find: "blu",
        replace: "blue",
        label: 'Change it to "blue"',
      }),
    ).toBe('  screen.fill("blue");');
  });
});

test("highlightRange finds the misspelled member on its line", () => {
  const line = '  screen.draw.fillRect([0, 130, WIDTH, 50], "#334155");';
  expect(highlightRange(line, "fillRect")).toEqual({ from: 14, to: 22 });
  expect(highlightRange('screen.fill("blu");', "blu")).toEqual({
    from: 13,
    to: 16,
  });
  expect(highlightRange("nothing here", "fillRect")).toBeNull();
});
