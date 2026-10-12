# Helpers

Small functions for things almost every game needs. In a game file they're
ready to use, like `screen` and `Actor`; in import mode, import them from
`@js-game-zero/core`.

## `randomInt(min, max)`

A random whole number from `min` to `max`, **including both ends**.

```js
let roll = randomInt(1, 6); // a die: 1, 2, 3, 4, 5 or 6
let x = randomInt(20, WIDTH - 20); // somewhere across the screen
```

Fractional ends are rounded inward (`randomInt(0.5, 3.5)` picks 1, 2 or 3).
Putting the bigger number first throws an error that says so.

## `randomChoice(list)`

A random item from a list.

```js
let color = randomChoice(["red", "gold", "skyblue"]);
ball.vx = randomChoice([-200, 200]); // left or right
```

An empty list throws, since there's nothing to choose.

## `clamp(value, min, max)`

`value`, moved inside `min`–`max` if it's outside; values already inside
come back unchanged.

```js
player.x = clamp(player.x, 0, WIDTH);
plane.angle = clamp(-plane.vy / 8, -25, 75);
```

To keep a whole sprite on screen, `player.clampIp(screen.bounds())` (see
[`actor.md`](actor.md)) uses the sprite's real edges.

## `rgb(red, green, blue, alpha?)`

A color mixed from red, green and blue, each `0`–`255`, as in
`rgb(255, 140, 105)`. See [Colors](screen.md#colors).
