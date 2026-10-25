# Clock And Animation

## `clock`

`clock` schedules callbacks against the game's own timeline, which only
advances while your game is running (driven by the frame loop's `dt`, not by
wall-clock time) — so a scheduled callback never fires while the tab is
backgrounded and the game is effectively paused.

### `clock.schedule(callback, delay)`

Calls `callback` once, `delay` seconds from now.

```js
clock.schedule(spawnEnemy, 2); // spawn one enemy, 2 seconds from now
```

A callback scheduled by another scheduled callback waits for the next tick,
even with a delay of `0`, so one that schedules itself again with
`clock.schedule(loop, 0)` runs once a frame.

### `clock.scheduleInterval(callback, interval)`

Calls `callback` repeatedly, every `interval` seconds, until unscheduled.
`interval` must be greater than `0`.

```js
clock.scheduleInterval(spawnEnemy, 3); // a new enemy every 3 seconds
```

Every schedule, and `eachTick`, takes the function itself, without brackets.
`clock.scheduleInterval(spawnEnemy(), 3)` would call it once right away and
hand over what it returned, so it throws a `TypeError` that says to drop the
brackets.

### `clock.scheduleUnique(callback, delay)`

Like `schedule`, but first cancels any existing scheduled call for the same
`callback` function — useful when an event might restart a timer that's
already pending and you only want the latest one to count.

### `clock.unschedule(callback)`

Cancels a pending `schedule`, `scheduleInterval`, or `eachTick` callback
registered with that exact function reference. Safe to call even if nothing
matching is scheduled.

### `clock.eachTick(callback)`

Calls `callback(dt)` on every single frame, forever (until unscheduled) —
this is what `animate()` uses internally to advance animations, and it's
useful directly for continuous per-frame effects that don't fit naturally
into your top-level `update()`.

### `clock.clear()`

Cancels every scheduled call and every `eachTick` callback at once — handy
when resetting a level or restarting a game so old timers from the previous
run don't fire.

### `clock.now()`

Returns the clock's current time in seconds (the running total of every
`dt` it has been ticked with).

### Error handling

In a game, a scheduled or `eachTick` callback that throws (an animation's
`onFinished` too) stops the game, as an error in `update()` does: the game
fails in the `clock` phase (`handle.failure.phase` is `"clock"`), and a
`runtime-error` diagnostic reports `clock failed: …`. The other callbacks
due on that tick still run, but `update()` and `draw()` don't.

A `Clock` you make yourself with `new Clock()` keeps going instead: it logs
the error to the console and unschedules only that callback.
`new Clock({ onError })` hands the error to `onError` instead of logging it.

## Animation

### `animate(object, options)`

```ts
function animate<T extends object>(
  object: T,
  options: AnimationOptions<T>,
): Animation<T>;
```

Smoothly interpolates one or more numeric properties on `object` over time.
Any key in `options` other than `tween`, `duration`, and `onFinished` is
treated as a target value for a same-named property that must already exist
on `object` — animating a property `object` doesn't have throws an error.

```js
animate(player, { x: 300, y: 120, duration: 0.5, tween: "decelerate" });
```

- `duration` — seconds, default `1`.
- `tween` — the easing curve name (see the table below), default
  `"linear"`. An unknown name throws with a "did you mean ...?" suggestion.
- `onFinished` — called once, when the animation reaches its target. It
  isn't called when the animation is stopped, even with `stop(true)`.
- Each target value must be a finite number, or an array of finite numbers
  matching the shape of the property's current value (e.g. animating a
  `[x, y]`-shaped property to another two-number array).

Starting a new `animate()` call for a property that's already mid-animation
replaces just that property's animation; other properties being animated by
an earlier call keep running.

`animate()` returns an `Animation` instance:

- `.running: boolean`
- `.stop(complete = false)` — stops the animation. `stop(true)` jumps the
  properties to their final values first. Neither calls `onFinished`.
- `.removeTarget(property)` — stops animating a single property, leaving
  any others on the same call running.

### Tween names

| Name             | What the motion looks like                                                   |
| ---------------- | ---------------------------------------------------------------------------- |
| `linear`         | Constant speed.                                                              |
| `easeIn`         | Starts slow, speeds up (CSS's name). Same as `accelerate`.                   |
| `easeOut`        | Starts fast, slows to a stop (CSS's name). Same as `decelerate`.             |
| `easeInOut`      | Speeds up, then slows down (CSS's name). Same as `accelDecel`.               |
| `bounce`         | Bounces to a stop at the target, like a dropped ball. Same as `bounceEnd`.   |
| `spring`         | Shoots past the target, then wobbles back and settles. Same as `outElastic`. |
| `accelerate`     | Starts slow, speeds up.                                                      |
| `decelerate`     | Starts fast, eases to a stop.                                                |
| `accelDecel`     | Eases in, then eases out.                                                    |
| `inElastic`      | Wobbles around the starting point, then snaps to the target at the end.      |
| `outElastic`     | Shoots past the target right away, then wobbles back and settles.            |
| `inOutElastic`   | Wobbles at the start, then again around the target.                          |
| `bounceEnd`      | Bounces to a stop at the target, like a dropped ball.                        |
| `bounceStart`    | Bounces around the starting point, then heads for the target.                |
| `bounceStartEnd` | Bounces at both ends.                                                        |
| `endElastic`     | Same as `inElastic`: the wobble comes near the end.                          |
| `startElastic`   | Same as `outElastic`: the wobble comes near the start.                       |
| `bothElastic`    | Same as `inOutElastic`.                                                      |

That's all 18 names `tween` accepts: Pygame Zero's 10 curves, the five
plain-language names, and `endElastic`, `startElastic` and `bothElastic`,
names from Pygame Zero's older docs (`end_elastic` and so on) that its code
doesn't accept. To check a name in code, import the same list as
`tweenNames` (`import { tweenNames } from "@js-game-zero/core"`); it isn't a
global in a game file. Like every other name, they're camelCase:
`tween: "bounce_end"` throws, suggesting `bounceEnd`. If you're not
sure which to pick, try `easeOut` for smooth movement, `bounce` for things
that land, and `spring` for things that pop into place.
