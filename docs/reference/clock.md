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

### `clock.schedule_interval(callback, interval)`

Calls `callback` repeatedly, every `interval` seconds, until unscheduled.
`interval` must be greater than `0`. `clock.scheduleInterval(...)` is a
camelCase alias of `schedule_interval`.

```js
clock.schedule_interval(spawnEnemy, 3); // a new enemy every 3 seconds
```

Every schedule takes the function itself, without brackets.
`clock.schedule_interval(spawnEnemy(), 3)` would call it once right away and
hand over what it returned, so it throws a `TypeError` that says to drop the
brackets.

### `clock.schedule_unique(callback, delay)`

Like `schedule`, but first cancels any existing scheduled call for the same
`callback` function — useful when an event might restart a timer that's
already pending and you only want the latest one to count.
`clock.scheduleUnique(...)` is a camelCase alias of `schedule_unique`.

### `clock.unschedule(callback)`

Cancels a pending `schedule`, `schedule_interval`, or `each_tick` callback
registered with that exact function reference. Safe to call even if nothing
matching is scheduled.

### `clock.each_tick(callback)`

Calls `callback(dt)` on every single frame, forever (until unscheduled) —
this is what `animate()` uses internally to advance animations, and it's
useful directly for continuous per-frame effects that don't fit naturally
into your top-level `update()`.

### `clock.clear()`

Cancels every scheduled call and every `each_tick` callback at once — handy
when resetting a level or restarting a game so old timers from the previous
run don't fire.

### `clock.now()`

Returns the clock's current time in seconds (the running total of every
`dt` it has been ticked with).

### Error handling

If a scheduled or `each_tick` callback throws, the clock logs the error to
the console and unschedules _only that callback_ — one broken timer doesn't
stop the rest of your game's scheduled events or crash the frame loop.

## Animation

### `animate(object, options)`

```ts
function animate<T extends object>(
  object: T,
  options: AnimationOptions<T>,
): Animation<T>;
```

Smoothly interpolates one or more numeric properties on `object` over time.
Any key in `options` other than `tween`, `duration`, and `on_finished` is
treated as a target value for a same-named property that must already exist
on `object` — animating a property `object` doesn't have throws an error.

```js
animate(player, { x: 300, y: 120, duration: 0.5, tween: "decelerate" });
```

- `duration` — seconds, default `1`.
- `tween` — the easing curve name (see the table below), default
  `"linear"`. An unknown name throws with a "did you mean ...?" suggestion.
- `on_finished` — called once, when the animation reaches its target
  naturally (not when it's stopped early without `complete: true`).
- Each target value must be a finite number, or an array of finite numbers
  matching the shape of the property's current value (e.g. animating a
  `[x, y]`-shaped property to another two-number array).

Starting a new `animate()` call for a property that's already mid-animation
replaces just that property's animation; other properties being animated by
an earlier call keep running.

`animate()` returns an `Animation` instance:

- `.running: boolean`
- `.stop(complete = false)` — stops the animation; if `complete` is `true`,
  it jumps the property to its final value first.
- `.removeTarget(property)` — stops animating a single property, leaving
  any others on the same call running.

### Tween names

| Name               | What the motion looks like                                                    |
| ------------------ | ----------------------------------------------------------------------------- |
| `linear`           | Constant speed.                                                               |
| `ease_in`          | Starts slow, speeds up (CSS's name). Same as `accelerate`.                    |
| `ease_out`         | Starts fast, slows to a stop (CSS's name). Same as `decelerate`.              |
| `ease_in_out`      | Speeds up, then slows down (CSS's name). Same as `accel_decel`.               |
| `bounce`           | Bounces to a stop at the target, like a dropped ball. Same as `bounce_end`.   |
| `spring`           | Shoots past the target, then wobbles back and settles. Same as `out_elastic`. |
| `accelerate`       | Starts slow, speeds up.                                                       |
| `decelerate`       | Starts fast, eases to a stop.                                                 |
| `accel_decel`      | Eases in, then eases out.                                                     |
| `in_elastic`       | Wobbles around the starting point, then snaps to the target at the end.       |
| `out_elastic`      | Shoots past the target right away, then wobbles back and settles.             |
| `in_out_elastic`   | Wobbles at the start, then again around the target.                           |
| `bounce_end`       | Bounces to a stop at the target, like a dropped ball.                         |
| `bounce_start`     | Bounces around the starting point, then heads for the target.                 |
| `bounce_start_end` | Bounces at both ends.                                                         |
| `end_elastic`      | Pygame Zero's name for `in_elastic`: the wobble comes near the end.           |
| `start_elastic`    | Pygame Zero's name for `out_elastic`: the wobble comes near the start.        |
| `both_elastic`     | Pygame Zero's name for `in_out_elastic`.                                      |

That's all 18 names `tween` accepts (`tweenNames` exports the same list at
runtime, if you want to validate a name programmatically). If you're not
sure which to pick, try `ease_out` for smooth movement, `bounce` for things
that land, and `spring` for things that pop into place.
