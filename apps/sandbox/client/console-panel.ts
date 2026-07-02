import { h, qs } from "./dom";
import type { ConsoleLine, Diagnostic } from "./types";

const MAX_CONSOLE_LINES = 300;

export type ConsolePanelHandle = {
  appendConsole(line: ConsoleLine): void;
  setDiagnostics(diagnostics: readonly Diagnostic[]): void;
  clear(): void;
};

export function createConsolePanel(root: HTMLElement): ConsolePanelHandle {
  const consoleTab = qs<HTMLButtonElement>(root, "[data-jgz-console-tab]");
  const problemsTab = qs<HTMLButtonElement>(root, "[data-jgz-problems-tab]");
  const consoleOutput = qs<HTMLDivElement>(root, "[data-jgz-console-output]");
  const problemsOutput = qs<HTMLUListElement>(root, "[data-jgz-diagnostics]");
  const problemsBadge = qs<HTMLSpanElement>(root, "[data-jgz-problems-badge]");

  let consoleLines: ConsoleLine[] = [];
  let diagnostics: readonly Diagnostic[] = [];
  let activeTab: "console" | "problems" = "console";

  function renderTabs(): void {
    consoleTab.setAttribute("aria-selected", String(activeTab === "console"));
    problemsTab.setAttribute("aria-selected", String(activeTab === "problems"));
    consoleOutput.hidden = activeTab !== "console";
    problemsOutput.hidden = activeTab !== "problems";
  }

  function selectTab(tab: "console" | "problems"): void {
    activeTab = tab;
    renderTabs();
  }

  consoleTab.addEventListener("click", () => selectTab("console"));
  problemsTab.addEventListener("click", () => selectTab("problems"));

  function renderConsole(): void {
    consoleOutput.replaceChildren(
      ...consoleLines.map((line) =>
        h("p", {
          className: `console-line console-line-${line.level}`,
          text: line.text,
        }),
      ),
    );
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  function renderDiagnostics(): void {
    problemsBadge.textContent = String(diagnostics.length);
    problemsBadge.hidden = diagnostics.length === 0;
    if (diagnostics.length === 0) {
      problemsOutput.replaceChildren(
        h("li", {
          className: "diagnostic-empty",
          text: "No problems. Nice work!",
        }),
      );
      problemsOutput.dataset.count = "0";
      return;
    }
    problemsOutput.dataset.count = String(diagnostics.length);
    problemsOutput.replaceChildren(
      ...diagnostics.map((diagnostic) =>
        h("li", {
          className: "diagnostic-item",
          attrs: { "data-severity": diagnostic.severity },
          text:
            diagnostic.line !== undefined
              ? `${diagnostic.message} (line ${diagnostic.line})`
              : diagnostic.message,
        }),
      ),
    );
  }

  renderTabs();
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
      if (diagnostics.length > 0) selectTab("problems");
      renderDiagnostics();
    },
    clear(): void {
      consoleLines = [];
      diagnostics = [];
      renderConsole();
      renderDiagnostics();
    },
  };
}
