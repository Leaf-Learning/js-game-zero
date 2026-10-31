import {
  fonts,
  images,
  rectFromBlitTarget,
  type AssetLoader,
  type FontAsset,
  type SurfaceLike,
} from "./assets";
import { createActiveServiceProxy } from "./active-service";
import { normalizeColor, verticalGradient, type Color } from "./color";
import { guardSpellings } from "./friendly-names";
import { Rect, ZRect, type Point, type RectLike } from "./geometry";
import {
  describeRuntimeError,
  getActiveDiagnosticEmit,
} from "./runtime-diagnostics";
import {
  clamp,
  describeValue,
  didYouMean,
  horizontalAnchorOffset,
  rectPositionKeys,
  rejectUnknownOptions,
  requireFiniteNumber,
  requirePoint,
  verticalAnchorOffset,
} from "./util";

export { normalizeColor } from "./color";
export type { Color } from "./color";

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
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | "midTop"
  | "midLeft"
  | "midRight"
  | "midBottom"
  | "center"
  | readonly [number | HorizontalAnchor, number | VerticalAnchor];
export type HorizontalAnchor = "left" | "center" | "middle" | "right";
export type VerticalAnchor = "top" | "center" | "middle" | "bottom";

export type TextOptions = {
  readonly fontname?: string;
  readonly sysfontname?: string;
  readonly fontsize?: number;
  /** Same as `fontsize`. */
  readonly size?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly color?: Color;
  readonly background?: Color;
  readonly pos?: Point;
  readonly topLeft?: Point;
  readonly topRight?: Point;
  readonly bottomLeft?: Point;
  readonly bottomRight?: Point;
  readonly midTop?: Point;
  readonly midLeft?: Point;
  readonly midRight?: Point;
  readonly midBottom?: Point;
  readonly center?: Point;
  readonly top?: number;
  readonly left?: number;
  readonly bottom?: number;
  readonly right?: number;
  readonly centerX?: number;
  readonly centerY?: number;
  readonly width?: number;
  readonly widthem?: number;
  readonly lineheight?: number;
  readonly align?: TextAlignOption;
  readonly strip?: boolean;
  readonly owidth?: number;
  /** Same as `owidth`. */
  readonly outline?: number;
  readonly ocolor?: Color;
  /** Same as `ocolor`. */
  readonly outlineColor?: Color;
  readonly shadow?: number | Point;
  readonly scolor?: Color;
  /** Same as `scolor`. */
  readonly shadowColor?: Color;
  readonly gcolor?: Color;
  /** Same as `gcolor`. */
  readonly gradientColor?: Color;
  readonly alpha?: number;
  readonly anchor?: TextAnchor;
  readonly angle?: number;
};

export type TextboxOptions = Omit<
  TextOptions,
  | TextPositionKey
  | "width"
  | "widthem"
  | "top"
  | "left"
  | "bottom"
  | "right"
  | "centerX"
  | "centerY"
> & {
  readonly minFontsize?: number;
  /** Same as `minFontsize`. */
  readonly minSize?: number;
};

/**
 * `screen.draw.text` takes its options either third, after a position, or
 * second, in place of one: `text("Hi", [10, 10], { size: 20 })` and
 * `text("Hi", { center: [160, 90], size: 20 })` both work.
 */
export type DrawText = {
  (text: string, options?: TextOptions): void;
  (text: string, pos: Point | undefined, options?: TextOptions): void;
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
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | "midTop"
  | "midLeft"
  | "midRight"
  | "midBottom"
  | "center";

const textPositionKeys = ["pos", ...rectPositionKeys] as const;

/**
 * Readable names for Pygame Zero's terse text options, and for textbox's
 * `minFontsize`, which Pygame Zero doesn't have. Either name works; giving
 * both for the same option is an error.
 */
const textOptionAliases = {
  size: "fontsize",
  minSize: "minFontsize",
  outline: "owidth",
  outlineColor: "ocolor",
  shadowColor: "scolor",
  gradientColor: "gcolor",
} as const;

const textboxOptionKeys = new Set<string>([
  ...Object.keys(textOptionAliases),
  "fontname",
  "sysfontname",
  "fontsize",
  "minFontsize",
  "bold",
  "italic",
  "underline",
  "color",
  "background",
  "lineheight",
  "align",
  "strip",
  "owidth",
  "ocolor",
  "shadow",
  "scolor",
  "gcolor",
  "alpha",
  "anchor",
  "angle",
]);

/** The options that place draw.text's text. A textbox's rect places its text. */
const textPlacingOptionKeys = new Set<string>([
  ...textPositionKeys,
  "top",
  "left",
  "bottom",
  "right",
  "centerX",
  "centerY",
]);

const textOptionKeys = new Set<string>([
  ...[...textboxOptionKeys].filter(
    (key) => key !== "minFontsize" && key !== "minSize",
  ),
  ...textPlacingOptionKeys,
  "width",
  "widthem",
]);

/**
 * How each short form (`screen.circle(x, y, radius)`) is called, so a wrong
 * call can say what it takes. Beginners meet coordinates before lists, so a
 * list where a number belongs points to the `screen.draw` method that takes
 * lists, and an extra argument (usually an outline width) points to the
 * outline method, since the short forms only fill.
 */
type ShortForm = {
  readonly call: string;
  /** The arguments that must be numbers, in order. */
  readonly numbers: readonly string[];
  /** The most arguments it takes. */
  readonly arity: number;
  readonly lists: string;
  readonly extra: string;
};

const shortForms = {
  circle: {
    call: "screen.circle(x, y, radius, color)",
    numbers: ["x", "y", "radius"],
    arity: 4,
    lists:
      'screen.circle takes x, y as two numbers, like screen.circle(200, 150, 25, "gold"). For an [x, y] list, use screen.draw.filledCircle([x, y], radius, color).',
    extra:
      "screen.circle always fills, so it has no outline width. For an outline, use screen.draw.circle([x, y], radius, color, width).",
  },
  rect: {
    call: "screen.rect(x, y, width, height, color)",
    numbers: ["x", "y", "width", "height"],
    arity: 5,
    lists:
      'screen.rect takes x, y, width, height as four numbers, like screen.rect(40, 40, 120, 60, "orange"). For a list or a Rect, use screen.draw.filledRect([x, y, width, height], color).',
    extra:
      "screen.rect always fills, so it has no outline width. For an outline, use screen.draw.rect([x, y, width, height], color, width).",
  },
  triangle: {
    call: "screen.triangle(x1, y1, x2, y2, x3, y3, color)",
    numbers: ["x1", "y1", "x2", "y2", "x3", "y3"],
    arity: 7,
    lists:
      'screen.triangle takes each corner as two numbers, like screen.triangle(160, 40, 120, 120, 200, 120, "lime"). For [x, y] lists, use screen.draw.filledPolygon([[x1, y1], [x2, y2], [x3, y3]], color).',
    extra:
      "screen.triangle always fills, so it has no outline width. For an outline, use screen.draw.polygon([[x1, y1], [x2, y2], [x3, y3]], color, width).",
  },
  line: {
    call: "screen.line(x1, y1, x2, y2, color, width)",
    numbers: ["x1", "y1", "x2", "y2"],
    arity: 6,
    lists:
      'screen.line takes each end as two numbers, like screen.line(20, 20, 200, 120, "white", 3). For [x, y] lists, use screen.draw.line([x1, y1], [x2, y2], color, width).',
    extra:
      "screen.line takes at most six values: screen.line(x1, y1, x2, y2, color, width).",
  },
} as const satisfies Record<string, ShortForm>;

let currentScreen: Screen | null = null;

/**
 * A sized screen's logical size, its density, and the canvas size that
 * density gave it. A Screen nobody sized follows its canvas at density 1.
 */
type ScreenSize = {
  readonly width: number;
  readonly height: number;
  readonly density: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
};

const screenSizes = new WeakMap<Screen, ScreenSize>();

/** Marks a canvas whose CSS size the density rule sets. */
const densityAttribute = "data-jgz-density";

/**
 * A denser canvas would show at its pixel size, so this rule gives it its
 * logical width instead; its height follows the canvas's aspect ratio.
 * `:where()` has no specificity, so any size the page gives the canvas wins.
 */
const densityRule = `:where(canvas[${densityAttribute}]) { width: var(--jgz-width); }`;

type SizableCanvas = CanvasLike & {
  width: number;
  height: number;
  readonly ownerDocument?: Document;
  readonly style?: CSSStyleDeclaration;
  getRootNode?: () => Node;
  setAttribute?: (name: string, value: string) => void;
  removeAttribute?: (name: string) => void;
};

/**
 * Sizes the screen to `width` × `height` logical pixels with `density`
 * canvas pixels each, and scales the context so every drawing call keeps
 * working in logical pixels. A density change keeps what's on the canvas,
 * rescaled; a new size starts blank, as setting a canvas's size does.
 */
export function resizeScreen(
  screen: Screen,
  width: number,
  height: number,
  density = 1,
): void {
  const canvas = screen.canvas as SizableCanvas;
  const previous = screenSizes.get(screen);
  const canvasWidth = Math.max(1, Math.round(width * density));
  const canvasHeight = Math.max(1, Math.round(height * density));
  const kept =
    previous?.width === width &&
    previous.height === height &&
    (canvas.width !== canvasWidth || canvas.height !== canvasHeight)
      ? copyCanvas(canvas)
      : null;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const size = { width, height, density, canvasWidth, canvasHeight };
  screenSizes.set(screen, size);
  applyDensityTransform(screen.context, size);
  applyDensityCss(canvas, size);
  if (kept) screen.context.drawImage(kept, 0, 0, width, height);
}

/**
 * Restores the density scale if something reset the canvas since the last
 * frame. Code outside the runtime that sets `canvas.width`/`height` means
 * a logical size, so the screen adopts it at the same density.
 */
export function syncScreen(screen: Screen): void {
  const size = screenSizes.get(screen);
  if (!size) return;
  const { canvas, context } = screen;
  if (
    canvas.width !== size.canvasWidth ||
    canvas.height !== size.canvasHeight
  ) {
    resizeScreen(
      screen,
      canvas.width === size.canvasWidth ? size.width : canvas.width,
      canvas.height === size.canvasHeight ? size.height : canvas.height,
      size.density,
    );
    return;
  }
  if (!isScaled(size) || typeof context.getTransform !== "function") return;
  const matrix = context.getTransform();
  if (matrix.isIdentity) applyDensityTransform(context, size);
}

function isScaled(size: ScreenSize): boolean {
  return size.canvasWidth !== size.width || size.canvasHeight !== size.height;
}

/** Scales by each axis's exact ratio, so the logical screen fills the canvas. */
function applyDensityTransform(
  context: CanvasRenderingContext2D,
  size: ScreenSize,
): void {
  if (!isScaled(size) || typeof context.setTransform !== "function") return;
  context.setTransform(
    size.canvasWidth / size.width,
    0,
    0,
    size.canvasHeight / size.height,
    0,
    0,
  );
}

function applyDensityCss(canvas: SizableCanvas, size: ScreenSize): void {
  const { style, ownerDocument: doc } = canvas;
  if (!style || !doc || typeof canvas.setAttribute !== "function") return;
  if (!isScaled(size)) {
    canvas.removeAttribute?.(densityAttribute);
    style.removeProperty("--jgz-width");
    return;
  }
  const root = canvas.getRootNode?.();
  const parent =
    root && root.nodeType === 11 ? (root as ParentNode) : (doc.head ?? null);
  if (parent && !parent.querySelector(`style[${densityAttribute}]`)) {
    const rule = doc.createElement("style");
    rule.setAttribute(densityAttribute, "");
    rule.textContent = densityRule;
    // First, so the page's own rules come later and win ties.
    parent.prepend(rule);
  }
  canvas.setAttribute(densityAttribute, "");
  style.setProperty("--jgz-width", `${size.width}px`);
}

function copyCanvas(canvas: SizableCanvas): CanvasImageSource | null {
  if (canvas.width === 0 || canvas.height === 0) return null;
  try {
    const copy =
      typeof OffscreenCanvas === "function"
        ? new OffscreenCanvas(canvas.width, canvas.height)
        : canvas.ownerDocument?.createElement("canvas");
    if (!copy) return null;
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext("2d") as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) return null;
    context.drawImage(canvas as unknown as CanvasImageSource, 0, 0);
    return copy;
  } catch {
    return null;
  }
}

/** A value a drawn thing reports, as JSON. */
type DrawnValue = string | number | boolean | readonly number[];
/**
 * One thing a frame drew, as a host reads it through the inspector's
 * `$drawn`: its kind (`fill`, `image`, `actor`, `circle`, `rect`, `polygon`,
 * `line`, `text`, `clear`), and what it is and where, as the game gave them.
 */
export type DrawnThing = {
  readonly kind: string;
  readonly [key: string]: DrawnValue;
};
/** A frame's things drawn are kept to this many. */
const MAX_DRAWN = 200;
const drawnThings = new WeakMap<Screen, DrawnThing[]>();

/** Starts recording what `screen` draws, afresh: the runtime calls it before each `draw()`. */
export function beginDrawn(screen: Screen): void {
  drawnThings.set(screen, []);
}

/** What `screen`'s last `draw()` drew, in order; empty before its first. */
export function drawnOn(screen: Screen): readonly DrawnThing[] {
  return drawnThings.get(screen) ?? [];
}

/** Records one thing drawn, when the screen is recording. */
export function recordDrawn(screen: Screen, thing: DrawnThing): void {
  const list = drawnThings.get(screen);
  if (list && list.length < MAX_DRAWN) list.push(thing);
}

/** The images each screen has reported it couldn't load. */
const reportedImages = new WeakMap<Screen, Set<string>>();

const colorOf = (color: Color): DrawnValue =>
  typeof color === "string" ? color : [...color];

export class Screen {
  readonly canvas: CanvasLike;
  readonly context: CanvasRenderingContext2D;
  readonly imageLoader: Pick<AssetLoader<SurfaceLike>, "load" | "get">;

  readonly draw = {
    line: (start: Point, end: Point, color: Color, width = 1): void =>
      this.drawLine(start, end, color, width),
    circle: (pos: Point, radius: number, color: Color, width = 1): void =>
      this.drawCircle(pos, radius, color, width),
    filledCircle: (pos: Point, radius: number, color: Color): void =>
      this.drawCircle(pos, radius, color, 0, true),
    polygon: (points: Point[], color: Color, width = 1): void =>
      this.drawPolygon(points, color, width),
    filledPolygon: (points: Point[], color: Color): void =>
      this.drawPolygon(points, color, 0, true),
    rect: (rect: RectLike, color: Color, width = 1): void =>
      this.drawRect(rect, color, width),
    filledRect: (rect: RectLike, color: Color): void =>
      this.drawRect(rect, color, 0, true),
    text: ((
      text: string,
      posOrOptions?: Point | TextOptions,
      options?: TextOptions,
    ): void => this.drawText(text, posOrOptions, options)) as DrawText,
    textbox: (
      text: string,
      rect: RectLike,
      options: TextboxOptions = {},
    ): void => this.drawTextbox(text, rect, options),
    /** Same as `screen.blit`: draws an image with its top-left at `pos`. */
    image: (
      image: string | SurfaceLike,
      pos: Point | RectLike,
    ): Promise<void> | void => this.blit(image, pos),
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
    guardSpellings(this.draw, "screen.draw");
  }

  /** The screen's width in logical pixels: the game's `WIDTH`. */
  get width(): number {
    return screenSizes.get(this)?.width ?? this.canvas.width;
  }

  /** The screen's height in logical pixels: the game's `HEIGHT`. */
  get height(): number {
    return screenSizes.get(this)?.height ?? this.canvas.height;
  }

  /** Canvas pixels per logical pixel along each side. */
  get density(): number {
    return screenSizes.get(this)?.density ?? 1;
  }

  bounds(): ZRect {
    return new ZRect(0, 0, this.width, this.height);
  }

  clear(): void {
    recordDrawn(this, { kind: "clear" });
    withSavedCanvasState(this.context, () => {
      this.context.globalAlpha = 1;
      this.context.fillStyle = "black";
      this.context.fillRect(0, 0, this.width, this.height);
    });
  }

  fill(color: Color, gcolor?: Color): void {
    recordDrawn(this, {
      kind: "fill",
      color: colorOf(color),
      ...(gcolor === undefined ? {} : { to: colorOf(gcolor) }),
    });
    const style =
      gcolor === undefined
        ? normalizeColor(color)
        : verticalGradient(this.context, 0, this.height, color, gcolor);
    this.context.fillStyle = style;
    this.context.fillRect(0, 0, this.width, this.height);
  }

  blit(
    image: string | SurfaceLike,
    pos: Point | RectLike,
  ): Promise<void> | void {
    const at = rectFromBlitTarget(pos);
    const surface =
      typeof image === "string" ? this.imageLoader.get(image) : image;
    if (!surface) {
      // Not loaded yet, so this frame draws nothing here: drawing it once it
      // arrived would paint over whatever the frame drew after it. The
      // runtime holds the frames that follow until it has loaded.
      const name = image as string;
      const loaded = this.imageLoader.load(name).then(() => undefined);
      // A draw() ignores this promise, so a failure is reported to the run
      // instead, as an Actor's image is: once, though it's blitted each frame.
      const reportDiagnostic = getActiveDiagnosticEmit();
      void loaded.catch((error: unknown) => {
        const reported = reportedImages.get(this) ?? new Set<string>();
        if (!reportDiagnostic || reported.has(name)) return;
        reportedImages.set(this, reported.add(name));
        reportDiagnostic({
          code: "runtime-error",
          severity: "warning",
          phase: "asset",
          recoverable: true,
          message: `Failed to load image "${name}": ${describeRuntimeError(error)}`,
        });
      });
      return loaded;
    }
    recordDrawn(this, {
      kind: "image",
      image: typeof image === "string" ? image : "",
      x: Array.isArray(at) ? at[0] : at.left,
      y: Array.isArray(at) ? at[1] : at.top,
    });
    this.drawSurface(surface, pos);
  }

  /**
   * The short forms take positions as separate numbers rather than `[x, y]`
   * lists, fill their shapes, and default to white, so
   * `screen.circle(200, 150, 25, "gold")` fits a phone-width line where
   * `screen.draw.filledCircle([200, 150], 25, "gold")` doesn't. The
   * outline versions stay under `screen.draw`.
   */
  circle(x: number, y: number, radius: number, color: Color = "white"): void {
    requireShortForm(shortForms.circle, arguments);
    this.drawCircle([x, y], radius, color, 0, true);
  }

  /** A filled rectangle whose top-left corner is at `x, y`. */
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: Color = "white",
  ): void {
    requireShortForm(shortForms.rect, arguments);
    this.drawRect([x, y, width, height], color, 0, true);
  }

  triangle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    color: Color = "white",
  ): void {
    requireShortForm(shortForms.triangle, arguments);
    this.drawPolygon(
      [
        [x1, y1],
        [x2, y2],
        [x3, y3],
      ],
      color,
      0,
      true,
    );
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: Color = "white",
    width = 1,
  ): void {
    requireShortForm(shortForms.line, arguments);
    this.drawLine([x1, y1], [x2, y2], color, width);
  }

  /**
   * Text whose top-left corner is at `x, y`, `size` pixels tall, so a score
   * fits one short line: `screen.text("Score: " + score, 20, 30)`. A number
   * is drawn as it reads. Placing by its center or any other option stays
   * under `screen.draw.text`.
   */
  text(
    text: string | number,
    x: number,
    y: number,
    color: Color = "white",
    size = 24,
  ): void {
    requireTextShortForm(arguments);
    this.drawText(String(text), [x, y], { color, fontsize: size });
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
    recordDrawn(this, {
      kind: "line",
      x: startX,
      y: startY,
      x2: endX,
      y2: endY,
      color: colorOf(color),
    });
    withSavedCanvasState(this.context, () => {
      this.context.strokeStyle = normalizeColor(color);
      this.context.lineWidth = requirePositiveNumber(width, "width");
      this.context.beginPath();
      this.context.moveTo(startX, startY);
      this.context.lineTo(endX, endY);
      this.context.stroke();
    });
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
    recordDrawn(this, {
      kind: "circle",
      x,
      y,
      radius: parsedRadius,
      color: colorOf(color),
      filled,
    });
    withSavedCanvasState(this.context, () => {
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
    });
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
    recordDrawn(this, {
      kind: "polygon",
      x: first[0],
      y: first[1],
      points: parsed.length,
      color: colorOf(color),
      filled,
    });
    withSavedCanvasState(this.context, () => {
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
    });
  }

  private drawRect(
    rectLike: RectLike,
    color: Color,
    width: number,
    filled = false,
  ): void {
    const rect = new Rect(rectLike);
    recordDrawn(this, {
      kind: "rect",
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      color: colorOf(color),
      filled,
    });
    withSavedCanvasState(this.context, () => {
      if (filled) {
        this.context.fillStyle = normalizeColor(color);
        this.context.fillRect(rect.left, rect.top, rect.width, rect.height);
      } else {
        this.context.strokeStyle = normalizeColor(color);
        this.context.lineWidth = requirePositiveNumber(width, "width");
        this.context.strokeRect(rect.left, rect.top, rect.width, rect.height);
      }
    });
  }

  private drawText(
    text: string,
    posOrOptions: Point | TextOptions | undefined,
    maybeOptions: TextOptions | undefined,
  ): void {
    let pos: Point | undefined;
    let given: TextOptions;
    if (isPlainOptions(posOrOptions)) {
      if (maybeOptions !== undefined) {
        throw new TypeError(
          'screen.draw.text takes its options once: either second, as in text("Hi", { center: [x, y] }), or third, after a position.',
        );
      }
      given = posOrOptions;
    } else {
      pos = posOrOptions;
      given = maybeOptions ?? {};
    }
    rejectUnknownOptions(given, textOptionKeys, "screen.draw.text");
    const options = canonicalTextOptions(given, "screen.draw.text");
    const layout = layoutText(this.context, text, pos, options);
    // Where its box is, however it was placed (a point, center, an anchor).
    recordDrawn(this, {
      kind: "text",
      text: String(text),
      x: layout.topLeft[0],
      y: layout.topLeft[1],
      width: layout.boxWidth,
      height: layout.boxHeight,
      ...(options.color === undefined ? {} : { color: colorOf(options.color) }),
    });
    renderTextLayout(this.context, layout, options);
  }

  private drawTextbox(
    text: string,
    rectLike: RectLike,
    givenOptions: TextboxOptions,
  ): void {
    const placing = Object.keys(givenOptions).find((key) =>
      textPlacingOptionKeys.has(key),
    );
    if (placing !== undefined) {
      throw new TypeError(
        `screen.draw.textbox places its text with its rect, so it has no option called ${placing}. Move the rect to move the text, and use anchor (like anchor: "topLeft") and align to place the text inside it.`,
      );
    }
    rejectUnknownOptions(
      givenOptions,
      textboxOptionKeys,
      "screen.draw.textbox",
    );
    const options = canonicalTextOptions(givenOptions, "screen.draw.textbox");
    const rect = new Rect(rectLike);
    recordDrawn(this, {
      kind: "text",
      text: String(text),
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      ...(options.color === undefined ? {} : { color: colorOf(options.color) }),
    });
    const fit = fitTextboxFontSize(this.context, text, rect, options);
    // pgzero's drawbox anchors the text on the rect at the anchor fraction
    // (default 0.5, 0.5 -> centered both ways): the position point is
    // rect.topLeft + anchor * rect.size, and the same anchor places the
    // text block relative to that point. So the default centers the text
    // in the rect, while e.g. anchor "topLeft" lays out from rect.topLeft.
    // Its lines line up the same way across the rect unless given `align`.
    const anchor = options.anchor ?? "center";
    const rectAnchorOffset = anchorOffsetFor(anchor, rect.width, rect.height);
    const point: Point = [
      rect.left + rectAnchorOffset[0],
      rect.top + rectAnchorOffset[1],
    ];
    const layout = layoutText(this.context, text, point, {
      ...options,
      fontsize: fit.fontSize,
      width: rect.width,
      lineheight: fit.lineHeight,
      anchor,
      align: options.align ?? alignForAnchor(anchor),
    });
    renderTextLayout(this.context, layout, options);
  }
}

/** A `{ ... }` literal, as opposed to a position (an array, or a Rect). */
function isPlainOptions(value: unknown): value is TextOptions {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

/** Rewrites readable option names (`size`) to the names layout reads (`fontsize`). */
function canonicalTextOptions<T extends TextOptions & TextboxOptions>(
  options: T,
  label: string,
): T {
  let result: Record<string, unknown> | null = null;
  for (const [alias, canonical] of Object.entries(textOptionAliases)) {
    if (!(alias in options)) continue;
    if (canonical in options) {
      throw new TypeError(
        `${label} got both ${alias} and ${canonical}; they mean the same thing, so give just one.`,
      );
    }
    result ??= { ...options };
    result[canonical] = result[alias];
    delete result[alias];
  }
  return (result ?? options) as T;
}

export function setScreen(screen: Screen | null): Screen | null {
  const previous = currentScreen;
  currentScreen = screen;
  return previous;
}

export function getScreen(): Screen {
  if (!currentScreen) {
    throw new Error("No active Screen has been configured.");
  }
  return currentScreen;
}

export const screen = createActiveServiceProxy(getScreen);

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
  const font = buildFontString(fontSize, options);
  const widthLimit =
    options.width ??
    (options.widthem === undefined ? undefined : options.widthem * fontSize);
  const strip = options.strip ?? true;
  const { lines, textWidth } = withTemporaryFont(context, font, () => {
    const lines = wrapLines(context, String(text), widthLimit, strip);
    return {
      lines,
      textWidth: lines.reduce(
        (maximum, line) => Math.max(maximum, context.measureText(line).width),
        0,
      ),
    };
  });

  const boxWidth = widthLimit ?? textWidth;
  const boxHeight = Math.max(lineHeight, lines.length * lineHeight);
  const align = options.align ?? "left";
  if (!["left", "center", "right"].includes(align)) {
    throw new TypeError("align must be left, center, or right.");
  }
  const position = resolveTextPosition(pos, options, boxWidth, boxHeight);
  const anchorOffset = anchorOffsetFor(
    options.anchor ??
      position.impliedAnchor ??
      defaultTextAnchorFor(position.key),
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
  const minSize = Math.floor(options.minFontsize ?? 4);
  for (let size = maxSize; size >= minSize; size -= 1) {
    const lineHeight = options.lineheight ?? size * 1.2;
    const layout = layoutText(context, text, rect.topLeft, {
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
    lines: wrapLines(context, text, rect.width, options.strip ?? true),
  };
}

function renderTextLayout(
  context: CanvasRenderingContext2D,
  layout: TextLayout,
  options: TextOptions,
): void {
  const angle = options.angle ?? 0;
  withSavedCanvasState(context, () => {
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
        : verticalGradient(
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
      if (options.underline) {
        const lineWidth = context.measureText(line).width;
        const [start, end] = lineExtentX(lineX, lineWidth, layout.align);
        const thickness = Math.max(1, layout.fontSize / 15);
        const underlineY = y + layout.fontSize * 0.9;
        context.fillStyle = fillStyle;
        context.fillRect(
          start,
          underlineY - thickness / 2,
          end - start,
          thickness,
        );
      }
    });
  });
}

/**
 * Ports `wrap()` from Christopher Night's pygame-text (ptext.py, CC0 1.0,
 * public domain), which Pygame Zero bundles: splits on newlines (tabs are
 * expanded to four spaces first, matching upstream), then greedily wraps
 * each line by measured width, preserving leading indentation and
 * hard-breaking only when a single word alone exceeds the width.
 */
function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  widthLimit: number | undefined,
  strip: boolean,
): string[] {
  const normalized = String(text).replace(/\t/g, "    ").replace(/\r\n/g, "\n");
  const paragraphs = normalized.split("\n");
  if (widthLimit === undefined) {
    return paragraphs.map((paragraph) =>
      strip ? rstripSpaces(paragraph) : paragraph,
    );
  }
  const limit = requirePositiveNumber(widthLimit, "width");
  const measure = (candidate: string): number =>
    context.measureText(candidate).width;
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    lines.push(...wrapParagraph(measure, paragraph, limit, strip));
  }
  return lines;
}

/** Wraps a single (newline-free) line of text, matching ptext.py's `wrap`. */
function wrapParagraph(
  measure: (candidate: string) => number,
  rawText: string,
  width: number,
  strip: boolean,
): string[] {
  let text = strip ? rstripSpaces(rawText) : rawText;
  const lines: string[] = [];
  if (!text) {
    lines.push("");
    return lines;
  }

  // Preserve leading spaces: `a` starts as the rightmost known-legal split
  // point, i.e. the first space at or after the leading indentation.
  const leadingSpaceCount = text.length - lstripSpaces(text).length;
  let a = firstIndexOfSpaceOr(text, leadingSpaceCount, text.length);
  let line = text.slice(0, a);

  while (a + 1 < text.length) {
    let b: number;
    let bline: string;
    if (text.indexOf(" ", a + 1) === -1) {
      b = text.length;
      bline = text;
    } else if (strip) {
      // Lines may only be split at a space that immediately follows a
      // non-space character; skip past runs of consecutive spaces.
      b = text.indexOf(" ", a + 1);
      while (b > 0 && text[b - 1] === " ") {
        const next = text.indexOf(" ", b + 1);
        if (next === -1) {
          b = text.length;
          break;
        }
        b = next;
      }
      bline = text.slice(0, b);
    } else {
      b = text[a] === " " ? a + 1 : text.indexOf(" ", a + 1);
      bline = text.slice(0, b);
    }

    if (measure(bline) <= width) {
      a = b;
      line = bline;
    } else {
      // The candidate line no longer fits: commit what fit so far and
      // restart from the remainder. If a single word alone exceeds the
      // width, it is emitted on its own (overflowing) line rather than
      // being merged with its neighbors.
      lines.push(line);
      text = strip ? lstripSpaces(text.slice(a)) : text.slice(a);
      a = firstIndexOfSpaceOr(text, 1, text.length);
      line = text.slice(0, a);
    }
  }
  if (text) lines.push(line);
  return lines;
}

function firstIndexOfSpaceOr(
  text: string,
  from: number,
  fallback: number,
): number {
  const index = text.indexOf(" ", from);
  return index === -1 ? fallback : index;
}

function lstripSpaces(text: string): string {
  let index = 0;
  while (index < text.length && text[index] === " ") index += 1;
  return text.slice(index);
}

function rstripSpaces(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === " ") end -= 1;
  return text.slice(0, end);
}

const horizontalScalarKeys = ["left", "centerX", "right"] as const;
const verticalScalarKeys = ["top", "centerY", "bottom"] as const;
type HorizontalScalarKey = (typeof horizontalScalarKeys)[number];
type VerticalScalarKey = (typeof verticalScalarKeys)[number];

// Named (not numeric!) anchor keywords: `anchorOffsetFor`/`horizontalAnchorOffset`
// treat a *number* anchor component as a literal pixel offset, not a
// fraction of the box size, so the scalar-position fractions below must be
// expressed as the string keywords to be scaled against boxWidth/boxHeight.
const horizontalScalarAnchor: Record<HorizontalScalarKey, HorizontalAnchor> = {
  left: "left",
  centerX: "center",
  right: "right",
};
const verticalScalarAnchor: Record<VerticalScalarKey, VerticalAnchor> = {
  top: "top",
  centerY: "center",
  bottom: "bottom",
};

function resolveTextPosition(
  pos: Point | undefined,
  options: TextOptions,
  width: number,
  height: number,
): {
  key: TextPositionKey;
  point: Point;
  impliedAnchor?: readonly [HorizontalAnchor, VerticalAnchor];
} {
  if (pos !== undefined && options.pos !== undefined) {
    throw new TypeError("draw.text accepts exactly one position source.");
  }
  const compoundEntries = textPositionKeys.filter((key) => {
    if (key === "pos") return options.pos !== undefined || pos !== undefined;
    return options[key] !== undefined;
  });
  // The named compound keys (topLeft, center, ...) are mutually exclusive
  // with the scalar keys below, but plain `pos` is not: it is a legitimate
  // fallback for whichever axis a scalar doesn't cover.
  const namedCompoundEntries = compoundEntries.filter((key) => key !== "pos");
  const horizontalScalars = horizontalScalarKeys.filter(
    (key) => options[key] !== undefined,
  );
  const verticalScalars = verticalScalarKeys.filter(
    (key) => options[key] !== undefined,
  );

  // Scalar positioning kwargs (pgzero/ptext): `top`, `left`, `bottom`,
  // `right`, `centerX`, `centerY` combine per-axis, e.g.
  // `screen.draw.text("hi", right=780, top=10)`. Each scalar sets both the
  // coordinate and that axis's anchor fraction (left/top -> 0,
  // centerX/centerY -> 0.5, right/bottom -> 1); an axis without a scalar
  // falls back to the corresponding component of `pos`.
  if (horizontalScalars.length > 0 || verticalScalars.length > 0) {
    if (namedCompoundEntries.length > 0) {
      throw new TypeError("draw.text accepts exactly one position source.");
    }
    if (horizontalScalars.length > 1) {
      throw new TypeError(
        "draw.text accepts only one of left, centerX, or right.",
      );
    }
    if (verticalScalars.length > 1) {
      throw new TypeError(
        "draw.text accepts only one of top, centerY, or bottom.",
      );
    }
    const fallback = pos ?? options.pos;
    const horizontalKey = horizontalScalars[0];
    const verticalKey = verticalScalars[0];
    const x =
      horizontalKey === undefined
        ? fallback?.[0]
        : requireFiniteNumber(options[horizontalKey], horizontalKey);
    const y =
      verticalKey === undefined
        ? fallback?.[1]
        : requireFiniteNumber(options[verticalKey], verticalKey);
    if (x === undefined) {
      throw new TypeError("Unable to determine horizontal position.");
    }
    if (y === undefined) {
      throw new TypeError("Unable to determine vertical position.");
    }
    const hanchor: HorizontalAnchor =
      horizontalKey === undefined
        ? "left"
        : horizontalScalarAnchor[horizontalKey];
    const vanchor: VerticalAnchor =
      verticalKey === undefined ? "top" : verticalScalarAnchor[verticalKey];
    return { key: "pos", point: [x, y], impliedAnchor: [hanchor, vanchor] };
  }

  if (compoundEntries.length > 1) {
    throw new TypeError("draw.text accepts exactly one position source.");
  }
  const key = compoundEntries[0] ?? "pos";
  const value = key === "pos" ? (options.pos ?? pos ?? [0, 0]) : options[key];
  const point = requirePoint(value, key);
  switch (key) {
    case "topRight":
      return { key, point: [point[0] - width, point[1]] };
    case "bottomLeft":
      return { key, point: [point[0], point[1] - height] };
    case "bottomRight":
      return { key, point: [point[0] - width, point[1] - height] };
    case "midTop":
      return { key, point: [point[0] - width / 2, point[1]] };
    case "midLeft":
      return { key, point: [point[0], point[1] - height / 2] };
    case "midRight":
      return { key, point: [point[0] - width, point[1] - height / 2] };
    case "midBottom":
      return { key, point: [point[0] - width / 2, point[1] - height] };
    case "center":
      return { key, point: [point[0] - width / 2, point[1] - height / 2] };
    default:
      return { key, point };
  }
}

function defaultTextAnchorFor(positionKey: TextPositionKey): TextAnchor {
  return positionKey === "pos" ? "topLeft" : positionKey;
}

function anchorOffsetFor(
  anchor: TextAnchor,
  width: number,
  height: number,
): Point {
  if (typeof anchor === "string") {
    switch (anchor) {
      case "topLeft":
        return [0, 0];
      case "topRight":
        return [width, 0];
      case "bottomLeft":
        return [0, height];
      case "bottomRight":
        return [width, height];
      case "midTop":
        return [width / 2, 0];
      case "midLeft":
        return [0, height / 2];
      case "midRight":
        return [width, height / 2];
      case "midBottom":
        return [width / 2, height];
      case "center":
        return [width / 2, height / 2];
      default:
        throw new TypeError(
          `Unknown text anchor: ${anchor}.${didYouMean(anchor, rectPositionKeys)}`,
        );
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

/**
 * The `align` matching an anchor's horizontal part, as Pygame Zero's drawbox
 * defaults it: `"topLeft"` is `"left"`, `"center"` and `"midTop"` are
 * `"center"`. A pixel offset counts from the left, so it's `"left"`.
 */
function alignForAnchor(anchor: TextAnchor): TextAlignOption {
  if (typeof anchor !== "string" && typeof anchor[0] === "number") {
    return "left";
  }
  const [x] = anchorOffsetFor(anchor, 2, 0);
  return x === 0 ? "left" : x === 1 ? "center" : "right";
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

/**
 * Converts the `fillText`/`strokeText` anchor x-coordinate (which is
 * relative to `context.textAlign`) plus a measured line width into the
 * `[start, end]` horizontal extent actually covered by the rendered text,
 * so an underline can be drawn under exactly that span.
 */
function lineExtentX(
  lineX: number,
  lineWidth: number,
  align: TextAlignOption,
): [number, number] {
  if (align === "center") return [lineX - lineWidth / 2, lineX + lineWidth / 2];
  if (align === "right") return [lineX - lineWidth, lineX];
  return [lineX, lineX + lineWidth];
}

const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
]);

/** Quotes a font-family name for use in a canvas font string, unless it's a generic CSS keyword. */
function cssFontFamily(name: string): string {
  if (GENERIC_FONT_FAMILIES.has(name)) return name;
  return `"${name.replace(/"/g, '\\"')}"`;
}

/**
 * Resolves the font-family portion of a canvas font string, mirroring
 * ptext.py's `getfont`: `sysfontname` (a literal system CSS family) takes
 * precedence and cannot be combined with `fontname`. `fontname` first
 * checks the `fonts` asset loader for an already-loaded custom font (e.g.
 * from `fonts/myfont.ttf`); if it isn't loaded yet, a load is kicked off
 * (so the runtime's preload gate can hold frames until it settles) and,
 * for this call, `fontname` is used verbatim as a CSS family so a
 * loaded-but-not-yet-fetched font degrades gracefully rather than crashing.
 * `fontname` values that aren't even valid asset names (e.g. a literal CSS
 * family like "Comic Sans MS") also fall back to being used as-is, since
 * the asset loader only accepts lowercase, underscore-safe identifiers.
 */
function resolveFontFamily(options: TextOptions): string {
  if (options.fontname !== undefined && options.sysfontname !== undefined) {
    throw new TypeError(
      "draw.text accepts only one of fontname or sysfontname.",
    );
  }
  if (options.sysfontname !== undefined) {
    return cssFontFamily(options.sysfontname);
  }
  if (options.fontname !== undefined) {
    const loaded = tryGetLoadedFont(options.fontname);
    if (loaded) return cssFontFamily(loaded.family);
    tryStartLoadingFont(options.fontname);
    return cssFontFamily(options.fontname);
  }
  return "sans-serif";
}

function tryGetLoadedFont(name: string): FontAsset | undefined {
  try {
    return fonts.get(name);
  } catch {
    return undefined;
  }
}

function tryStartLoadingFont(name: string): void {
  try {
    void fonts.load(name).catch(() => undefined);
  } catch {
    // Not a loadable asset name (e.g. a literal CSS family) — nothing to load.
  }
}

/** Builds a canvas font shorthand string: `[italic] [bold] <size>px <family>`. */
function buildFontString(fontSize: number, options: TextOptions): string {
  const fontFamily = resolveFontFamily(options);
  const styleParts: string[] = [];
  if (options.italic) styleParts.push("italic");
  if (options.bold) styleParts.push("bold");
  const stylePrefix = styleParts.length > 0 ? `${styleParts.join(" ")} ` : "";
  return `${stylePrefix}${fontSize}px ${fontFamily}`;
}

function shadowOffsetFor(shadow: number | Point | undefined): Point | null {
  if (shadow === undefined) return null;
  if (typeof shadow === "number" && Number.isFinite(shadow))
    return [shadow, shadow];
  return requirePoint(shadow, "shadow");
}

function measureWithFont(
  context: CanvasRenderingContext2D,
  text: string,
  font: string,
): number {
  return withTemporaryFont(
    context,
    font,
    () => context.measureText(text).width,
  );
}

function withTemporaryFont<T>(
  context: CanvasRenderingContext2D,
  font: string,
  callback: () => T,
): T {
  const previousFont = context.font;
  try {
    context.font = font;
    return callback();
  } finally {
    context.font = previousFont;
  }
}

function withSavedCanvasState<T>(
  context: CanvasRenderingContext2D,
  callback: () => T,
): T {
  context.save();
  try {
    return callback();
  } finally {
    context.restore();
  }
}

/**
 * Checks a short form's numbers before it draws. The color, and a radius or
 * width that must be positive, are checked afterwards by the same code the
 * `screen.draw` methods use, so they fail the same way.
 */
function requireShortForm(form: ShortForm, args: ArrayLike<unknown>): void {
  const values = Array.from(args);
  const name = form.call.slice(0, form.call.indexOf("("));
  const numbers = values.slice(0, form.numbers.length);
  if (numbers.some((value) => typeof value === "object" && value !== null)) {
    throw new TypeError(form.lists);
  }
  form.numbers.forEach((label, index) => {
    const value = values[index];
    if (value === undefined) {
      throw new TypeError(`${name} is missing ${label}: ${form.call}.`);
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(
        `${name}'s ${label} must be a number, but got ${describeValue(value)}.`,
      );
    }
  });
  if (values.length > form.arity) throw new TypeError(form.extra);
}

const textCall = "screen.text(text, x, y, color, size)";

/** `screen.text` checks its text first, then its position like the other short forms. */
function requireTextShortForm(args: ArrayLike<unknown>): void {
  const values = Array.from(args);
  const [text, x, y] = values;
  if (text === undefined) {
    throw new TypeError(`screen.text is missing text: ${textCall}.`);
  }
  if (
    typeof text !== "string" &&
    !(typeof text === "number" && Number.isFinite(text))
  ) {
    throw new TypeError(
      `screen.text's text must be words in quotes or a number, but got ${describeValue(text)}.`,
    );
  }
  if (
    (typeof x === "object" && x !== null) ||
    (typeof y === "object" && y !== null)
  ) {
    throw new TypeError(
      'screen.text takes x, y as two numbers, like screen.text("Score: 3", 20, 30). For an [x, y] list or options such as center, use screen.draw.text(text, [x, y], options).',
    );
  }
  for (const [label, value] of [
    ["x", x],
    ["y", y],
  ] as const) {
    if (value === undefined) {
      throw new TypeError(`screen.text is missing ${label}: ${textCall}.`);
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(
        `screen.text's ${label} must be a number, but got ${describeValue(value)}.`,
      );
    }
  }
  if (values.length > 5) {
    throw new TypeError(
      `screen.text takes at most five values: ${textCall}. For more options, use screen.draw.text.`,
    );
  }
}

function requirePositiveNumber(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  throw new TypeError(`${label} must be a positive finite number.`);
}
