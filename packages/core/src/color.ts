import { editDistance } from "./util";

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
    `${describe(color)} isn't a color. Use a color name like "red", a hex code like "#ff8800", or a list of red, green and blue numbers like [255, 136, 0].`,
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
  const [red, green, blue] = color;
  const alpha = color[3];
  const values = [red, green, blue];
  const isChannel = (value: unknown) =>
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 255;
  if (!values.every(isChannel)) {
    throw new TypeError(
      `${describe(color)} isn't a color: red, green and blue must be whole numbers from 0 to 255.`,
    );
  }
  if (alpha === undefined) return `rgb(${red}, ${green}, ${blue})`;
  if (typeof alpha === "number" && alpha > 0 && alpha < 1) {
    throw new TypeError(
      `${describe(color)} isn't a color: the fourth number (alpha) goes from 0 (invisible) to 255 (solid), so for half see-through use ${Math.round(alpha * 255)}, not ${alpha}.`,
    );
  }
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 255) {
    throw new TypeError(
      `${describe(color)} isn't a color: the fourth number (alpha) goes from 0 (invisible) to 255 (solid).`,
    );
  }
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
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

function describe(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
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
