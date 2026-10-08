# Screen And Drawing

`screen` is the global canvas surface. Everything you draw happens inside
`draw()`, using canvas pixel coordinates: `[0, 0]` is the top-left corner, x
grows right, y grows down.

## Colors

Every drawing method accepts a `Color`, which is either a CSS color string
(`"white"`, `"#0f172a"`, `"rgb(20, 30, 40)"`) or an RGB/RGBA tuple of
integers `0`–`255`: `[249, 115, 22]` or `[249, 115, 22, 128]` (the fourth
value is alpha out of 255, not a `0`–`1` fraction). Passing anything else
throws a `TypeError` that says what was wrong:

- A misspelled color name suggests the right one: `"lightblu"` fails with
  `Did you mean "lightblue"?`. (A canvas would otherwise ignore the color
  and keep drawing in the previous one.)
- A hex code needs 3 or 6 hex digits (or 4 or 8, with alpha).
- A fractional alpha such as `[255, 0, 0, 0.5]` fails with the 0–255 value
  to use instead (`128`).

Drawing options are checked the same way: an option a method doesn't have,
such as `{ colour: "red" }`, throws and names the closest real option.

## `screen.clear()`

Resets the whole canvas to opaque black.

```js
function draw() {
  screen.clear();
}
```

## `screen.fill(color, gcolor?)`

Fills the canvas with a solid color, or a top-to-bottom gradient when a
second color is given.

```js
screen.fill("#0f172a"); // solid
screen.fill("#0f172a", "#164e63"); // gradient, dark at top to teal at bottom
```

## `screen.blit(image, pos)`

Draws an already-loaded image (by asset name, or a `SurfaceLike` you already
hold) at a position. `pos` is a `[x, y]` point for the image's top-left
corner, or a rect-like value (its top-left corner is used; blit does not
scale the image to the rect's size).

```js
screen.blit("player.svg", [40, 40]);
```

If the named image hasn't finished loading yet, `blit` returns a `Promise`
that resolves once it has drawn; most games don't need to await it because
the runtime already holds the first frame until images touched at startup
have loaded (see [`docs/reference/runtime.md`](runtime.md#preload-gate)).
Prefer `Actor` for anything that moves or needs collision — `blit` is for
one-off background art.

## `screen.bounds()`

Returns a `ZRect` covering the whole canvas (`[0, 0, WIDTH, HEIGHT]`), handy
for clamping or collision against the screen edge.

```js
if (!screen.bounds().contains(player.rect()))
  player.center = [WIDTH / 2, HEIGHT / 2];
```

## `screen.draw.line(start, end, color, width = 1)`

```js
screen.draw.line([20, 20], [200, 120], "white", 3);
```

## `screen.draw.circle(pos, radius, color, width = 1)` / `filled_circle(pos, radius, color)`

```js
screen.draw.circle([160, 90], 40, "#38bdf8", 2); // outline
screen.draw.filled_circle([160, 90], 40, "#38bdf8"); // filled
```

## `screen.draw.rect(rect, color, width = 1)` / `filled_rect(rect, color)`

`rect` accepts anything geometry accepts: a `Rect`, an `Actor` (via its
`.rect()` duck type — see [`docs/reference/rect.md`](rect.md)), or a plain
`[left, top, width, height]` tuple.

```js
screen.draw.filled_rect([40, 40, 120, 60], "#f97316");
screen.draw.rect(player.rect(), "yellow", 2); // highlight a hitbox
```

## `screen.draw.polygon(points, color, width = 1)` / `filled_polygon(points, color)`

Needs at least three points.

```js
screen.draw.filled_polygon(
  [
    [238, 40],
    [292, 64],
    [270, 126],
    [214, 118],
  ],
  "#f8fafc",
);
```

## `screen.draw.text(text, pos?, options?)`

Draws text with a large set of beginner-friendly options — this is a
JavaScript-native reimplementation of pgzero's `ptext` module, including its
word-wrapping algorithm and gradient/outline/shadow effects.

```js
screen.draw.text("Score: 12", [16, 16], {
  fontsize: 24,
  color: "white",
});
```

### Position options

Give **exactly one** of the following ways to position the text (mixing
them throws a `TypeError`):

- `pos` (or the second positional argument) — a `[x, y]` point. Combined
  with `anchor` (default `"topleft"`) to decide which part of the text box
  sits at that point.
- A named anchor point directly: `topleft`, `topright`, `bottomleft`,
  `bottomright`, `midtop`, `midleft`, `midright`, `midbottom`, `center` —
  each takes a `[x, y]` point for that corner/edge/center of the text.
- Scalar axis keywords, combined per-axis: `left`/`centerx`/`right` for the
  horizontal position, `top`/`centery`/`bottom` for the vertical position.
  You can mix one horizontal and one vertical scalar (`{ right: 300, top: 10
}`), or use just one axis and fall back to `pos` for the other.

```js
screen.draw.text("Game Over", [], {
  center: [WIDTH / 2, HEIGHT / 2],
  fontsize: 40,
});
screen.draw.text("HUD", [], { right: WIDTH - 10, top: 10 }); // top-right corner, 10px margin
```

### Font options

- `fontsize` (default `24`)
- `fontname` — the stem of a font asset under `fonts/` (e.g. `"pixel"` for
  `fonts/pixel.ttf`); loads asynchronously the first time it's used.
- `sysfontname` — a literal CSS font family name instead (e.g. `"Georgia"`).
  Mutually exclusive with `fontname`.
- `bold`, `italic`, `underline` — booleans.
- `color` (default `"white"`), `background` (fills a box behind the text).
- `gcolor` — a second color for a top-to-bottom gradient across the text.

### Layout options

- `width` — wraps text to fit this many pixels; without it, text is only
  broken at explicit newlines (`\n`). Wrapping is greedy word-wrap: a single
  word longer than `width` is placed on its own (overflowing) line rather
  than being cut.
- `widthem` — like `width`, but expressed as a multiple of `fontsize`.
- `lineheight` — pixels between lines (default `fontsize * 1.2`).
- `align` — `"left"` (default), `"center"`, or `"right"`, for multi-line text.
- `strip` — trims trailing spaces from each wrapped line (default `true`).
- `anchor` — overrides which part of the text's bounding box sits at the
  resolved position; either one of the named anchor strings above, or a
  `[horizontal, vertical]` pair where each side is `"left"`/`"center"`/`"right"`,
  `"top"`/`"center"`/`"bottom"`, or a literal pixel-offset number.
- `angle` — rotates the text counterclockwise around the anchor point, in
  degrees.

### Effects

- `owidth` + `ocolor` — an outline stroke around the glyphs.
- `shadow` (a number or `[x, y]` offset) + `scolor` (default `"black"`) — a
  drop shadow.
- `alpha` — overall opacity, `0`–`1` (default `1`).

## `screen.draw.textbox(text, rect, options?)`

Like `draw.text`, but instead of a fixed `fontsize` you give a rectangle and
`textbox` picks the **largest font size that fits inside it** (shrinking
down to `min_fontsize`, default `4`, if necessary). Text is centered in the
rect by default; pass `anchor` (e.g. `"topleft"`) to change that. `textbox`
does not accept `pos`, `width`, or the scalar position keywords — the rect
defines its layout box.

```js
screen.draw.textbox("You win!", [40, 60, 240, 80], {
  color: "white",
  fontsize: 48, // upper bound; shrinks to fit if "You win!" would overflow
});
```
