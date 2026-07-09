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

| Name               | Feel                                                |
| ------------------ | --------------------------------------------------- |
| `linear`           | Constant speed.                                     |
| `accelerate`       | Starts slow, speeds up.                             |
| `decelerate`       | Starts fast, eases to a stop.                       |
| `accel_decel`      | Eases in, then eases out.                           |
| `in_elastic`       | Overshoots at the start, like a pulled rubber band. |
| `out_elastic`      | Overshoots at the end and settles.                  |
| `in_out_elastic`   | Elastic overshoot at both ends.                     |
| `bounce_end`       | Bounces to a stop, like a dropped ball.             |
| `bounce_start`     | Bounces at the start instead of the end.            |
| `bounce_start_end` | Bounces at both ends.                               |
| `end_elastic`      | Alias of `in_elastic`.                              |
| `start_elastic`    | Alias of `out_elastic`.                             |
| `both_elastic`     | Alias of `in_out_elastic`.                          |

That's all 13 names `tween` accepts (`tweenNames` exports the same list at
runtime, if you want to validate a name programmatically).
