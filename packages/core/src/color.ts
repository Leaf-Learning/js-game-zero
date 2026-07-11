export type Color =
  | string
  | readonly [number, number, number]
  | readonly [number, number, number, number];

export function normalizeColor(color: Color): string {
  if (typeof color === "string" && color.length > 0) return color;
  if (Array.isArray(color) && (color.length === 3 || color.length === 4)) {
    const [red, green, blue] = color;
    const alpha = color[3];
    const values = [red, green, blue];
    if (
      values.every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 255,
      )
    ) {
      if (alpha === undefined) return `rgb(${red}, ${green}, ${blue})`;
      if (Number.isFinite(alpha) && alpha >= 0 && alpha <= 255) {
        return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
      }
    }
  }
  throw new TypeError("color must be a CSS string or an RGB/RGBA tuple.");
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
