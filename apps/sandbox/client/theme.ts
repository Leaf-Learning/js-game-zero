import { icon } from "./icons";

export type Theme = "light" | "dark";

const THEME_KEY = "jgz-sandbox:theme";
const darkPreference = window.matchMedia("(prefers-color-scheme: dark)");

export type ThemeController = {
  current(): Theme;
  subscribe(listener: (theme: Theme) => void): () => void;
};

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function resolvedTheme(): Theme {
  return storedTheme() ?? (darkPreference.matches ? "dark" : "light");
}

function setButtonState(button: HTMLButtonElement, theme: Theme): void {
  const next = theme === "dark" ? "light" : "dark";
  button.setAttribute("aria-pressed", String(theme === "dark"));
  button.setAttribute("aria-label", `Switch to ${next} mode`);
  button.title = `Switch to ${next} mode`;
  button.replaceChildren(icon(theme === "dark" ? "sun" : "moon", 20));
}

export function initThemeToggle(button: HTMLButtonElement): ThemeController {
  let current = resolvedTheme();
  const listeners = new Set<(theme: Theme) => void>();

  const publish = (theme: Theme): void => {
    current = theme;
    setButtonState(button, theme);
    for (const listener of listeners) listener(theme);
  };

  setButtonState(button, current);

  button.addEventListener("click", () => {
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.jgzTheme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Theme persistence is a convenience; private browsing may reject it.
    }
    publish(next);
  });

  darkPreference.addEventListener("change", (event) => {
    if (storedTheme()) return;
    publish(event.matches ? "dark" : "light");
  });

  return {
    current: () => current,
    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
