import {
  images,
  rectFromBlitTarget,
  type AssetLoader,
  type SurfaceLike,
} from "./assets";
import { Rect, ZRect, type Point, type RectLike } from "./geometry";

export type Color =
  | string
  | readonly [number, number, number]
  | readonly [number, number, number, number];

export type CanvasLike = {
  readonly width: number;
  readonly height: number;
  getContext?: (contextId: "2d") => CanvasRenderingContext2D | null;
};

export type ScreenOptions = {
  readonly imageLoader?: Pick<AssetLoader<SurfaceLike>, "load" | "get">;
};

export type TextAlignOption = "left" | "center" | "right";
export type TextAnchor =
  | "topleft"
  | "topright"
  | "bottomleft"
  | "bottomright"
  | "midtop"
  | "midleft"
  | "midright"
  | "midbottom"
  | "center"
  | readonly [number | HorizontalAnchor, number | VerticalAnchor];
export type HorizontalAnchor = "left" | "center" | "middle" | "right";
export type VerticalAnchor = "top" | "center" | "middle" | "bottom";

export type TextOptions = {
  readonly fontname?: string;
  readonly fontsize?: number;
  readonly color?: Color;
  readonly background?: Color;
  readonly pos?: Point;
  readonly topleft?: Point;
  readonly topright?: Point;
  readonly bottomleft?: Point;
  readonly bottomright?: Point;
  readonly midtop?: Point;
  readonly midleft?: Point;
  readonly midright?: Point;
  readonly midbottom?: Point;
  readonly center?: Point;
  readonly width?: number;
  readonly widthem?: number;
  readonly lineheight?: number;
  readonly align?: TextAlignOption;
  readonly owidth?: number;
  readonly ocolor?: Color;
  readonly shadow?: number | Point;
  readonly scolor?: Color;
  readonly gcolor?: Color;
  readonly alpha?: number;
  readonly anchor?: TextAnchor;
  readonly angle?: number;
};

export type TextboxOptions = Omit<TextOptions, "pos" | "width" | "widthem"> & {
  readonly min_fontsize?: number;
};

export type TextLayout = {
  readonly lines: readonly string[];
  readonly font: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly textWidth: number;
  readonly align: TextAlignOption;
  readonly topLeft: Point;
  readonly anchorOffset: Point;
  readonly alpha: number;
};

type TextPositionKey =
  | "pos"
  | "topleft"
  | "topright"
  | "bottomleft"
  | "bottomright"
  | "midtop"
  | "midleft"
  | "midright"
  | "midbottom"
  | "center";

const textPositionKeys = [
  "pos",
  "topleft",
  "topright",
  "bottomleft",
  "bottomright",
  "midtop",
  "midleft",
  "midright",
  "midbottom",
  "center",
] as const;

let currentScreen: Screen | null = null;

export class Screen {
  readonly canvas: CanvasLike;
  readonly context: CanvasRenderingContext2D;
  readonly imageLoader: Pick<AssetLoader<SurfaceLike>, "load" | "get">;

  readonly draw = {
    line: (start: Point, end: Point, color: Color, width = 1): void =>
      this.drawLine(start, end, color, width),
    circle: (pos: Point, radius: number, color: Color, width = 1): void =>
      this.drawCircle(pos, radius, color, width),
    filled_circle: (pos: Point, radius: number, color: Color): void =>
      this.drawCircle(pos, radius, color, 0, true),
    polygon: (points: Point[], color: Color, width = 1): void =>
      this.drawPolygon(points, color, width),
    filled_polygon: (points: Point[], color: Color): void =>
      this.drawPolygon(points, color, 0, true),
    rect: (rect: RectLike, color: Color, width = 1): void =>
      this.drawRect(rect, color, width),
    filled_rect: (rect: RectLike, color: Color): void =>
      this.drawRect(rect, color, 0, true),
    text: (text: string, pos?: Point, options: TextOptions = {}): void =>
      this.drawText(text, pos, options),
    textbox: (
      text: string,
      rect: RectLike,
      options: TextboxOptions = {},
    ): void => this.drawTextbox(text, rect, options),
  };

  constructor(
    canvas: CanvasLike,
    context?: CanvasRenderingContext2D | null,
    options: ScreenOptions = {},
  ) {
    const resolvedContext = context ?? canvas.getContext?.("2d");
    if (!resolvedContext) {
      throw new TypeError("Screen requires a Canvas 2D context.");
    }
    this.canvas = canvas;
    this.context = resolvedContext;
    this.imageLoader = options.imageLoader ?? images;
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  bounds(): ZRect {
    return new ZRect(0, 0, this.width, this.height);
  }

  clear(): void {
    this.context.save();
    this.context.globalAlpha = 1;
    this.context.fillStyle = "black";
    this.context.fillRect(0, 0, this.width, this.height);
    this.context.restore();
  }

  fill(color: Color, gcolor?: Color): void {
    const style =
      gcolor === undefined
        ? normalizeColor(color)
        : verticalGradient(this.context, this.height, color, gcolor);
    this.context.fillStyle = style;
    this.context.fillRect(0, 0, this.width, this.height);
  }

  blit(
    image: string | SurfaceLike,
    pos: Point | RectLike,
  ): Promise<void> | void {
    if (typeof image === "string") {
      const cached = this.imageLoader.get(image);
      if (cached) {
        this.drawSurface(cached, pos);
        return;
      }
      return this.imageLoader.load(image).then((surface) => {
        this.drawSurface(surface, pos);
      });
    }
    this.drawSurface(image, pos);
  }

  private drawSurface(surface: SurfaceLike, pos: Point | RectLike): void {
    const target = rectFromBlitTarget(pos);
    const source = surface.source as CanvasImageSource;
    if (Array.isArray(target)) {
      this.context.drawImage(source, target[0], target[1]);
      return;
    }
    this.context.drawImage(source, target.left, target.top);
  }

  private drawLine(
    start: Point,
    end: Point,
    color: Color,
    width: number,
  ): void {
    const [startX, startY] = requirePoint(start, "start");
    const [endX, endY] = requirePoint(end, "end");
    this.context.save();
    this.context.strokeStyle = normalizeColor(color);
    this.context.lineWidth = requirePositiveNumber(width, "width");
    this.context.beginPath();
    this.context.moveTo(startX, startY);
    this.context.lineTo(endX, endY);
    this.context.stroke();
    this.context.restore();
  }

  private drawCircle(
    pos: Point,
    radius: number,
    color: Color,
    width: number,
    filled = false,
  ): void {
    const [x, y] = requirePoint(pos, "pos");
    const parsedRadius = requirePositiveNumber(radius, "radius");
    this.context.save();
    this.context.beginPath();
    this.context.arc(x, y, parsedRadius, 0, Math.PI * 2);
    if (filled) {
      this.context.fillStyle = normalizeColor(color);
      this.context.fill();
    } else {
      this.context.strokeStyle = normalizeColor(color);
      this.context.lineWidth = requirePositiveNumber(width, "width");
      this.context.stroke();
    }
    this.context.restore();
  }

  private drawPolygon(
    points: Point[],
    color: Color,
    width: number,
    filled = false,
  ): void {
    if (!Array.isArray(points) || points.length < 3) {
      throw new TypeError("polygon requires at least three points.");
    }
    const parsed = points.map((point, index) =>
      requirePoint(point, `points[${index}]`),
    );
    const first = parsed[0];
    if (!first) throw new TypeError("polygon requires at least three points.");
    this.context.save();
    this.context.beginPath();
    this.context.moveTo(first[0], first[1]);
    for (const [x, y] of parsed.slice(1)) this.context.lineTo(x, y);
    this.context.closePath();
    if (filled) {
      this.context.fillStyle = normalizeColor(color);
      this.context.fill();
    } else {
      this.context.strokeStyle = normalizeColor(color);
      this.context.lineWidth = requirePositiveNumber(width, "width");
      this.context.stroke();
    }
    this.context.restore();
  }

  private drawRect(
    rectLike: RectLike,
    color: Color,
    width: number,
    filled = false,
  ): void {
    const rect = new Rect(rectLike);
    this.context.save();
    if (filled) {
      this.context.fillStyle = normalizeColor(color);
      this.context.fillRect(rect.left, rect.top, rect.width, rect.height);
    } else {
      this.context.strokeStyle = normalizeColor(color);
      this.context.lineWidth = requirePositiveNumber(width, "width");
      this.context.strokeRect(rect.left, rect.top, rect.width, rect.height);
    }
    this.context.restore();
  }

  private drawText(
    text: string,
    pos: Point | undefined,
    options: TextOptions,
  ): void {
    const layout = layoutText(this.context, text, pos, options);
    renderTextLayout(this.context, String(text), layout, options);
  }

  private drawTextbox(
    text: string,
    rectLike: RectLike,
    options: TextboxOptions,
  ): void {
    const rect = new Rect(rectLike);
    const fit = fitTextboxFontSize(this.context, text, rect, options);
    const layout = layoutText(this.context, text, rect.topleft, {
      ...options,
      fontsize: fit.fontSize,
      width: rect.width,
      lineheight: fit.lineHeight,
    });
    renderTextLayout(this.context, String(text), layout, options);
  }
}

export function setScreen(screen: Screen | null): void {
  currentScreen = screen;
}

export function getScreen(): Screen {
  if (!currentScreen) {
    throw new Error("No active Screen has been configured.");
  }
  return currentScreen;
}

export const screen = new Proxy({} as Screen, {
  get(_target, property, receiver) {
    return Reflect.get(getScreen(), property, receiver);
  },
  set(_target, property, value, receiver) {
    return Reflect.set(getScreen(), property, value, receiver);
  },
});

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

export function layoutText(
  context: CanvasRenderingContext2D,
  text: string,
  pos: Point | undefined,
  options: TextOptions = {},
): TextLayout {
  const fontSize = requirePositiveNumber(options.fontsize ?? 24, "fontsize");
  const lineHeight = requirePositiveNumber(
    options.lineheight ?? fontSize * 1.2,
    "lineheight",
  );
  const fontFamily = options.fontname ?? "sans-serif";
  const font = `${fontSize}px ${fontFamily}`;
  const previousFont = context.font;
  context.font = font;
  const widthLimit =
    options.width ??
    (options.widthem === undefined ? undefined : options.widthem * fontSize);
  const lines = wrapLines(context, String(text), widthLimit);
  const textWidth = lines.reduce(
    (maximum, line) => Math.max(maximum, context.measureText(line).width),
    0,
  );
  context.font = previousFont;

  const boxWidth = widthLimit ?? textWidth;
  const boxHeight = Math.max(lineHeight, lines.length * lineHeight);
  const align = options.align ?? "left";
  if (!["left", "center", "right"].includes(align)) {
    throw new TypeError("align must be left, center, or right.");
  }
  const position = resolveTextPosition(pos, options, boxWidth, boxHeight);
  const anchorOffset = anchorOffsetFor(
    options.anchor ?? defaultTextAnchorFor(position.key),
    boxWidth,
    boxHeight,
  );
  const topLeft: Point =
    position.key === "pos"
      ? [
          position.point[0] - anchorOffset[0],
          position.point[1] - anchorOffset[1],
        ]
      : position.point;

  return {
    lines,
    font,
    fontSize,
    lineHeight,
    boxWidth,
    boxHeight,
    textWidth,
    align,
    topLeft,
    anchorOffset,
    alpha: clamp(options.alpha ?? 1, 0, 1),
  };
}

export function fitTextboxFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  rectLike: RectLike,
  options: TextboxOptions = {},
): { fontSize: number; lineHeight: number; lines: readonly string[] } {
  const rect = new Rect(rectLike);
  const maxSize = Math.floor(options.fontsize ?? Math.min(rect.height, 48));
  const minSize = Math.floor(options.min_fontsize ?? 4);
  for (let size = maxSize; size >= minSize; size -= 1) {
    const lineHeight = options.lineheight ?? size * 1.2;
    const layout = layoutText(context, text, rect.topleft, {
      ...options,
      fontsize: size,
      width: rect.width,
      lineheight: lineHeight,
    });
    if (
      layout.lines.length * lineHeight <= rect.height &&
      layout.lines.every(
        (line) => measureWithFont(context, line, layout.font) <= rect.width,
      )
    ) {
      return { fontSize: size, lineHeight, lines: layout.lines };
    }
  }
  const fontSize = Math.max(1, minSize);
  return {
    fontSize,
    lineHeight: options.lineheight ?? fontSize * 1.2,
    lines: wrapLines(context, text, rect.width),
  };
}

function renderTextLayout(
  context: CanvasRenderingContext2D,
  text: string,
  layout: TextLayout,
  options: TextOptions,
): void {
  void text;
  const angle = options.angle ?? 0;
  context.save();
  context.globalAlpha *= layout.alpha;
  context.translate(
    layout.topLeft[0] + layout.anchorOffset[0],
    layout.topLeft[1] + layout.anchorOffset[1],
  );
  if (angle !== 0) context.rotate((-angle * Math.PI) / 180);
  context.font = layout.font;
  context.textBaseline = "top";
  context.textAlign = layout.align;

  const originX = -layout.anchorOffset[0];
  const originY = -layout.anchorOffset[1];
  if (options.background !== undefined) {
    context.fillStyle = normalizeColor(options.background);
    context.fillRect(originX, originY, layout.boxWidth, layout.boxHeight);
  }

  const fillStyle =
    options.gcolor === undefined
      ? normalizeColor(options.color ?? "white")
      : textGradient(
          context,
          originY,
          layout.boxHeight,
          options.color ?? "white",
          options.gcolor,
        );
  const shadowOffset = shadowOffsetFor(options.shadow);
  const lineX = lineBaseX(originX, layout.boxWidth, layout.align);

  layout.lines.forEach((line, index) => {
    const y = originY + index * layout.lineHeight;
    if (shadowOffset) {
      context.fillStyle = normalizeColor(options.scolor ?? "black");
      context.fillText(line, lineX + shadowOffset[0], y + shadowOffset[1]);
    }
    if ((options.owidth ?? 0) > 0) {
      context.strokeStyle = normalizeColor(options.ocolor ?? "black");
      context.lineWidth = requirePositiveNumber(options.owidth, "owidth") * 2;
      context.strokeText(line, lineX, y);
    }
    context.fillStyle = fillStyle;
    context.fillText(line, lineX, y);
  });

  context.restore();
}

function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  widthLimit: number | undefined,
): string[] {
  const paragraphs = String(text).split(/\r?\n/);
  if (widthLimit === undefined) return paragraphs;
  const limit = requirePositiveNumber(widthLimit, "width");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0] ?? "";
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (context.measureText(candidate).width <= limit || line.length === 0) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function resolveTextPosition(
  pos: Point | undefined,
  options: TextOptions,
  width: number,
  height: number,
): { key: TextPositionKey; point: Point } {
  if (pos !== undefined && options.pos !== undefined) {
    throw new TypeError("draw.text accepts exactly one position source.");
  }
  const entries = textPositionKeys.filter((key) => {
    if (key === "pos") return options.pos !== undefined || pos !== undefined;
    return options[key] !== undefined;
  });
  if (entries.length > 1) {
    throw new TypeError("draw.text accepts exactly one position source.");
  }
  const key = entries[0] ?? "pos";
  const value = key === "pos" ? (options.pos ?? pos ?? [0, 0]) : options[key];
  const point = requirePoint(value, key);
  switch (key) {
    case "topright":
      return { key, point: [point[0] - width, point[1]] };
    case "bottomleft":
      return { key, point: [point[0], point[1] - height] };
    case "bottomright":
      return { key, point: [point[0] - width, point[1] - height] };
    case "midtop":
      return { key, point: [point[0] - width / 2, point[1]] };
    case "midleft":
      return { key, point: [point[0], point[1] - height / 2] };
    case "midright":
      return { key, point: [point[0] - width, point[1] - height / 2] };
    case "midbottom":
      return { key, point: [point[0] - width / 2, point[1] - height] };
    case "center":
      return { key, point: [point[0] - width / 2, point[1] - height / 2] };
    default:
      return { key, point };
  }
}

function defaultTextAnchorFor(positionKey: TextPositionKey): TextAnchor {
  return positionKey === "pos" ? "topleft" : positionKey;
}

function anchorOffsetFor(
  anchor: TextAnchor,
  width: number,
  height: number,
): Point {
  if (typeof anchor === "string") {
    switch (anchor) {
      case "topleft":
        return [0, 0];
      case "topright":
        return [width, 0];
      case "bottomleft":
        return [0, height];
      case "bottomright":
        return [width, height];
      case "midtop":
        return [width / 2, 0];
      case "midleft":
        return [0, height / 2];
      case "midright":
        return [width, height / 2];
      case "midbottom":
        return [width / 2, height];
      case "center":
        return [width / 2, height / 2];
      default:
        throw new TypeError(`Unknown text anchor: ${anchor}`);
    }
  }
  if (Array.isArray(anchor) && anchor.length === 2) {
    return [
      horizontalAnchorOffset(anchor[0], width),
      verticalAnchorOffset(anchor[1], height),
    ];
  }
  throw new TypeError("anchor must be a known string or two-item tuple.");
}

function horizontalAnchorOffset(
  value: number | HorizontalAnchor,
  width: number,
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === "left") return 0;
  if (value === "center" || value === "middle") return width / 2;
  if (value === "right") return width;
  throw new TypeError("invalid horizontal anchor.");
}

function verticalAnchorOffset(
  value: number | VerticalAnchor,
  height: number,
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === "top") return 0;
  if (value === "center" || value === "middle") return height / 2;
  if (value === "bottom") return height;
  throw new TypeError("invalid vertical anchor.");
}

function lineBaseX(
  originX: number,
  width: number,
  align: TextAlignOption,
): number {
  if (align === "center") return originX + width / 2;
  if (align === "right") return originX + width;
  return originX;
}

function shadowOffsetFor(shadow: number | Point | undefined): Point | null {
  if (shadow === undefined) return null;
  if (typeof shadow === "number" && Number.isFinite(shadow))
    return [shadow, shadow];
  return requirePoint(shadow, "shadow");
}

function verticalGradient(
  context: CanvasRenderingContext2D,
  height: number,
  color: Color,
  gcolor: Color,
): CanvasGradient {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, normalizeColor(color));
  gradient.addColorStop(1, normalizeColor(gcolor));
  return gradient;
}

function textGradient(
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

function measureWithFont(
  context: CanvasRenderingContext2D,
  text: string,
  font: string,
): number {
  const previousFont = context.font;
  context.font = font;
  const width = context.measureText(text).width;
  context.font = previousFont;
  return width;
}

function requirePoint(value: unknown, label: string): Point {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  ) {
    return [value[0], value[1]];
  }
  throw new TypeError(`${label} must be a two-number tuple.`);
}

function requirePositiveNumber(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  throw new TypeError(`${label} must be a positive finite number.`);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
