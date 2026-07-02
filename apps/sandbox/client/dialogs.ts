import { h, qs } from "./dom";

let host: HTMLDivElement | null = null;

function ensureHost(): HTMLDivElement {
  if (host) return host;
  // dialog-host-top: prompts/confirms are leaf dialogs that can open while
  // a container dialog (the example gallery) is still up, so this host
  // must stack above the gallery's regardless of which host happened to
  // be created first.
  host = h("div", {
    className: "dialog-host dialog-host-top",
    attrs: { "data-jgz-dialog-host": "" },
  });
  document.body.append(host);
  return host;
}

function closeActive(): void {
  ensureHost().replaceChildren();
}

export type ConfirmOptions = {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel?: string;
  readonly danger?: boolean;
};

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const container = ensureHost();
    const finish = (result: boolean): void => {
      closeActive();
      resolve(result);
    };
    const dialog = h(
      "div",
      {
        className: "dialog",
        attrs: {
          role: "alertdialog",
          "aria-modal": "true",
          "data-jgz-confirm-dialog": "",
        },
      },
      [
        h("h2", { text: options.title }),
        h("p", { text: options.body }),
        h("div", { className: "dialog-actions" }, [
          h("button", {
            className: "btn btn-ghost",
            text: "Cancel",
            attrs: { type: "button", "data-jgz-dialog-cancel": "" },
            onClick: () => finish(false),
          }),
          h("button", {
            className: options.danger ? "btn btn-danger" : "btn btn-primary",
            text: options.confirmLabel ?? "Confirm",
            attrs: { type: "button", "data-jgz-dialog-confirm": "" },
            onClick: () => finish(true),
          }),
        ]),
      ],
    );
    const backdrop = h("div", { className: "dialog-backdrop" });
    backdrop.addEventListener("click", () => finish(false));
    container.replaceChildren(backdrop, dialog);
    qs<HTMLButtonElement>(dialog, "[data-jgz-dialog-confirm]").focus();
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish(false);
    });
  });
}

export type PromptOptions = {
  readonly title: string;
  readonly body?: string;
  readonly placeholder?: string;
  readonly initialValue?: string;
  readonly confirmLabel?: string;
  readonly validate?: (value: string) => string | null;
};

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const container = ensureHost();
    const finish = (result: string | null): void => {
      closeActive();
      resolve(result);
    };
    const input = h("input", {
      className: "text-input",
      attrs: {
        type: "text",
        autocomplete: "off",
        spellcheck: "false",
        placeholder: options.placeholder ?? "",
        value: options.initialValue ?? "",
        "data-jgz-dialog-input": "",
      },
    }) as HTMLInputElement;
    const error = h("p", {
      className: "dialog-error",
      attrs: { "data-jgz-dialog-error": "" },
    });
    error.hidden = true;

    const submit = (): void => {
      const value = input.value.trim();
      const problem = options.validate?.(value) ?? null;
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        input.focus();
        return;
      }
      finish(value);
    };

    const form = h(
      "form",
      { className: "dialog-form", attrs: { "data-jgz-dialog-form": "" } },
      [
        h("h2", { text: options.title }),
        ...(options.body ? [h("p", { text: options.body })] : []),
        input,
        error,
        h("div", { className: "dialog-actions" }, [
          h("button", {
            className: "btn btn-ghost",
            text: "Cancel",
            attrs: { type: "button", "data-jgz-dialog-cancel": "" },
            onClick: () => finish(null),
          }),
          h("button", {
            className: "btn btn-primary",
            text: options.confirmLabel ?? "Create",
            attrs: { type: "submit", "data-jgz-dialog-submit": "" },
          }),
        ]),
      ],
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit();
    });
    const backdrop = h("div", { className: "dialog-backdrop" });
    backdrop.addEventListener("click", () => finish(null));
    container.replaceChildren(backdrop, form);
    input.focus();
    input.select();
    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish(null);
    });
  });
}

export function toast(message: string, kind: "info" | "error" = "info"): void {
  const container = document.querySelector<HTMLDivElement>(
    "[data-jgz-toast-host]",
  );
  if (!container) return;
  const node = h("div", { className: `toast toast-${kind}`, text: message });
  container.append(node);
  requestAnimationFrame(() => node.classList.add("toast-visible"));
  setTimeout(() => {
    node.classList.remove("toast-visible");
    setTimeout(() => node.remove(), 200);
  }, 3200);
}
