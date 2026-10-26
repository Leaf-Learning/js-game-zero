import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import {
  Compartment,
  EditorState,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  gutterLineClass,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { codeAwareText, h } from "./dom";
import { icon } from "./icons";
import { applyFix, highlightRange, type ProblemDetails } from "./problem-fix";
import type { Theme } from "./theme";

/** The names a zero-boilerplate game gets for free, shown in their own
 * color so learners can tell js-game-zero's words from their own. */
const GAME_GLOBALS = new Set([
  "WIDTH",
  "HEIGHT",
  "TITLE",
  "ICON",
  "PIXEL_DENSITY",
  "TOUCH_CONTROLS",
  "screen",
  "clock",
  "keyboard",
  "keymods",
  "keys",
  "mouse",
  "images",
  "sounds",
  "music",
  "storage",
  "tone",
  "Actor",
  "Animation",
  "Clock",
  "Rect",
  "ZRect",
  "Screen",
  "Storage",
  "animate",
  "clamp",
  "exit",
  "randomChoice",
  "randomInt",
  "rgb",
]);

/** The functions js-game-zero calls for the game. */
const GAME_HOOKS = new Set([
  "draw",
  "update",
  "onKeyDown",
  "onKeyUp",
  "onMouseDown",
  "onMouseUp",
  "onMouseMove",
  "onMusicEnd",
]);

// Colors come from style.css, so one style serves both themes.
const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.bool, tags.null, tags.self],
    color: "var(--syntax-keyword)",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    color: "var(--syntax-string)",
  },
  { tag: tags.number, color: "var(--syntax-number)" },
  {
    tag: tags.comment,
    color: "var(--syntax-comment)",
    fontStyle: "italic",
  },
  { tag: tags.invalid, color: "var(--error)" },
]);

const globalMark = Decoration.mark({ class: "cm-jgz-global" });
const hookMark = Decoration.mark({ class: "cm-jgz-hook" });

function gameNameDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === "VariableName") {
          if (GAME_GLOBALS.has(doc.sliceString(node.from, node.to))) {
            builder.add(node.from, node.to, globalMark);
          }
        } else if (
          node.name === "VariableDefinition" &&
          node.node.parent?.name === "FunctionDeclaration" &&
          GAME_HOOKS.has(doc.sliceString(node.from, node.to))
        ) {
          builder.add(node.from, node.to, hookMark);
        }
      },
    });
  }
  return builder.finish();
}

const gameNames = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = gameNameDecorations(view);
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = gameNameDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function editorTheme(dark: boolean) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "13.5px",
        backgroundColor: "var(--editor-bg)",
        color: "var(--text)",
      },
      ".cm-content": {
        fontFamily: "var(--font-mono)",
        lineHeight: "22px",
        caretColor: "var(--accent)",
        padding: "14px 0",
      },
      ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono)" },
      "&.cm-focused": { outline: "none" },
      ".cm-gutters": {
        backgroundColor: "var(--editor-bg)",
        color: "var(--editor-gutter)",
        border: "none",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        minWidth: "36px",
        padding: "0 12px 0 8px",
      },
      ".cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--editor-active-line)",
        color: "var(--text-muted)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "var(--editor-selection) !important",
      },
      ".cm-cursor": {
        borderLeftColor: "var(--accent)",
        borderLeftWidth: "2px",
      },
      ".cm-matchingBracket": {
        backgroundColor: "var(--editor-bracket)",
        outline: "1px solid var(--accent)",
      },
      ".cm-foldGutter .cm-gutterElement": { color: "var(--editor-gutter)" },
    },
    { dark },
  );
}

const lightEditorTheme = editorTheme(false);
const darkEditorTheme = editorTheme(true);

// ---------- The problem a game stopped on ----------

export type EditorProblem = {
  /** 1-based line in this file. */
  readonly line: number;
  readonly details: ProblemDetails;
};

type ProblemState = EditorProblem & { readonly key: number };

const setProblem = StateEffect.define<ProblemState | null>();

const problemField = StateField.define<ProblemState | null>({
  create: () => null,
  update(value, transaction) {
    let next = value;
    for (const effect of transaction.effects) {
      if (effect.is(setProblem)) next = effect.value;
    }
    if (!next || !transaction.docChanged) return next;
    const { doc } = transaction.startState;
    if (next.line > doc.lines) return null;
    // Editing the problem's own line clears it: the learner is fixing it.
    // Edits elsewhere move it along with its line.
    const line = doc.line(next.line);
    let touched = false;
    transaction.changes.iterChangedRanges((fromA, toA) => {
      if (fromA <= line.to && toA >= line.from) touched = true;
    });
    if (touched) return null;
    const moved = transaction.state.doc.lineAt(
      transaction.changes.mapPos(line.from),
    ).number;
    return moved === next.line ? next : { ...next, line: moved };
  },
});

class ProblemGutterMarker extends GutterMarker {
  override elementClass = "cm-jgz-problem-gutter";
}
const problemGutterMarker = new ProblemGutterMarker();

class ProblemLens extends WidgetType {
  constructor(
    readonly problem: ProblemState,
    readonly fixedLine: string | null,
    readonly onFixed: () => void,
  ) {
    super();
  }

  override eq(other: ProblemLens): boolean {
    return (
      other.problem.key === this.problem.key &&
      other.fixedLine === this.fixedLine
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const { details } = this.problem;
    const actions: HTMLElement[] = [];
    if (details.fix && this.fixedLine !== null) {
      const fixedLine = this.fixedLine;
      actions.push(
        h(
          "button",
          {
            className: "btn btn-primary btn-small",
            attrs: { type: "button", "data-jgz-apply-fix": "" },
            onClick: () => {
              const state = view.state.field(problemField);
              if (!state || state.line > view.state.doc.lines) return;
              const line = view.state.doc.line(state.line);
              view.dispatch({
                changes: { from: line.from, to: line.to, insert: fixedLine },
                effects: setProblem.of(null),
              });
              view.focus();
              this.onFixed();
            },
          },
          [details.fix.label],
        ),
      );
    }
    if (details.docs) {
      actions.push(
        h("a", {
          className: "problem-lens-link",
          text: details.docs.label,
          attrs: {
            href: `/docs?page=${encodeURIComponent(details.docs.page)}${details.docs.hash ?? ""}`,
            target: "_blank",
            rel: "noopener",
          },
        }),
      );
    }
    return h(
      "div",
      {
        className: "problem-lens",
        attrs: { role: "alert", "data-jgz-problem-lens": "" },
      },
      [
        h("div", { className: "problem-lens-message" }, [
          icon("alert", 20),
          h("span", {}, codeAwareText(details.text)),
        ]),
        ...(actions.length > 0
          ? [h("div", { className: "problem-lens-actions" }, actions)]
          : []),
      ],
    );
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

function problemExtensions(onFixed: () => void) {
  const decorations = EditorView.decorations.compute(
    [problemField],
    (state): DecorationSet => {
      const problem = state.field(problemField);
      if (!problem || problem.line > state.doc.lines) return Decoration.none;
      const line = state.doc.line(problem.line);
      const ranges: Range<Decoration>[] = [
        Decoration.line({ class: "cm-jgz-problem-line" }).range(line.from),
      ];
      const word = problem.details.highlight
        ? highlightRange(line.text, problem.details.highlight)
        : null;
      if (word) {
        ranges.push(
          Decoration.mark({ class: "cm-jgz-problem-word" }).range(
            line.from + word.from,
            line.from + word.to,
          ),
        );
      }
      const fixedLine = problem.details.fix
        ? applyFix(line.text, problem.details.fix)
        : null;
      ranges.push(
        Decoration.widget({
          widget: new ProblemLens(problem, fixedLine, onFixed),
          block: true,
          side: 1,
        }).range(line.to),
      );
      return Decoration.set(ranges, true);
    },
  );
  const gutter = gutterLineClass.compute([problemField], (state) => {
    const problem = state.field(problemField);
    if (!problem || problem.line > state.doc.lines) return RangeSet.empty;
    return RangeSet.of([
      problemGutterMarker.range(state.doc.line(problem.line).from),
    ]);
  });
  return [problemField, decorations, gutter];
}

// ---------- The editor ----------

export type EditorHandle = {
  setValue(content: string): void;
  getValue(): string;
  setTheme(theme: Theme): void;
  /** Marks a line with the problem the game stopped on, or clears it. */
  showProblem(problem: EditorProblem | null): void;
  /** False once the marked line has been edited, which clears the mark. */
  hasProblem(): boolean;
  /** Moves the cursor to a line and scrolls it into the middle. */
  revealLine(line: number): void;
};

export type EditorOptions = {
  readonly onChange: (content: string) => void;
  readonly onSaveShortcut: () => void;
  readonly onFixApplied: () => void;
  readonly theme: Theme;
};

export function createEditor(
  container: HTMLElement,
  options: EditorOptions,
): EditorHandle {
  let suppressChange = false;
  let problemKey = 0;
  const themeCompartment = new Compartment();

  const view = new EditorView({
    parent: container,
    state: EditorState.create({
      doc: "",
      extensions: [
        basicSetup,
        javascript(),
        // Long lines wrap rather than scroll sideways, so nothing a learner
        // wrote, and no problem message, is ever out of sight.
        EditorView.lineWrapping,
        syntaxHighlighting(highlightStyle),
        gameNames,
        problemExtensions(() => options.onFixApplied()),
        themeCompartment.of(
          options.theme === "dark" ? darkEditorTheme : lightEditorTheme,
        ),
        keymap.of([
          indentWithTab,
          {
            key: "Mod-s",
            run: () => {
              options.onSaveShortcut();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !suppressChange) {
            options.onChange(update.state.doc.toString());
          }
        }),
      ],
    }),
  });

  return {
    setValue(content: string): void {
      suppressChange = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        effects: setProblem.of(null),
      });
      suppressChange = false;
    },
    getValue(): string {
      return view.state.doc.toString();
    },
    setTheme(theme: Theme): void {
      view.dispatch({
        effects: themeCompartment.reconfigure(
          theme === "dark" ? darkEditorTheme : lightEditorTheme,
        ),
      });
    },
    showProblem(problem: EditorProblem | null): void {
      problemKey += 1;
      view.dispatch({
        effects: setProblem.of(
          problem ? { ...problem, key: problemKey } : null,
        ),
      });
    },
    hasProblem(): boolean {
      return view.state.field(problemField) !== null;
    },
    revealLine(lineNumber: number): void {
      const { doc } = view.state;
      const line = doc.line(Math.min(Math.max(1, lineNumber), doc.lines));
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: "center" }),
      });
      view.focus();
    },
  };
}
