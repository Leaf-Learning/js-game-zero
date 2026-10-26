/**
 * Turns a runtime problem message into what the sandbox shows a learner:
 * the message itself, where in the game it happened, a one-click fix when
 * the message already names the right spelling, and the reference page for
 * the thing it's about. Pure, so it's tested without a browser.
 */

export type ProblemFix = {
  /** Text on the problem's line to replace. It must appear there once. */
  readonly find: string;
  readonly replace: string;
  /** The button's words: "Change it to filledRect". */
  readonly label: string;
};

export type ProblemDocs = {
  /** A documentation page id, such as "reference/screen". */
  readonly page: string;
  readonly hash?: string;
  readonly label: string;
};

export type ProblemDetails = {
  /** The message without the runtime's "draw failed: " prefix. */
  readonly text: string;
  /** Where in the game it happened, in words: "in draw()". */
  readonly where?: string;
  /** The misspelled name to underline on the problem's line. */
  readonly highlight?: string;
  readonly fix?: ProblemFix;
  readonly docs?: ProblemDocs;
};

const PHASES: Readonly<Record<string, string>> = {
  startup: "while starting",
  update: "in update()",
  draw: "in draw()",
  input: "while handling input",
  clock: "in a scheduled function",
  asset: "while loading an asset",
  storage: "while saving",
  audio: "while playing a sound",
};

const REFERENCE_PAGES: Readonly<Record<string, string>> = {
  screen: "reference/screen",
  clock: "reference/clock",
  keyboard: "reference/hooks",
  keys: "reference/hooks",
  keymods: "reference/hooks",
  mouse: "reference/hooks",
  music: "reference/audio",
  sounds: "reference/audio",
  tone: "reference/audio",
  actor: "reference/actor",
  rect: "reference/rect",
  storage: "reference/storage",
  images: "reference/loaders",
};

const MISSING_MEMBER =
  /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.([A-Za-z_$][\w$]*) doesn't exist\.(?: Did you mean ([A-Za-z_$][\w$.]*)\?)?$/;
const UNDEFINED_NAME =
  /^([A-Za-z_$][\w$]*) is not defined\.(?: Did you mean ([A-Za-z_$][\w$]*)\?)?$/;
const COLOR_NAME =
  /^"([^"]+)" isn't a color name\.(?: Did you mean "([^"]+)"\?)?$/;

export function describeProblem(message: string): ProblemDetails {
  const phase = /^(\w+) failed: ([\s\S]*)$/.exec(message);
  const where = phase ? PHASES[phase[1] ?? ""] : undefined;
  const text = phase && where ? (phase[2] ?? message) : message;
  const base = where ? { text, where } : { text };

  const member = MISSING_MEMBER.exec(text);
  if (member) {
    const [, label = "", property = "", suggestion] = member;
    const owner = suggestion?.slice(0, suggestion.lastIndexOf(".")) || label;
    const page = REFERENCE_PAGES[owner.split(".")[0]?.toLowerCase() ?? ""];
    return {
      ...base,
      highlight: property,
      ...(suggestion ? { fix: memberFix(label, property, suggestion) } : {}),
      ...(page ? { docs: { page, label: `What can ${owner} do?` } } : {}),
    };
  }

  const undefinedName = UNDEFINED_NAME.exec(text);
  if (undefinedName) {
    const [, wrong = "", suggestion] = undefinedName;
    const page = suggestion
      ? REFERENCE_PAGES[suggestion.toLowerCase()]
      : undefined;
    return {
      ...base,
      highlight: wrong,
      ...(suggestion
        ? {
            fix: {
              find: wrong,
              replace: suggestion,
              label: `Change it to ${suggestion}`,
            },
          }
        : {}),
      ...(page && suggestion
        ? { docs: { page, label: `What can ${suggestion} do?` } }
        : {}),
    };
  }

  const color = COLOR_NAME.exec(text);
  if (color) {
    const [, wrong = "", suggestion] = color;
    return {
      ...base,
      highlight: wrong,
      ...(suggestion
        ? {
            fix: {
              find: wrong,
              replace: suggestion,
              label: `Change it to "${suggestion}"`,
            },
          }
        : {}),
      docs: {
        page: "reference/screen",
        hash: "#colors",
        label: "Which colors can I use?",
      },
    };
  }
  return base;
}

/**
 * `screen.draw.fillRect` → `screen.draw.filledRect` replaces the whole
 * expression. The button names just the new member when that's the only
 * part that changes, and the whole suggestion when more does
 * (`screen.circle` → `screen.draw.circle`).
 */
function memberFix(
  label: string,
  property: string,
  suggestion: string,
): ProblemFix {
  const rest = suggestion.startsWith(`${label}.`)
    ? suggestion.slice(label.length + 1)
    : suggestion;
  return {
    find: `${label}.${property}`,
    replace: suggestion,
    label: `Change it to ${rest.includes(".") || rest === suggestion ? suggestion : rest}`,
  };
}

/** Labels that name a kind of thing rather than a global the code uses by
 * name: the code says `player.angle_to`, the message `actor.angle_to`. */
const KIND_LABELS = new Set(["actor", "animation", "image", "rect", "sound"]);

/**
 * The line with the fix applied, or null when it can't be applied safely:
 * the text to replace must appear exactly once, as a whole name.
 */
export function applyFix(line: string, fix: ProblemFix): string | null {
  const whole = matchesOnce(line, fix.find);
  if (whole !== null) {
    return (
      line.slice(0, whole) + fix.replace + line.slice(whole + fix.find.length)
    );
  }
  const dot = fix.find.lastIndexOf(".");
  if (dot < 0) return null;
  const member = fix.find.slice(dot);
  const owner = fix.find.slice(0, dot);
  if (!KIND_LABELS.has(owner) || !fix.replace.startsWith(`${owner}.`)) {
    return null;
  }
  const replacement = fix.replace.slice(fix.replace.lastIndexOf("."));
  const at = matchesOnce(line, member);
  return at === null
    ? null
    : line.slice(0, at) + replacement + line.slice(at + member.length);
}

/** Where `needle` appears in `line` with no name characters either side,
 * when it appears exactly once like that. */
function matchesOnce(line: string, needle: string): number | null {
  const found: number[] = [];
  for (
    let at = line.indexOf(needle);
    at >= 0;
    at = line.indexOf(needle, at + 1)
  ) {
    const before = line[at - 1] ?? "";
    const after = line[at + needle.length] ?? "";
    const quoted = needle.startsWith('"') || /^\W/.test(needle);
    if ((quoted || !/[\w$.]/.test(before)) && !/[\w$]/.test(after)) {
      found.push(at);
    }
  }
  return found.length === 1 ? (found[0] ?? null) : null;
}

/** The column range of `name` on `line`, for underlining it. */
export function highlightRange(
  line: string,
  name: string,
): { readonly from: number; readonly to: number } | null {
  const at = matchesOnce(line, name) ?? matchesOnce(line, `.${name}`);
  if (at === null) return null;
  const from = line.startsWith(".", at) && !name.startsWith(".") ? at + 1 : at;
  return { from, to: from + name.length };
}
