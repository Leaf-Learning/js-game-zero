import { h } from "./dom";
import { icon, type IconName } from "./icons";

export type PopoverHandle = {
  open(): void;
  close(options?: { readonly restoreFocus?: boolean }): void;
  toggle(): void;
  isOpen(): boolean;
};

/**
 * A button that shows and hides a panel under it. The panel closes on
 * Escape (focus goes back to the button), on a click anywhere else, and
 * when keyboard focus moves out of it.
 */
export function createPopover(
  button: HTMLButtonElement,
  panel: HTMLElement,
  options: { readonly initialFocus?: () => HTMLElement | null } = {},
): PopoverHandle {
  let openNow = false;

  function open(): void {
    if (openNow) return;
    openNow = true;
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    const target =
      options.initialFocus?.() ??
      panel.querySelector<HTMLElement>("button, a[href], input");
    target?.focus();
  }

  function close({ restoreFocus = false } = {}): void {
    if (!openNow) return;
    openNow = false;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus) button.focus();
  }

  button.setAttribute("aria-expanded", "false");
  panel.hidden = true;
  button.addEventListener("click", () => (openNow ? close() : open()));
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close({ restoreFocus: true });
    }
  });
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!openNow || !(target instanceof Node)) return;
    if (panel.contains(target) || button.contains(target)) return;
    close();
  });
  panel.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node)) return;
    if (panel.contains(next) || button.contains(next)) return;
    close();
  });

  return {
    open,
    close,
    toggle: () => (openNow ? close() : open()),
    isOpen: () => openNow,
  };
}

export type MenuItem = {
  readonly label: string;
  readonly icon: IconName;
  readonly danger?: boolean;
  readonly attrs?: Record<string, string>;
  readonly onSelect: () => void;
};

let closeActiveMenu = (): void => {};

/** A short list of actions shown under `anchor`, such as a file's Rename
 * and Delete. Choosing one, pressing Escape, or clicking away closes it. */
export function openMenu(
  anchor: HTMLElement,
  items: readonly MenuItem[],
): void {
  closeActiveMenu();
  const finish = (restoreFocus: boolean): void => {
    menu.remove();
    document.removeEventListener("pointerdown", onOutside, true);
    closeActiveMenu = () => {};
    if (restoreFocus) anchor.focus();
  };
  const onOutside = (event: PointerEvent): void => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    finish(false);
  };
  const menu = h(
    "div",
    { className: "menu", attrs: { role: "menu" } },
    items.map((item) =>
      h(
        "button",
        {
          className: item.danger ? "menu-item menu-item-danger" : "menu-item",
          attrs: { type: "button", role: "menuitem", ...item.attrs },
          onClick: () => {
            finish(false);
            item.onSelect();
          },
        },
        [icon(item.icon, 18), item.label],
      ),
    ),
  );
  menu.addEventListener("keydown", (event) => {
    const buttons = Array.from(menu.querySelectorAll("button"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Tab") {
      finish(false);
    }
  });
  document.body.append(menu);
  const box = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  menu.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - width - 8))}px`;
  menu.style.top = `${box.bottom + 6}px`;
  closeActiveMenu = () => finish(false);
  document.addEventListener("pointerdown", onOutside, true);
  menu.querySelector("button")?.focus();
}
