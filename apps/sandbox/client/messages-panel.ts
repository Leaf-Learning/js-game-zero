import { codeAwareText, h, qs } from "./dom";
import { icon } from "./icons";
import { describeProblem } from "./problem-fix";
import type { ConsoleLine, Diagnostic } from "./types";

const MAX_CONSOLE_LINES = 300;

export type MessagesPanelHandle = {
  appendConsole(line: ConsoleLine): void;
  setDiagnostics(diagnostics: readonly Diagnostic[]): void;
  clear(): void;
};

export type MessagesPanelCallbacks = {
  /** A problem's "Line 17" was clicked. */
  readonly onShowLine: (line: number) => void;
  /** Clear was clicked, so the editor's problem mark goes too. */
  readonly onClear: () => void;
};

/**
 * One list for everything the game says: its problems first, then whatever
 * it printed with console.log, and a tip about console.log while both are
 * empty.
 */
export function createMessagesPanel(
  root: HTMLElement,
  callbacks: MessagesPanelCallbacks,
): MessagesPanelHandle {
  const consoleOutput = qs<HTMLDivElement>(root, "[data-jgz-console-output]");
  const problemsOutput = qs<HTMLUListElement>(root, "[data-jgz-diagnostics]");
  const problemsBadge = qs<HTMLSpanElement>(root, "[data-jgz-problems-badge]");
  const emptyTip = qs<HTMLElement>(root, "[data-jgz-messages-empty]");
  const clearButton = qs<HTMLButtonElement>(root, "[data-jgz-clear-messages]");

  let consoleLines: ConsoleLine[] = [];
  let diagnostics: readonly Diagnostic[] = [];

  function renderEmptyTip(): void {
    emptyTip.hidden = consoleLines.length > 0 || diagnostics.length > 0;
    clearButton.disabled = !emptyTip.hidden;
  }

  function renderConsole(): void {
    // Messages follows new output while it's scrolled to the bottom, and
    // leaves the learner's place alone when they've scrolled up to read.
    const scroller = consoleOutput.closest<HTMLElement>(".messages-body");
    const following =
      !scroller ||
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24;
    consoleOutput.replaceChildren(
      ...consoleLines.map((line) =>
        h("p", {
          className: `console-line console-line-${line.level}`,
          text: line.text,
        }),
      ),
    );
    consoleOutput.hidden = consoleLines.length === 0;
    if (scroller && following) scroller.scrollTop = scroller.scrollHeight;
    renderEmptyTip();
  }

  function problemItem(diagnostic: Diagnostic): HTMLLIElement {
    const details = describeProblem(diagnostic.message);
    const chip =
      diagnostic.line !== undefined
        ? h("span", { className: "line-chip", text: `Line ${diagnostic.line}` })
        : h("span", {
            className: "line-chip",
            text: diagnostic.severity === "error" ? "Problem" : "Heads up",
          });
    const body = h("span", { className: "problem-item-text" }, [
      ...codeAwareText(details.text),
      ...(details.where
        ? [
            h("span", {
              className: "problem-where",
              text: ` (${details.where})`,
            }),
          ]
        : []),
    ]);
    const content =
      diagnostic.line !== undefined
        ? h(
            "button",
            {
              className: "problem-item-body",
              attrs: {
                type: "button",
                title: `Show line ${diagnostic.line} in your code`,
                "data-jgz-problem-line": diagnostic.line,
              },
              onClick: () => callbacks.onShowLine(diagnostic.line ?? 1),
            },
            [chip, body],
          )
        : h("div", { className: "problem-item-body" }, [chip, body]);
    return h(
      "li",
      {
        className: "diagnostic-item",
        attrs: { "data-severity": diagnostic.severity },
      },
      [content],
    );
  }

  function renderDiagnostics(): void {
    const count = diagnostics.length;
    problemsBadge.textContent = count === 1 ? "1 problem" : `${count} problems`;
    problemsBadge.hidden = count === 0;
    problemsOutput.dataset.count = String(count);
    problemsOutput.hidden = count === 0;
    // What stopped the game comes first, ahead of any warnings before it.
    const errorsFirst = [
      ...diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
      ...diagnostics.filter((diagnostic) => diagnostic.severity !== "error"),
    ];
    problemsOutput.replaceChildren(...errorsFirst.map(problemItem));
    renderEmptyTip();
  }

  function clear(): void {
    consoleLines = [];
    diagnostics = [];
    renderConsole();
    renderDiagnostics();
  }

  emptyTip.replaceChildren(
    icon("bulb", 20),
    h("span", {}, [
      "Nothing yet. Put ",
      h("code", { text: 'console.log("Hello!")' }),
      " in your code and its message shows up here.",
    ]),
  );
  clearButton.addEventListener("click", () => {
    clear();
    callbacks.onClear();
  });
  renderConsole();
  renderDiagnostics();

  return {
    appendConsole(line: ConsoleLine): void {
      consoleLines.push(line);
      if (consoleLines.length > MAX_CONSOLE_LINES) {
        consoleLines = consoleLines.slice(
          consoleLines.length - MAX_CONSOLE_LINES,
        );
      }
      renderConsole();
    },
    setDiagnostics(next: readonly Diagnostic[]): void {
      diagnostics = next;
      renderDiagnostics();
    },
    clear,
  };
}
