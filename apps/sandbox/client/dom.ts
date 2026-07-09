export function qs<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing required element: ${selector}`);
  return found;
}

type ElementProps = {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Record<string, string | number | boolean | undefined>;
  readonly onClick?: (event: MouseEvent) => void;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === undefined || value === false) continue;
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  if (props.onClick) {
    node.addEventListener("click", props.onClick as EventListener);
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

/**
 * Attach a single delegated listener to a stable container. This is the
 * fix for the "clicks never register while a game is running" defect: the
 * listener lives on `container`, which is never torn down, so it keeps
 * working even while child rows are replaced by scoped list updates.
 */
export function delegate<K extends keyof HTMLElementEventMap>(
  container: Element,
  type: K,
  selector: string,
  handler: (event: HTMLElementEventMap[K], target: HTMLElement) => void,
): void {
  container.addEventListener(type, (event) => {
    const originalTarget = event.target;
    if (!(originalTarget instanceof Element)) return;
    const target = originalTarget.closest(selector);
    if (target instanceof HTMLElement && container.contains(target)) {
      handler(event as HTMLElementEventMap[K], target);
    }
  });
}

/**
 * Shared project-name rule used by both the onboarding flow and the
 * sidebar rename/create dialogs, so the pattern and copy stay in one place.
 * The server enforces its own independent guard in src/sandbox.ts.
 */
export function validateProjectName(
  value: string,
  existing: readonly string[],
): string | null {
  if (value.length === 0) return "Give your project a name first.";
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(value)) {
    return "Project names start with a lowercase letter and can only use lowercase letters, numbers, - and _.";
  }
  if (existing.includes(value))
    return "You already have a project with that name.";
  return null;
}
