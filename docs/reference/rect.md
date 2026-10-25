# Rect And ZRect

`Rect` is a mutable rectangle with pygame/pgzero-style geometry helpers:
position properties that move the rectangle without resizing it, collision
tests, and set operations. `ZRect` is the same class under a second name,
kept for code ported from pgzero that references `ZRect` directly — the two
are interchangeable.

## Constructing a Rect

```ts
new Rect(left: number, top: number, width: number, height: number)
new Rect(topLeft: [number, number], size: [number, number])
new Rect(other: Rect)
new Rect([left, top, width, height])
new Rect({ left, top, width, height })
new Rect({ x, y, w, h })
new Rect(objectWithADotRectPropertyOrMethod)
```

The last form is duck-typed: if you pass any object with a `.rect` property
(or a `.rect()` method), the `Rect` constructor follows it — recursively, up
to a sensible depth — until it finds real rectangle data. This is what lets
you write `new Rect(myActor)` directly, since `Actor` exposes a `.rect()`
method, and it means most `Rect`/`Actor` collision methods below accept an
`Actor` anywhere they say "rect-like" without you needing to call `.rect()`
yourself.

```js
let hitbox = new Rect(10, 20, 40, 30);
let same = new Rect(hitbox); // copy via any accepted shape
let fromActor = new Rect(player); // works because Actor has .rect()
```

## Properties

All of these read or write the rectangle in place; setting a position
property moves the rectangle without changing its size, and setting `width`,
`height`, `w`, `h`, or `size` resizes it.

| Property                                           | Meaning                           |
| -------------------------------------------------- | --------------------------------- |
| `left`, `top`, `width`, `height`                   | The four base fields.             |
| `x`, `y`, `w`, `h`                                 | Aliases for the same.             |
| `right`, `bottom`                                  | `left + width`, `top + height`.   |
| `centerX`, `centerY`                               | Center point, one axis at a time. |
| `topLeft`, `topRight`, `bottomLeft`, `bottomRight` | Corners, as `[x, y]`.             |
| `midTop`, `midLeft`, `midRight`, `midBottom`       | Edge midpoints, as `[x, y]`.      |
| `center`                                           | `[centerX, centerY]`.             |
| `size`                                             | `[width, height]`.                |

`Rect` also supports index access (`rect[0]` through `rect[3]` for
`left`/`top`/`width`/`height`) and spreading/iteration
(`[...rect]` → `[left, top, width, height]`, `Array.from(rect)`), so it can
be dropped into APIs that expect a plain tuple.

```js
hitbox.center = [100, 80]; // moves it; width/height unchanged
hitbox.size = [64, 64]; // resizes it in place
let [left, top, width, height] = hitbox;
```

## Copying and moving

- `copy(): Rect`
- `move(x, y)` / `move([x, y])` → new `Rect`; `moveIp(...)` moves in place.
- `inflate(x, y)` / `inflate([x, y])` → new `Rect`, grown by `x`/`y` around
  its center (negative shrinks); `inflateIp(...)` mutates in place.
- `normalize()` — flips a negative `width`/`height` so the rectangle has a
  well-defined top-left corner (mutates in place).

## Set operations

Each but `fit` has a mutating `…Ip` counterpart that applies the result back
onto the rectangle itself instead of returning a new one:

- `clamp(other)` / `clampIp(other)` — moves (without resizing) to fit
  entirely inside `other`, centering on whichever axis doesn't fit.
- `clip(other)` / `clipIp(other)` — the overlapping area of this rect and
  `other` (zero-sized if they don't overlap).
- `union(other)` / `unionIp(other)` — the smallest rect containing both.
- `unionAll(others)` / `unionAllIp(others)` — union across an array of
  rect-likes.
- `fit(other)` — scales (preserving aspect ratio) and centers this rect to
  fit inside `other`.

```js
let hitbox = new Rect(300, 60, 40, 40);
hitbox.clampIp(screen.bounds()); // now fully on screen
```

`Actor` has its own `clampIp`, which moves the actor itself:
`player.clampIp(screen.bounds())` keeps the player on screen. (Calling
`player.rect().clampIp(...)` would only move a copy of the player's
rectangle, not the player.)

## Collision tests

Collision uses **half-open bounds**: the left and top edges are inclusive,
the right and bottom edges are exclusive — a point exactly on the right or
bottom edge does not count as colliding. This matches pygame's `Rect`.

- `touches(target): boolean` — the one test most games need: `target` is an
  `[x, y]` point (does the rect contain it?) or any rect-like value, such as
  another `Rect` or an `Actor` (do they overlap?).
- `contains(other): boolean`
- `collidePoint(point)` / `collidePoint(x, y): boolean`
- `collideRect(other): boolean`
- `collideList(others): number` — index of the first colliding rect-like in
  the array, or `-1`.
- `collideListAll(others): number[]` — indexes of every colliding entry.
- `collideDict(dict, useValues = true)` — `dict` is a `Map` or plain object;
  returns the first `[key, value]` entry whose value (or key, if
  `useValues` is `false`) collides with this rect, or `undefined`.
- `collideDictAll(dict, useValues = true)` — same, but returns every
  matching `[key, value]` entry as an array.

```js
let enemies = { goblin: goblinRect, bat: batRect };
let hit = player.rect().collideDict(enemies);
if (hit) console.log(`hit the ${hit[0]}`);
```

## Standalone helpers

`angleTo(from, to)` and `distanceTo(from, to)` are exported functions (used
internally by `Actor.angleTo`/`distanceTo`) if you need the same math on
plain points without an `Actor`. They aren't globals in a game file; import
them from `@js-game-zero/core`.
