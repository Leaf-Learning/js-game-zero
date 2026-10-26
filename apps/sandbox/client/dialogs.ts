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

/** Closes the open dialog, and puts focus back where it was before it. */
function closeActive(previousFocus: Element | null): void {
  ensureHost().replaceChildren();
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
    previousFocus.focus();
  }
}

let titleCount = 0;

/** A heading with an id, for the dialog's `aria-labelledby`. */
function dialogTitle(text: string): { id: string; heading: HTMLElement } {
  titleCount += 1;
  const id = `jgz-dialog-title-${titleCount}`;
  return { id, heading: h("h2", { text, attrs: { id } }) };
}

/**
 * Keeps the keyboard in an open dialog: Tab and Shift+Tab go round its
 * controls rather than into the page behind it, a click on its text leaves
 * focus in it, and Escape closes it.
 */
export function holdFocus(dialog: HTMLElement, onEscape: () => void): void {
  dialog.tabIndex = -1;
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(
      (control) =>
        !(control as HTMLButtonElement).disabled &&
        control.getClientRects().length > 0,
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === dialog)) {
      event.preventDefault();
      first.focus();
    }
  });
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
    const previousFocus = document.activeElement;
    const finish = (result: boolean): void => {
      closeActive(previousFocus);
      resolve(result);
    };
    const title = dialogTitle(options.title);
    const dialog = h(
      "div",
      {
        className: "dialog",
        attrs: {
          role: "alertdialog",
          "aria-modal": "true",
          "aria-labelledby": title.id,
          "data-jgz-confirm-dialog": "",
        },
      },
      [
        title.heading,
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
    // Enter on a dangerous choice shouldn't be the easy way out.
    qs<HTMLButtonElement>(
      dialog,
      options.danger ? "[data-jgz-dialog-cancel]" : "[data-jgz-dialog-confirm]",
    ).focus();
    holdFocus(dialog, () => finish(false));
  });
}

export type ChoiceDialogOption = {
  readonly id: string;
  readonly label: string;
  readonly danger?: boolean;
};

export type ChoiceOptions = {
  readonly title: string;
  readonly body: string;
  readonly choices: readonly ChoiceDialogOption[];
};

/** Like confirmDialog, but with one button per named choice. Resolves to the
 * chosen id, or null when cancelled. */
export function choiceDialog(options: ChoiceOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const container = ensureHost();
    const previousFocus = document.activeElement;
    const finish = (result: string | null): void => {
      closeActive(previousFocus);
      resolve(result);
    };
    const title = dialogTitle(options.title);
    const dialog = h(
      "div",
      {
        className: "dialog",
        attrs: {
          role: "alertdialog",
          "aria-modal": "true",
          "aria-labelledby": title.id,
          "data-jgz-choice-dialog": "",
        },
      },
      [
        title.heading,
        h("p", { text: options.body }),
        h("div", { className: "dialog-actions" }, [
          h("button", {
            className: "btn btn-ghost",
            text: "Cancel",
            attrs: { type: "button", "data-jgz-dialog-cancel": "" },
            onClick: () => finish(null),
          }),
          ...options.choices.map((choice) =>
            h("button", {
              className: choice.danger ? "btn btn-danger" : "btn btn-primary",
              text: choice.label,
              attrs: { type: "button", "data-jgz-dialog-choice": choice.id },
              onClick: () => finish(choice.id),
            }),
          ),
        ]),
      ],
    );
    const backdrop = h("div", { className: "dialog-backdrop" });
    backdrop.addEventListener("click", () => finish(null));
    container.replaceChildren(backdrop, dialog);
    qs<HTMLButtonElement>(dialog, "[data-jgz-dialog-choice]").focus();
    holdFocus(dialog, () => finish(null));
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
    const previousFocus = document.activeElement;
    const finish = (result: string | null): void => {
      closeActive(previousFocus);
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

    const title = dialogTitle(options.title);
    const form = h(
      "form",
      {
        className: "dialog-form",
        attrs: {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": title.id,
          "data-jgz-dialog-form": "",
        },
      },
      [
        title.heading,
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
    holdFocus(form, () => finish(null));
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
