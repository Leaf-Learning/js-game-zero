import { images, type AssetLoader, type SurfaceLike } from "./assets";
import {
  angleTo,
  distanceTo,
  Rect,
  type Point,
  type RectLike,
} from "./geometry";
import { getScreen, type Screen } from "./rendering";

export type ActorAnchor = readonly [
  HorizontalActorAnchor | number,
  VerticalActorAnchor | number,
];

export type HorizontalActorAnchor = "left" | "center" | "middle" | "right";
export type VerticalActorAnchor = "top" | "center" | "middle" | "bottom";

export type ActorPositionKey =
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

export type ActorOptions = Partial<Record<ActorPositionKey, Point>> & {
  readonly anchor?: ActorAnchor;
  readonly angle?: number;
  readonly opacity?: number;
  readonly screen?: Screen;
  readonly loader?: Pick<AssetLoader<SurfaceLike>, "load" | "get" | "unload">;
  readonly imageLoader?: Pick<
    AssetLoader<SurfaceLike>,
    "load" | "get" | "unload"
  >;
};

type ActorPositionSource = {
  readonly key: ActorPositionKey;
  readonly value: Point;
};

const positionKeys = [
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

const allowedOptionKeys = new Set<string>([
  ...positionKeys,
  "anchor",
  "angle",
  "opacity",
  "screen",
  "loader",
  "imageLoader",
]);

class SizedSurface implements SurfaceLike {
  constructor(
    private readonly inner: SurfaceLike,
    private readonly width: number,
    private readonly height: number,
  ) {}

  get source(): SurfaceLike["source"] {
    return this.inner.source;
  }

  get_width(): number {
    return this.width;
  }

  get_height(): number {
    return this.height;
  }

  get_size(): Point {
    return [this.width, this.height];
  }

  get_rect(): Rect {
    return new Rect(0, 0, this.width, this.height);
  }
}

export class Actor {
  private readonly loader: Pick<
    AssetLoader<SurfaceLike>,
    "load" | "get" | "unload"
  >;
  private readonly screen?: Screen;
  private _image = "";
  private _surface: SurfaceLike | null = null;
  private _pos: Point = [0, 0];
  private _anchor: ActorAnchor = ["center", "center"];
  private _angle = 0;
  private _opacity = 1;
  private positionSource: ActorPositionSource;
  private imageLoadPromise: Promise<SurfaceLike> | null = null;

  constructor(
    image: string,
    pos?: Point | ActorOptions,
    options: ActorOptions = {},
  ) {
    const hasExplicitPos = isPoint(pos);
    const resolvedOptions = hasExplicitPos
      ? options
      : ({ ...(pos as ActorOptions | undefined), ...options } as ActorOptions);
    validateActorOptions(resolvedOptions);
    this.loader =
      resolvedOptions.imageLoader ?? resolvedOptions.loader ?? images;
    if (resolvedOptions.screen) this.screen = resolvedOptions.screen;
    if (resolvedOptions.anchor !== undefined)
      this.anchor = resolvedOptions.anchor;
    if (resolvedOptions.angle !== undefined) this.angle = resolvedOptions.angle;
    if (resolvedOptions.opacity !== undefined)
      this.opacity = resolvedOptions.opacity;
    this.positionSource = resolvePositionSource(
      hasExplicitPos ? (pos as Point) : undefined,
      resolvedOptions,
    );
    this.image = image;
    this.applyPositionSource();
  }

  get image(): string {
    return this._image;
  }

  set image(value: string) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError("Actor image must be a non-empty asset name.");
    }
    this._image = value;
    const cached = this.loader.get(value);
    if (cached) {
      this._surface = cached;
      this.applyPositionSource();
      this.imageLoadPromise = Promise.resolve(cached);
      return;
    }
    const loadPromise = this.loader.load(value).then((surface) => {
      if (this._image === value) {
        this._surface = surface;
        this.applyPositionSource();
      }
      return surface;
    });
    this.imageLoadPromise = loadPromise;
  }

  get pos(): Point {
    return [this._pos[0], this._pos[1]];
  }

  set pos(value: Point) {
    this._pos = requirePoint(value, "pos");
    this.positionSource = { key: "pos", value: this.pos };
  }

  get x(): number {
    return this._pos[0];
  }

  set x(value: number) {
    this._pos = [requireFiniteNumber(value, "x"), this._pos[1]];
    this.positionSource = { key: "pos", value: this.pos };
  }

  get y(): number {
    return this._pos[1];
  }

  set y(value: number) {
    this._pos = [this._pos[0], requireFiniteNumber(value, "y")];
    this.positionSource = { key: "pos", value: this.pos };
  }

  get anchor(): ActorAnchor {
    return [this._anchor[0], this._anchor[1]];
  }

  set anchor(value: ActorAnchor) {
    this._anchor = normalizeAnchor(value);
    this.applyPositionSource();
  }

  get angle(): number {
    return this._angle;
  }

  set angle(value: number) {
    this._angle = requireFiniteNumber(value, "angle");
  }

  get opacity(): number {
    return this._opacity;
  }

  set opacity(value: number) {
    this._opacity = clamp(requireFiniteNumber(value, "opacity"), 0, 1);
  }

  get width(): number {
    return this._surface?.get_width() ?? 0;
  }

  get height(): number {
    return this._surface?.get_height() ?? 0;
  }

  get topleft(): Point {
    return this.baseRect().topleft;
  }

  set topleft(value: Point) {
    this.setRectPosition("topleft", value);
  }

  get topright(): Point {
    return this.baseRect().topright;
  }

  set topright(value: Point) {
    this.setRectPosition("topright", value);
  }

  get bottomleft(): Point {
    return this.baseRect().bottomleft;
  }

  set bottomleft(value: Point) {
    this.setRectPosition("bottomleft", value);
  }

  get bottomright(): Point {
    return this.baseRect().bottomright;
  }

  set bottomright(value: Point) {
    this.setRectPosition("bottomright", value);
  }

  get midtop(): Point {
    return this.baseRect().midtop;
  }

  set midtop(value: Point) {
    this.setRectPosition("midtop", value);
  }

  get midleft(): Point {
    return this.baseRect().midleft;
  }

  set midleft(value: Point) {
    this.setRectPosition("midleft", value);
  }

  get midright(): Point {
    return this.baseRect().midright;
  }

  set midright(value: Point) {
    this.setRectPosition("midright", value);
  }

  get midbottom(): Point {
    return this.baseRect().midbottom;
  }

  set midbottom(value: Point) {
    this.setRectPosition("midbottom", value);
  }

  get center(): Point {
    return this.baseRect().center;
  }

  set center(value: Point) {
    this.setRectPosition("center", value);
  }

  get left(): number {
    return this.baseRect().left;
  }

  set left(value: number) {
    const rect = this.baseRect();
    rect.left = requireFiniteNumber(value, "left");
    this.setPosFromBaseRect(rect);
  }

  get top(): number {
    return this.baseRect().top;
  }

  set top(value: number) {
    const rect = this.baseRect();
    rect.top = requireFiniteNumber(value, "top");
    this.setPosFromBaseRect(rect);
  }

  get right(): number {
    return this.baseRect().right;
  }

  set right(value: number) {
    const rect = this.baseRect();
    rect.right = requireFiniteNumber(value, "right");
    this.setPosFromBaseRect(rect);
  }

  get bottom(): number {
    return this.baseRect().bottom;
  }

  set bottom(value: number) {
    const rect = this.baseRect();
    rect.bottom = requireFiniteNumber(value, "bottom");
    this.setPosFromBaseRect(rect);
  }

  async ready(): Promise<SurfaceLike> {
    if (this._surface) return this._surface;
    if (!this.imageLoadPromise) throw new Error("Actor image is not loading.");
    return this.imageLoadPromise;
  }

  rect(): Rect {
    if (this.angle === 0) return this.baseRect();
    const base = this.baseRect();
    const radians = (-this.angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const corners = [
      base.topleft,
      base.topright,
      base.bottomright,
      base.bottomleft,
    ].map(([x, y]) => {
      const dx = x - this.x;
      const dy = y - this.y;
      return [
        this.x + dx * cos - dy * sin,
        this.y + dx * sin + dy * cos,
      ] as Point;
    });
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return new Rect(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
  }

  draw(screen?: Screen): void {
    if (!this._surface) return;
    const target = screen ?? this.screen ?? getScreen();
    const [anchorX, anchorY] = this.anchorOffset();
    target.context.save();
    target.context.globalAlpha *= this.opacity;
    target.context.translate(this.x, this.y);
    if (this.angle !== 0) target.context.rotate((-this.angle * Math.PI) / 180);
    target.context.drawImage(
      this._surface.source as CanvasImageSource,
      -anchorX,
      -anchorY,
    );
    target.context.restore();
  }

  unload_image(): void {
    this.loader.unload(this.image);
    this._surface = null;
    this.imageLoadPromise = null;
  }

  angle_to(target: Actor | Point): number {
    return angleTo(this.pos, actorTargetPoint(target));
  }

  distance_to(target: Actor | Point): number {
    return distanceTo(this.pos, actorTargetPoint(target));
  }

  copy(): Rect {
    return this.rect().copy();
  }

  move(x: number, y: number): Rect;
  move(offset: Point): Rect;
  move(xOrOffset: number | Point, y?: number): Rect {
    if (Array.isArray(xOrOffset)) return this.rect().move(xOrOffset);
    return this.rect().move(xOrOffset, y as number);
  }

  move_ip(x: number, y: number): void;
  move_ip(offset: Point): void;
  move_ip(xOrOffset: number | Point, y?: number): void {
    const rect = this.baseRect();
    if (Array.isArray(xOrOffset)) rect.move_ip(xOrOffset);
    else rect.move_ip(xOrOffset, y as number);
    this.setPosFromBaseRect(rect);
  }

  inflate(x: number, y: number): Rect;
  inflate(size: Point): Rect;
  inflate(xOrSize: number | Point, y?: number): Rect {
    if (Array.isArray(xOrSize)) return this.rect().inflate(xOrSize);
    return this.rect().inflate(xOrSize, y as number);
  }

  inflate_ip(x: number, y: number): void;
  inflate_ip(size: Point): void;
  inflate_ip(xOrSize: number | Point, y?: number): void {
    const rect = this.baseRect();
    if (Array.isArray(xOrSize)) rect.inflate_ip(xOrSize);
    else rect.inflate_ip(xOrSize, y as number);
    this.applyBaseRectGeometry(rect);
  }

  normalize(): void {
    const rect = this.baseRect();
    rect.normalize();
    this.applyBaseRectGeometry(rect);
  }

  clamp(other: RectLike | Actor): Rect {
    return this.rect().clamp(other instanceof Actor ? other.rect() : other);
  }

  clip(other: RectLike | Actor): Rect {
    return this.rect().clip(other instanceof Actor ? other.rect() : other);
  }

  union(other: RectLike | Actor): Rect {
    return this.rect().union(other instanceof Actor ? other.rect() : other);
  }

  unionall(others: Array<RectLike | Actor>): Rect {
    return this.rect().unionall(
      others.map((other) => (other instanceof Actor ? other.rect() : other)),
    );
  }

  fit(other: RectLike | Actor): Rect {
    return this.rect().fit(other instanceof Actor ? other.rect() : other);
  }

  collidepoint(point: Point): boolean;
  collidepoint(x: number, y: number): boolean;
  collidepoint(pointOrX: Point | number, y?: number): boolean {
    if (Array.isArray(pointOrX)) return this.rect().collidepoint(pointOrX);
    return this.rect().collidepoint(pointOrX, y as number);
  }

  colliderect(other: RectLike | Actor): boolean {
    return this.rect().colliderect(
      other instanceof Actor ? other.rect() : other,
    );
  }

  collidelist(others: Array<RectLike | Actor>): number {
    return others.findIndex((other) => this.colliderect(other));
  }

  collidelistall(others: Array<RectLike | Actor>): number[] {
    const indexes: number[] = [];
    others.forEach((other, index) => {
      if (this.colliderect(other)) indexes.push(index);
    });
    return indexes;
  }

  contains(other: RectLike | Actor): boolean {
    return this.rect().contains(other instanceof Actor ? other.rect() : other);
  }

  private baseRect(): Rect {
    const [anchorX, anchorY] = this.anchorOffset();
    return new Rect(
      this.x - anchorX,
      this.y - anchorY,
      this.width,
      this.height,
    );
  }

  private setRectPosition(
    key: Exclude<ActorPositionKey, "pos">,
    value: Point,
  ): void {
    const point = requirePoint(value, key);
    const rect = this.baseRect();
    rect[key] = point;
    this.setPosFromBaseRect(rect);
    this.positionSource = { key, value: point };
  }

  private setPosFromBaseRect(rect: Rect): void {
    const [anchorX, anchorY] = this.anchorOffset();
    this._pos = [rect.left + anchorX, rect.top + anchorY];
    this.positionSource = { key: "pos", value: this.pos };
  }

  private applyBaseRectGeometry(rect: Rect): void {
    if (this._surface) {
      this._surface = new SizedSurface(this._surface, rect.width, rect.height);
    }
    const [anchorX, anchorY] = this.anchorOffset();
    this._pos = [rect.left + anchorX, rect.top + anchorY];
    this.positionSource = { key: "pos", value: this.pos };
  }

  private applyPositionSource(): void {
    if (!this.positionSource) return;
    if (this.positionSource.key === "pos") {
      this._pos = [...this.positionSource.value];
      return;
    }
    const rect = new Rect(0, 0, this.width, this.height);
    rect[this.positionSource.key] = this.positionSource.value;
    const [anchorX, anchorY] = this.anchorOffset();
    this._pos = [rect.left + anchorX, rect.top + anchorY];
  }

  private anchorOffset(): Point {
    return [
      horizontalAnchorOffset(this._anchor[0], this.width),
      verticalAnchorOffset(this._anchor[1], this.height),
    ];
  }
}

function resolvePositionSource(
  explicitPos: Point | undefined,
  options: ActorOptions,
): ActorPositionSource {
  const optionSources = positionKeys.filter(
    (key) => options[key] !== undefined,
  );
  if (explicitPos !== undefined && optionSources.length > 0) {
    throw new TypeError("Actor accepts exactly one position source.");
  }
  if (optionSources.length > 1) {
    throw new TypeError("Actor accepts exactly one position source.");
  }
  if (explicitPos !== undefined) {
    return { key: "pos", value: requirePoint(explicitPos, "pos") };
  }
  const source = optionSources[0];
  if (source) {
    return { key: source, value: requirePoint(options[source], source) };
  }
  return { key: "topleft", value: [0, 0] };
}

function validateActorOptions(options: ActorOptions): void {
  for (const key of Object.keys(options)) {
    if (!allowedOptionKeys.has(key)) {
      throw new TypeError(`Unknown Actor option: ${key}`);
    }
  }
}

function normalizeAnchor(value: ActorAnchor): ActorAnchor {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError("anchor must be a two-item tuple.");
  }
  horizontalAnchorOffset(value[0], 1);
  verticalAnchorOffset(value[1], 1);
  return [value[0], value[1]];
}

function horizontalAnchorOffset(
  value: HorizontalActorAnchor | number,
  width: number,
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === "left") return 0;
  if (value === "center" || value === "middle") return width / 2;
  if (value === "right") return width;
  throw new TypeError("invalid horizontal anchor.");
}

function verticalAnchorOffset(
  value: VerticalActorAnchor | number,
  height: number,
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === "top") return 0;
  if (value === "center" || value === "middle") return height / 2;
  if (value === "bottom") return height;
  throw new TypeError("invalid vertical anchor.");
}

function actorTargetPoint(target: Actor | Point): Point {
  return target instanceof Actor ? target.pos : requirePoint(target, "target");
}

function requirePoint(value: unknown, label: string): Point {
  if (isPoint(value)) return [value[0], value[1]];
  throw new TypeError(`${label} must be a two-number tuple.`);
}

function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new TypeError(`${label} must be a finite number.`);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
