# js-game-zero Engineering Design

## Summary

`js-game-zero` is a JavaScript framework for teaching browser game
development with a Pygame Zero-like model, inspired by and derived in part
from Pygame Zero. It must be beginner friendly, browser native,
LGPL-3.0-only licensed in line with Pygame Zero, and behavior-compatible
with Pygame Zero's documented surface without copying upstream implementation
code verbatim.

## Architecture

- `packages/core` implements the framework primitives: `run`, `Actor`, `Rect`,
  `ZRect`, `Screen`, loaders, input, clock, animation, audio, tone, and storage.
- `packages/browser-runtime` wraps learner code so both zero-boilerplate globals
  and explicit imports are supported.
- `apps/sandbox` is a Bun-backed web IDE that creates local project directories,
  edits files, accepts assets, and plays the game in a preview pane.
- `examples` contains browser-playable projects that are also e2e smoke fixtures.
- `docs/phases` defines phase-specific specifications and verification criteria.

## Public API

The public core export surface is:

```ts
(run,
  Actor,
  Rect,
  ZRect,
  Screen,
  screen,
  clock,
  Clock,
  animate,
  Animation,
  keyboard,
  KeyboardState,
  keys,
  keymods,
  mouse,
  images,
  sounds,
  music,
  tone,
  storage,
  Storage,
  exit);
```

The zero-boilerplate runtime injects those names plus standard hooks:

```ts
(WIDTH,
  HEIGHT,
  TITLE,
  ICON,
  draw,
  update,
  on_mouse_down,
  on_mouse_up,
  on_mouse_move,
  on_key_down,
  on_key_up,
  on_music_end);
```

Import mode accepts camelCase hook aliases for idiomatic JS:

```ts
(onMouseDown, onMouseUp, onMouseMove, onKeyDown, onKeyUp, onMusicEnd);
```

### Core Interface Contracts

```ts
type Point = [number, number];
type Size = [number, number];
type RectTuple = [number, number, number, number];
type Color =
  string | [number, number, number] | [number, number, number, number];

function run(
  game: GameModule | ZeroBoilerplateSource,
  options?: RunOptions,
): GameHandle;
function exit(): void;

class Rect {
  constructor(left: number, top: number, width: number, height: number);
  constructor(topleft: Point, size: Size);
  left: number;
  top: number;
  width: number;
  height: number;
  x: number;
  y: number;
  w: number;
  h: number;
  right: number;
  bottom: number;
  centerx: number;
  centery: number;
  topleft: Point;
  topright: Point;
  bottomleft: Point;
  bottomright: Point;
  midtop: Point;
  midleft: Point;
  midright: Point;
  midbottom: Point;
  center: Point;
  copy(): Rect;
  move(x: number, y: number): Rect;
  move_ip(x: number, y: number): void;
  inflate(x: number, y: number): Rect;
  inflate_ip(x: number, y: number): void;
  clamp(other: RectLike): Rect;
  clip(other: RectLike): Rect;
  union(other: RectLike): Rect;
  unionall(others: RectLike[]): Rect;
  contains(other: RectLike): boolean;
  collidepoint(point: Point): boolean;
  colliderect(other: RectLike): boolean;
  collidelist(others: RectLike[]): number;
  collidelistall(others: RectLike[]): number[];
}

class ZRect extends Rect {}

class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  bounds(): ZRect;
  clear(): void;
  fill(color: Color, gcolor?: Color): void;
  blit(
    image: string | SurfaceLike,
    pos: Point | RectLike,
  ): Promise<void> | void;
  draw: {
    line(start: Point, end: Point, color: Color, width?: number): void;
    circle(pos: Point, radius: number, color: Color, width?: number): void;
    filled_circle(pos: Point, radius: number, color: Color): void;
    polygon(points: Point[], color: Color): void;
    filled_polygon(points: Point[], color: Color): void;
    rect(rect: RectLike, color: Color, width?: number): void;
    filled_rect(rect: RectLike, color: Color): void;
    text(text: string, pos?: Point, options?: TextOptions): void;
    textbox(text: string, rect: RectLike, options?: TextboxOptions): void;
  };
}

class Actor {
  constructor(image: string, pos?: Point, options?: ActorOptions);
  image: string;
  pos: Point;
  x: number;
  y: number;
  angle: number;
  opacity: number;
  anchor: [
    "left" | "center" | "middle" | "right" | number,
    "top" | "center" | "middle" | "bottom" | number,
  ];
  rect(): Rect;
  draw(): void;
  unload_image(): void;
  angle_to(target: Actor | Point): number;
  distance_to(target: Actor | Point): number;
}

class Clock {
  schedule(callback: () => void, delay: number): void;
  schedule_unique(callback: () => void, delay: number): void;
  schedule_interval(callback: () => void, interval: number): void;
  unschedule(callback: Function): void;
  each_tick(callback: (dt: number) => void): void;
  tick(dt: number): void;
}

function animate<T>(object: T, options: AnimationOptions<T>): Animation<T>;
```

The implementation must expose snake_case names for PGZero compatibility and
camelCase aliases only where the JavaScript runtime API explicitly documents
them. Compatibility errors use `TypeError` for invalid argument shape,
`RangeError` for out-of-range values, and `KeyError`-style subclasses for
missing assets/tweens.

## Runtime Model

- The browser owns a single visible `<canvas>` per game run.
- `requestAnimationFrame` drives `clock.tick(dt)`, `update(dt)` or `update()`,
  then `draw()` when a frame is dirty; `dt` is seconds.
- The first frame initializes `WIDTH`, `HEIGHT`, `TITLE`, `ICON`, the canvas,
  loaders, input listeners, and storage before any user hook runs.
- The game can be configured through globals or `run({ ...hooks })`; when both
  are present, explicit `run` options win and diagnostics warn about duplicate
  definitions.
- Input events update `keyboard` state before user hooks run, then dispatch
  hook arguments by parameter name: `pos`, `button`, `buttons`, `rel`, `key`,
  `mod`, and `unicode`.
- Assets load from a project root with conventional `images`, `sounds`,
  `music`, and `fonts` directories.
- Drawing uses Canvas 2D. Audio uses Web Audio and HTML audio elements.
- Storage defaults to `localStorage` in browser mode and to project JSON files
  when the Bun sandbox adapter is active.

## Compatibility Decisions

- PGZero's Python introspection is mirrored by parsing function parameter names
  where possible; import-mode hook objects may instead receive a single event
  object if the handler declares one parameter named `event`.
- Resource names are lower-case, start with a letter, and contain only letters,
  digits, underscores, forward slashes, and one supported extension.
- Image formats: `png`, `gif`, `jpg`, `jpeg`, `bmp`, `webp`, and browser-loadable
  `svg` for examples. Sound/music formats use browser-supported `wav`, `ogg`,
  `mp3`, and `m4a`, with compatibility notes where browsers differ.
- Text rendering implements PGZero's documented beginner options. Exact font
  rasterization is browser-dependent, so pixel tests use stable layout and
  nonblank assertions rather than byte-for-byte matching.
- `storage` rejects values that `JSON.stringify` cannot encode and reports the
  first offending path. File-backed sandbox storage writes atomically via a
  temporary file and rename.

## License Boundary

Pygame Zero's upstream implementation is LGPL-3.0, and this project uses the
same LGPL-3.0-only license family. Public documentation, observable behavior,
and tests may guide compatibility, but code, comments, structure, and assets
from upstream are not copied into this repo. Where an algorithm is common and
simple, it is implemented from first principles and covered with independent
tests.

## Sandbox Design

The sandbox uses Bun for server-side filesystem operations and static serving.
It exposes JSON endpoints for:

- project creation and listing
- file read/write
- asset upload
- preview page serving
- runtime bundle serving
- diagnostics and reload metadata

Filesystem operations are scoped under `.jgz-projects` by default and reject
path traversal. The preview runs learner code in an isolated iframe and reports
runtime errors back to the editor.

## Verification Criteria

- Unit tests cover each public API behavior listed in `docs/internal/feature-parity.md`.
- Browser e2e tests launch the sandbox, run examples, interact with canvas input,
  and verify visible/nonblank rendering plus console health.
- Docs checks confirm every phase spec exists and contains verification criteria.
- CI runs typecheck, unit tests, docs checks, and Playwright Chromium tests.
