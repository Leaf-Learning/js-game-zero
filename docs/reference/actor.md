# Actor

`Actor` bundles an image, a position, and a hitbox rectangle into one object
you can move, rotate, fade, and collide-test. It's the class you'll use for
players, enemies, bullets — anything that moves around the screen.

```ts
new Actor(image: string, pos?: [number, number] | ActorOptions, options?: ActorOptions): Actor
```

```js
let player = new Actor("player.svg", { center: [160, 90] });

function draw() {
  screen.fill("#111827");
  player.draw();
}
```

`image` is an asset name resolved under `images/` (see
[`docs/reference/loaders.md`](loaders.md)). In `jgz`, the sandbox, and a page
that decodes its images first with
[`loadImages`](loaders.md#assets-without-a-server), the image is ready
before your code runs, so `player.width` and an edge position like
`midBottom` are right from the first line. Anywhere else, loading starts
when the Actor is made: until it finishes, the Actor has no size and `draw()`
is a no-op, and the runtime holds the first frame until images touched while
your script starts up have loaded. `player.ready()` returns a promise for
the image; the top level of a zero-boilerplate game can't `await`, so use
`player.ready().then(() => …)` there.

## Positioning

Give **at most one** position source — either the second constructor
argument as a `[x, y]` point, or exactly one of these option keys:
`pos`, `topLeft`, `topRight`, `bottomLeft`, `bottomRight`, `midTop`,
`midLeft`, `midRight`, `midBottom`, `center`. Passing more than one throws a
`TypeError`. With no position at all, the actor starts at `topLeft: [0, 0]`.

```js
new Actor("player.svg", [100, 50]); // shorthand for { pos: [100, 50] }
new Actor("player.svg", { midBottom: [160, 180] }); // stands on the floor at y=180
```

`anchor` controls which point of the image maps to the position — it
defaults to `["center", "center"]`, so by default `player.x`/`player.y` (and
`pos`) refer to the image's center, matching pgzero. Each axis accepts
`"left"`/`"center"`/`"right"` (horizontal) or `"top"`/`"center"`/`"bottom"`
(vertical), or a literal pixel offset number.

```js
new Actor("player.svg", { topLeft: [0, 0], anchor: ["left", "top"] });
```

## Properties

| Property                                                                                                   | Type           | Notes                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `image`                                                                                                    | `string`       | Reassigning starts loading the new image.                                                                               |
| `pos`, `x`, `y`                                                                                            | point / number | The anchor point's position.                                                                                            |
| `angle`                                                                                                    | `number`       | Degrees, counterclockwise, around the anchor.                                                                           |
| `opacity`                                                                                                  | `number`       | `0`–`1`; out-of-range values are clamped, not rejected.                                                                 |
| `anchor`                                                                                                   | `[h, v]`       | See above.                                                                                                              |
| `scale`                                                                                                    | `number`       | Drawn size as a multiple of the image's native size; default `1`.                                                       |
| `width`, `height`                                                                                          | `number`       | The current (possibly rotated) bounding box size. Setting one resizes the sprite to that size, keeping its proportions. |
| `topLeft`, `topRight`, `bottomLeft`, `bottomRight`, `midTop`, `midLeft`, `midRight`, `midBottom`, `center` | point          | Read or move the actor by any edge/corner of its bounding box.                                                          |
| `left`, `top`, `right`, `bottom`                                                                           | `number`       | Same idea, one axis at a time.                                                                                          |

Setting `angle` rotates the sprite around its anchor and changes the
axis-aligned bounding box returned by `rect()`/`width`/`height` — useful when
you collide-test a rotated actor, since the hitbox grows to cover the
rotated silhouette.

```js
function update(dt) {
  if (keyboard.right) player.x += 120 * dt;
  player.angle += 90 * dt; // spin
}
```

## Sizing

Sprites draw at their native pixel size by default. To fit a picture to
your game, give it a `scale`, or a `width` or `height` (at most one of the
three; the other axis follows so the picture keeps its proportions):

```js
let cow = new Actor("cow.png", { midBottom: [240, 620], width: 80 }); // 80px wide
let car = new Actor("car.png", { scale: 3 }); // three times its native size
cow.height = 60; // resize later; the midBottom stays on the floor
```

The hitbox, `rect()`, and every edge/corner property follow the drawn size,
and the position you gave (a `midBottom` on the floor, a `center`) stays
put when the size changes. A size set before the image has loaded is
applied as soon as it arrives. `inflateIp` still grows only the hitbox,
never the picture.

## Methods

- `rect(): Rect` — the actor's current bounding rectangle (see
  [`docs/reference/rect.md`](rect.md)); useful for custom drawing or manual
  collision math.
- `draw(screen?)` — draws the actor at its current position, angle, and
  opacity. Normally called with no arguments inside `draw()`.
- `ready(): Promise<SurfaceLike>` — resolves once the current image has
  loaded.
- `unloadImage()` — releases the cached image (advanced; rarely needed).
- `angleTo(target)` / `distanceTo(target)` — `target` is another `Actor`
  or a `[x, y]` point. `angleTo` returns degrees, `distanceTo` returns
  pixels.
- `move(x, y)` / `moveIp(x, y)` — like `Rect.move`/`moveIp`; `move` returns
  a new `Rect`, `moveIp` moves the actor itself.
- `inflate(x, y)` / `inflateIp(x, y)` — grow/shrink the hitbox around its
  center.
- `touches(target)` — `true` when the actor overlaps `target`, which can be
  another `Actor`, a `Rect`, a `[left, top, width, height]` tuple, or an
  `[x, y]` point such as a click position.
- `collidePoint(point)`, `collideRect(other)`, `collideList(others)`,
  `collideListAll(others)`, `contains(other)` — Pygame Zero's collision
  tests, delegating to the actor's `rect()`. `other` can be a `Rect`, a
  plain `[left, top, width, height]` tuple, or another `Actor`.
- `clampIp(area)` — moves the actor (without resizing it) so its bounding
  box fits inside `area`. `player.clampIp(screen.bounds())` keeps the
  player on screen.
- `clamp(other)`, `clip(other)`, `union(other)`, `unionAll(others)`,
  `fit(other)` — geometry helpers, same semantics as the matching `Rect`
  methods, again accepting `Actor`s directly. They return a new `Rect` and
  leave the actor where it is.

```js
function update(dt) {
  if (keyboard.right) player.x += 120 * dt;
  player.clampIp(screen.bounds()); // stop at the edges of the screen
}

function onMouseDown(pos) {
  if (player.touches(pos)) console.log("clicked the player");
}

if (player.touches(enemy)) loseLife();
```

## Animating an Actor

`Actor` is a plain object as far as `animate()` is concerned — any numeric
property (`x`, `y`, `angle`, `opacity`, ...) can be animated:

```js
animate(player, { x: 300, duration: 0.6, tween: "bounceEnd" });
```

See [`docs/reference/clock.md`](clock.md#animation) for the full tween list.

## Flip-book animation: `images` and `fps`

Give an actor a list of pictures and it flips through them by itself, like a
flip book — for walking legs, spinning coins, or explosions:

```js
let coin = new Actor("coin_0", {
  center: [200, 120],
  images: ["coin_0", "coin_1", "coin_2", "coin_3"],
  fps: 8, // pictures per second
});

function draw() {
  coin.draw();
}
```

| Property   | Meaning                                                                               |
| ---------- | ------------------------------------------------------------------------------------- |
| `images`   | The pictures to show, in order. Setting it starts again from the first; `null` stops. |
| `fps`      | Pictures per second (default `10`). Changing it keeps the current picture.            |
| `loop`     | Start over after the last picture (default `true`). `false` stops on the last.        |
| `frame`    | Which picture is showing: `0` for the first.                                          |
| `finished` | `true` once a `loop: false` animation has shown its last picture.                     |

The pictures change on the game's own clock, so they pause when the game
does and keep the same speed at any frame rate. All of them start loading
as soon as you set `images`. For a one-shot effect, remove the actor once
it's `finished`:

```js
explosions.push(
  new Actor("boom_0", {
    center: pos,
    images: ["boom_0", "boom_1", "boom_2"],
    fps: 16,
    loop: false,
  }),
);
explosions = explosions.filter((explosion) => !explosion.finished);
```
