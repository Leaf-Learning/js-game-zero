import { describeValue, editDistance } from "./util";

export type Color =
  | string
  | readonly [number, number, number]
  | readonly [number, number, number, number];

/** The CSS named colors, so a misspelled one can fail with a suggestion. */
const namedColors = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black
  blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse
  chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan
  darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta
  darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink
  deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen
  fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey
  honeydew hotpink indianred indigo ivory khaki lavender lavenderblush
  lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow
  lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
  lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
  limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid
  mediumpurple mediumseagreen mediumslateblue mediumspringgreen
  mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff
  peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
  saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle
  tomato turquoise violet wheat white whitesmoke yellow yellowgreen
  transparent currentcolor`.split(/\s+/),
);

const hexColor = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const colorFunction =
  /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(.*\)$/is;

/**
 * Turns a color into a canvas style string. A canvas silently ignores a
 * color it can't read and keeps drawing with the previous one, so anything
 * that isn't a recognizable color fails here, with a suggestion.
 */
export function normalizeColor(color: Color): string {
  if (typeof color === "string") return requireColorString(color);
  if (Array.isArray(color) && (color.length === 3 || color.length === 4)) {
    return colorFromTuple(color);
  }
  throw new TypeError(
    `${describeValue(color)} isn't a color. Use a color name like "red", a hex code like "#ff8800", or a list of red, green and blue numbers like [255, 136, 0].`,
  );
}

function requireColorString(color: string): string {
  const value = color.trim();
  if (
    namedColors.has(value.toLowerCase()) ||
    hexColor.test(value) ||
    colorFunction.test(value) ||
    browserSupportsColor(value)
  ) {
    return color;
  }
  if (value.startsWith("#")) {
    throw new TypeError(
      `"${color}" isn't a hex color. Use # and 3 or 6 hex digits (0-9, a-f), like "#f80" or "#ff8800".`,
    );
  }
  const suggestion = closestColorName(value);
  throw new TypeError(
    suggestion === undefined
      ? `"${color}" isn't a color name. Use a color name like "red", a hex code like "#ff8800", or a list like [255, 136, 0].`
      : `"${color}" isn't a color name. Did you mean "${suggestion}"?`,
  );
}

function colorFromTuple(color: readonly number[]): string {
  const problem = tupleProblem(color);
  if (problem !== undefined) {
    throw new TypeError(`${describeValue(color)} isn't a color: ${problem}.`);
  }
  const [red, green, blue, alpha] = color;
  if (alpha === undefined) return `rgb(${red}, ${green}, ${blue})`;
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

/**
 * What's wrong with an RGB or RGBA list, if anything. Shared by color lists
 * and `rgb()`, so both explain a bad number the same way.
 */
function tupleProblem(color: readonly number[]): string | undefined {
  const [red, green, blue] = color;
  const alpha = color[3];
  const isChannel = (value: unknown) =>
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 255;
  if (![red, green, blue].every(isChannel)) {
    return "red, green and blue must be whole numbers from 0 to 255";
  }
  if (alpha === undefined) return undefined;
  if (typeof alpha === "number" && alpha > 0 && alpha < 1) {
    return `the fourth number (alpha) goes from 0 (invisible) to 255 (solid), so for half see-through use ${Math.round(alpha * 255)}, not ${alpha}`;
  }
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 255) {
    return "the fourth number (alpha) goes from 0 (invisible) to 255 (solid)";
  }
  return undefined;
}

/**
 * A color mixed from red, green and blue light, each 0 to 255, with an
 * optional alpha from 0 (invisible) to 255 (solid). It returns the matching
 * list, so it works anywhere a color does, but `rgb(255, 140, 105)` reads
 * plainly to learners who haven't met lists yet.
 */
export function rgb(
  red: number,
  green: number,
  blue: number,
  alpha?: number,
): [number, number, number] | [number, number, number, number] {
  for (const [label, value] of Object.entries({ red, green, blue })) {
    if (value === undefined) {
      throw new TypeError(
        `rgb is missing ${label}: rgb(red, green, blue), each from 0 to 255.`,
      );
    }
    requireRgbNumber(value, label);
  }
  if (alpha !== undefined) requireRgbNumber(alpha, "alpha");
  const color: [number, number, number] | [number, number, number, number] =
    alpha === undefined ? [red, green, blue] : [red, green, blue, alpha];
  const problem = tupleProblem(color);
  if (problem !== undefined) {
    throw new TypeError(`rgb(${color.join(", ")}) isn't a color: ${problem}.`);
  }
  return color;
}

function requireRgbNumber(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(
      `rgb's ${label} must be a number, but got ${describeValue(value)}.`,
    );
  }
}

/** The named color `value` most plausibly misspells (`"light blue"`, `"redd"`). */
function closestColorName(value: string): string | undefined {
  const squashed = value.toLowerCase().replace(/[\s_-]/g, "");
  if (namedColors.has(squashed)) return squashed;
  const threshold = squashed.length < 6 ? 1 : 2;
  let best: { name: string; distance: number } | undefined;
  for (const name of namedColors) {
    const distance = editDistance(squashed, name);
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { name, distance };
    }
  }
  return best?.name;
}

/** Defers to the browser for colors outside the lists above (e.g. system colors). */
function browserSupportsColor(value: string): boolean {
  const css = (
    globalThis as { CSS?: { supports?: (...args: string[]) => boolean } }
  ).CSS;
  try {
    return css?.supports?.("color", value) === true;
  } catch {
    return false;
  }
}

export function verticalGradient(
  context: CanvasRenderingContext2D,
  top: number,
  height: number,
  color: Color,
  gcolor: Color,
): CanvasGradient {
  const gradient = context.createLinearGradient(0, top, 0, top + height);
  gradient.addColorStop(0, normalizeColor(color));
  gradient.addColorStop(1, normalizeColor(gcolor));
  return gradient;
}
