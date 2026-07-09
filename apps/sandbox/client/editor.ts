import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";

const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "14px",
      backgroundColor: "var(--editor-bg)",
      color: "var(--editor-fg)",
    },
    ".cm-content": {
      fontFamily:
        "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      caretColor: "var(--accent)",
      padding: "14px 0",
    },
    ".cm-scroller": { overflow: "auto" },
    "&.cm-focused": { outline: "none" },
    ".cm-gutters": {
      backgroundColor: "var(--editor-bg)",
      color: "var(--editor-gutter)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--editor-active-line)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "var(--editor-selection) !important",
    },
    ".cm-cursor": { borderLeftColor: "var(--accent)" },
    ".cm-matchingBracket": {
      backgroundColor: "var(--editor-bracket)",
      outline: "1px solid var(--accent)",
    },
  },
  { dark: true },
);

export type EditorHandle = {
  setValue(content: string): void;
  getValue(): string;
};

export type EditorOptions = {
  readonly onChange: (content: string) => void;
  readonly onSaveShortcut: () => void;
};

export function createEditor(
  container: HTMLElement,
  options: EditorOptions,
): EditorHandle {
  let suppressChange = false;

  const view = new EditorView({
    parent: container,
    state: EditorState.create({
      doc: "",
      extensions: [
        basicSetup,
        javascript(),
        editorTheme,
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
      });
      suppressChange = false;
    },
    getValue(): string {
      return view.state.doc.toString();
    },
  };
}
