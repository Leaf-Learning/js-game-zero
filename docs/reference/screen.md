# Screen And Drawing

`screen` is the global canvas surface. Everything you draw happens inside
`draw()`, in screen pixels: `[0, 0]` is the top-left corner, x grows right,
y grows down, and `[WIDTH, HEIGHT]` is the bottom-right corner.

## Short forms

Five short calls draw the most common shapes and text, with each position
given as separate numbers rather than an `[x, y]` list:

| Call                                             | Draws                                              |
| ------------------------------------------------ | -------------------------------------------------- |
| `screen.circle(x, y, radius, color)`             | a filled circle centered on `x, y`                 |
| `screen.rect(x, y, width, height, color)`        | a filled rectangle whose top-left corner is `x, y` |
| `screen.triangle(x1, y1, x2, y2, x3, y3, color)` | a filled triangle with those three corners         |
| `screen.line(x1, y1, x2, y2, color, width = 1)`  | a line from `x1, y1` to `x2, y2`, `width` px thick |
| `screen.text(text, x, y, color, size = 24)`      | text whose top-left corner is `x, y`, `size` tall  |

`color` is optional and defaults to `"white"`; it takes any of the
[colors](#colors) below.

```js
function draw() {
  screen.clear();
  screen.rect(0, 220, 400, 80, "green");
  screen.circle(200, 150, 25, "gold");
  screen.triangle(160, 40, 120, 120, 200, 120);
  screen.line(20, 20, 200, 120, "white", 3);
  screen.text("Score: " + score, 20, 30);
}
```

`screen.text` takes words in quotes or a number. To place text by its
center, wrap it or give it an outline, use
[`screen.draw.text`](#screendrawtexttext-pos-options--screendrawtexttext-options).

The short forms fill their shapes. The outline versions, and the versions
that take `[x, y]` lists, stay under `screen.draw` below. Mind the names:
**`screen.circle` fills, but `screen.draw.circle` draws only an outline**,
and the same goes for `screen.rect` and `screen.draw.rect`.

A wrong call throws a `TypeError` that says what to change. A list, as in
`screen.circle([200, 150], 25)`, points to the `screen.draw` method that
takes lists (here `screen.draw.filled_circle`). A missing or non-number
argument is named, and an extra one, such as an outline width, points to
the outline method.

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

### `rgb(red, green, blue, alpha?)`

Mixes a color from red, green and blue light, each `0`–`255`, with an
optional alpha out of 255. It returns the matching list, so
`rgb(255, 140, 105)` is `[255, 140, 105]` and works anywhere a color does.
It's ready to use in a game file; in import mode, import it from
`@js-game-zero/core`.

```js
let coral = rgb(255, 140, 105);
let glass = rgb(120, 200, 255, 128); // half see-through
screen.circle(200, 150, 25, coral);
```

Its numbers are checked like a list's, with the same hints (a fractional
alpha such as `0.5` names `128` instead), and a missing one is named:
`rgb(255, 140)` fails with `rgb is missing blue`.

## `screen.clear()`

Resets the whole canvas to opaque black.

```js
function draw() {
  screen.clear();
}
```

## `screen.fill(color, bottom_color?)`

Fills the canvas with a solid color, or a top-to-bottom gradient when a
second color is given: `color` at the top fading to `bottom_color` at the
bottom.

```js
screen.fill("#0f172a"); // solid
screen.fill("#0f172a", "#164e63"); // gradient, dark at top to teal at bottom
```

## `screen.draw.image(image, pos)` / `screen.blit(image, pos)`

`screen.draw.image` and `screen.blit` (Pygame Zero's name) do the same
thing. Draws an already-loaded image (by asset name, or a `SurfaceLike` you already
hold) at a position. `pos` is a `[x, y]` point for the image's top-left
corner, or a rect-like value (its top-left corner is used; blit does not
scale the image to the rect's size).

```js
screen.draw.image("player.svg", [40, 40]);
```

If the named image hasn't finished loading yet, it returns a `Promise`
that resolves once it has drawn; most games don't need to await it because
the runtime already holds the first frame until images touched at startup
have loaded (see [`docs/reference/runtime.md`](runtime.md#preload-gate)).
Prefer `Actor` for anything that moves or needs collision — drawing an image
directly is for background art and tiles.

## `screen.bounds()`

Returns a `ZRect` covering the whole canvas (`[0, 0, WIDTH, HEIGHT]`), handy
for clamping or collision against the screen edge.

```js
if (!screen.bounds().contains(player.rect()))
  player.center = [WIDTH / 2, HEIGHT / 2];
```

## `PIXEL_DENSITY` and `screen.density`

On a phone, one screen pixel covers several of the device's own pixels.
The canvas has a pixel for each of them, so text, outlines and SVG pictures
stay sharp. `screen.density` says how many canvas pixels make up one screen
pixel along each side: between 2 and 3 on most phones and 1 on a computer
monitor. Your game's numbers don't change with it: a game 360 pixels wide
is 360 wide at any density.

Set `PIXEL_DENSITY` next to `WIDTH` and `HEIGHT` to choose the density
yourself. Without it, the game uses the device's own, up to 3.

```js
WIDTH = 360;
HEIGHT = 640;
PIXEL_DENSITY = 1; // one canvas pixel per screen pixel, even on a phone
```

See [pixel density](runtime.md#pixel-density) for how hosts size and read
the canvas.

## `screen.draw.line(start, end, color, width = 1)`

```js
screen.draw.line([20, 20], [200, 120], "white", 3);
```

## `screen.draw.circle(pos, radius, color, width = 1)` / `filled_circle(pos, radius, color)`

`screen.draw.circle` draws an outline; `filled_circle` and the short form
[`screen.circle`](#short-forms) fill.

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

## `screen.draw.text(text, pos?, options?)` / `screen.draw.text(text, options)`

Draws text with a large set of beginner-friendly options — this is a
JavaScript-native reimplementation of pgzero's `ptext` module, including its
word-wrapping algorithm and gradient/outline/shadow effects.

```js
screen.draw.text("Score: 12", [16, 16], {
  size: 24,
  color: "white",
});
```

When the options say where the text goes (`center`, `topright`, ...), pass
them second, in place of the position:

```js
screen.draw.text("Game Over", { center: [WIDTH / 2, HEIGHT / 2], size: 40 });
```

Several options have two names: a readable one, and the shorter one Pygame
Zero uses. Either works, but not both at once:

| Readable name    | Pygame Zero name |
| ---------------- | ---------------- |
| `size`           | `fontsize`       |
| `outline`        | `owidth`         |
| `outline_color`  | `ocolor`         |
| `shadow_color`   | `scolor`         |
| `gradient_color` | `gcolor`         |
| `min_size`       | `min_fontsize`   |

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
screen.draw.text("Game Over", {
  center: [WIDTH / 2, HEIGHT / 2],
  size: 40,
});
screen.draw.text("HUD", { right: WIDTH - 10, top: 10 }); // top-right corner, 10px margin
```

### Font options

- `size` / `fontsize` (default `24`)
- `fontname` — the stem of a font asset under `fonts/` (e.g. `"pixel"` for
  `fonts/pixel.ttf`); loads asynchronously the first time it's used.
- `sysfontname` — a literal CSS font family name instead (e.g. `"Georgia"`).
  Mutually exclusive with `fontname`.
- `bold`, `italic`, `underline` — booleans.
- `color` (default `"white"`), `background` (fills a box behind the text).
- `gradient_color` / `gcolor` — a second color for a top-to-bottom gradient
  across the text.

### Layout options

- `width` — wraps text to fit this many pixels; without it, text is only
  broken at explicit newlines (`\n`). Wrapping is greedy word-wrap: a single
  word longer than `width` is placed on its own (overflowing) line rather
  than being cut.
- `widthem` — like `width`, but expressed as a multiple of `size`.
- `lineheight` — pixels between lines (default `size * 1.2`).
- `align` — `"left"` (default), `"center"`, or `"right"`, for multi-line text.
- `strip` — trims trailing spaces from each wrapped line (default `true`).
- `anchor` — overrides which part of the text's bounding box sits at the
  resolved position; either one of the named anchor strings above, or a
  `[horizontal, vertical]` pair where each side is `"left"`/`"center"`/`"right"`,
  `"top"`/`"center"`/`"bottom"`, or a literal pixel-offset number.
- `angle` — rotates the text counterclockwise around the anchor point, in
  degrees.

### Effects

- `outline` / `owidth` + `outline_color` / `ocolor` — an outline stroke
  around the glyphs, `outline` pixels thick.
- `shadow` (a number or `[x, y]` offset) + `shadow_color` / `scolor`
  (default `"black"`) — a drop shadow.
- `alpha` — overall opacity, `0`–`1` (default `1`).

## `screen.draw.textbox(text, rect, options?)`

Like `draw.text`, but instead of a fixed `size` you give a rectangle and
`textbox` picks the **largest font size that fits inside it** (shrinking
down to `min_size`, default `4`, if necessary). Text is centered in the
rect by default; pass `anchor` (e.g. `"topleft"`) to change that. `textbox`
does not accept `pos`, `width`, or the scalar position keywords — the rect
defines its layout box.

```js
screen.draw.textbox("You win!", [40, 60, 240, 80], {
  color: "white",
  size: 48, // upper bound; shrinks to fit if "You win!" would overflow
});
```
