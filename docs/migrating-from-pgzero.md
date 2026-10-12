# Migrating From Pygame Zero

A cheat sheet for teachers and students moving between
[Pygame Zero](https://github.com/lordmauve/pgzero) (Python) and
`js-game-zero` (JavaScript). The two frameworks share the same
beginner-friendly model — top-level `draw`/`update` functions, injected
globals, `Actor`, `keyboard`, `clock`, `storage` — on purpose, so most of
what a Pygame Zero student already knows carries over directly. This page
covers syntax translation first, then API equivalences, then the handful of
places where behavior genuinely differs and why.

## Syntax mapping

| Python (Pygame Zero)                              | JavaScript (js-game-zero)                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `def draw():`                                     | `function draw() {}`                                                                                 |
| `def update(dt):`                                 | `function update(dt) {}`                                                                             |
| `x = 1`                                           | `let x = 1;` (or `const` if it never changes)                                                        |
| `# comment`                                       | `// comment`                                                                                         |
| `if x:` / `elif y:` / `else:`                     | `if (x) {}` / `else if (y) {}` / `else {}`                                                           |
| `and` / `or` / `not`                              | `&&` / `\|\|` / `!`                                                                                  |
| `True` / `False` / `None`                         | `true` / `false` / `null` (or `undefined`)                                                           |
| `f"score: {score}"`                               | `` `score: ${score}` ``                                                                              |
| `for i in range(10):`                             | `for (let i = 0; i < 10; i += 1) {}`                                                                 |
| `for item in items:`                              | `for (const item of items) {}`                                                                       |
| `[1, 2, 3]`                                       | `[1, 2, 3]`                                                                                          |
| `{"key": "value"}`                                | `{ key: "value" }` (or a `Map` if keys aren't fixed strings)                                         |
| `class Foo:` / `self.x`                           | `class Foo {}` / `this.x`                                                                            |
| `import pgzero.actor` (implicit, unused directly) | nothing needed in zero-boilerplate mode; `import { Actor } from "@js-game-zero/core"` in import mode |
| Statement blocks via indentation                  | Statement blocks via `{ }` — indentation is style only, not syntax                                   |
| Every statement ends with a newline               | Statements should end with `;`                                                                       |

Pygame Zero games are _implicitly_ zero-boilerplate — the `pgzrun` launcher
runs your `.py` file with pgzero's globals already injected, and there's no
equivalent of import mode. `js-game-zero` offers both: the sandbox runs your
code the same implicit way (see [`docs/tutorial.md`](tutorial.md)), while
`import { run, ... } from "@js-game-zero/core"` plus `run({ ... })` is
available for anyone who'd rather use ordinary JavaScript modules — see
[`docs/reference/runtime.md`](reference/runtime.md) and the "explicit
imports" recipe in [the cookbook](cookbook.md#use-explicit-imports-no-globals).

## API equivalences

Almost everything keeps its Pygame Zero name, spelled in camelCase the way
JavaScript names usually are: `on_key_down` is `onKeyDown`,
`schedule_interval` is `scheduleInterval`, `colliderect` is `collideRect`.
Constants stay upper case, as in Pygame Zero (`WIDTH`, `keys.SPACE`,
`keymods.SHIFT`, `mouse.LEFT`). Each name has only its camelCase spelling,
but a Pygame Zero spelling fails helpfully rather than quietly:

- Reading or setting a member by its Pygame Zero name throws, naming the
  real one: `actor.angle_to doesn't exist. Did you mean actor.angleTo?`
- A helper by its Pygame Zero name isn't defined:
  `random_int is not defined. Did you mean randomInt?`
- A hook by its Pygame Zero name is never called, so the runtime warns
  (`on_key_down is never called. Hooks are named in camelCase, so rename it
to onKeyDown.`) — see [`docs/reference/hooks.md`](reference/hooks.md).

| Pygame Zero                                                                         | js-game-zero                                                                     | Notes                                                                                                   |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `WIDTH`, `HEIGHT`, `TITLE`                                                          | Same                                                                             | Assign as plain top-level variables.                                                                    |
| `def draw():`                                                                       | `function draw() {}`                                                             | Must take zero parameters in both.                                                                      |
| `def update(dt):`                                                                   | `function update(dt) {}`                                                         | `dt` is seconds in both.                                                                                |
| `def on_key_down(key, mod, unicode):`                                               | `function onKeyDown(key, mod, unicode) {}`                                       | `key`/`mod` are the same kind of numeric constant; see [`docs/reference/hooks.md`](reference/hooks.md). |
| `def on_mouse_down(pos, button):`                                                   | `function onMouseDown(pos, button) {}`                                           | `pos` is a tuple/array either way.                                                                      |
| `keyboard.left`, `keys.SPACE`, `keymods.SHIFT`, `mouse.LEFT`                        | Same names                                                                       | See [`docs/reference/hooks.md`](reference/hooks.md).                                                    |
| `Actor("alien", pos=(0, 0))`                                                        | `new Actor("alien", { pos: [0, 0] })` (or `new Actor("alien", [0, 0])`)          | Position keyword or positional argument; see [`docs/reference/actor.md`](reference/actor.md).           |
| `Rect`, `ZRect`                                                                     | Same names, same methods in camelCase                                            | See "Rect" below.                                                                                       |
| `screen.draw.filled_rect(rect, color)` etc.                                         | `screen.draw.filledRect(rect, color)` etc.                                       | See [`docs/reference/screen.md`](reference/screen.md).                                                  |
| `clock.schedule`, `schedule_interval`, `schedule_unique`, `unschedule`, `each_tick` | `clock.schedule`, `scheduleInterval`, `scheduleUnique`, `unschedule`, `eachTick` | See [`docs/reference/clock.md`](reference/clock.md).                                                    |
| `animate(obj, tween='linear', duration=1, x=300)`                                   | `animate(obj, { tween: "linear", duration: 1, x: 300 })`                         | Python keyword arguments become one options object — see "Animation" below.                             |
| `sounds.eep.play()`, `music.play("theme")`                                          | Same                                                                             | See [`docs/reference/audio.md`](reference/audio.md).                                                    |
| `tone.play('A4', 0.2)`                                                              | Same                                                                             | See "Tone" below for the duration cap.                                                                  |
| `storage["score"]`, `storage.get(...)`                                              | Same, plus `storage.score`                                                       | See "Storage" below.                                                                                    |
| `images.alien`, `sounds.eep`, `music`                                               | Same                                                                             | See [`docs/reference/loaders.md`](reference/loaders.md).                                                |

### Every renamed name

| Pygame Zero                                                                                                                                                                                     | js-game-zero                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hooks: `on_key_down`, `on_key_up`, `on_mouse_down`, `on_mouse_up`, `on_mouse_move`, `on_music_end`                                                                                              | `onKeyDown`, `onKeyUp`, `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMusicEnd`                                                                                  |
| Positions: `topleft`, `topright`, `bottomleft`, `bottomright`, `midtop`, `midleft`, `midright`, `midbottom`, `centerx`, `centery`                                                               | `topLeft`, `topRight`, `bottomLeft`, `bottomRight`, `midTop`, `midLeft`, `midRight`, `midBottom`, `centerX`, `centerY`                                           |
| Collisions: `collidepoint`, `colliderect`, `collidelist`, `collidelistall`, `collidedict`, `collidedictall`                                                                                     | `collidePoint`, `collideRect`, `collideList`, `collideListAll`, `collideDict`, `collideDictAll`                                                                  |
| Rect changes: `move_ip`, `inflate_ip`, `clamp_ip`, `clip_ip`, `union_ip`, `unionall`, `unionall_ip`                                                                                             | `moveIp`, `inflateIp`, `clampIp`, `clipIp`, `unionIp`, `unionAll`, `unionAllIp`                                                                                  |
| Actor: `angle_to`, `distance_to`                                                                                                                                                                | `angleTo`, `distanceTo`                                                                                                                                          |
| Drawing: `screen.draw.filled_circle`, `filled_rect`, `filled_polygon`; the text option `min_fontsize`                                                                                           | `screen.draw.filledCircle`, `filledRect`, `filledPolygon`; `minFontsize`                                                                                         |
| Images: `get_width()`, `get_height()`, `get_size()`, `get_rect()`                                                                                                                               | `getWidth()`, `getHeight()`, `getSize()`, `getRect()`                                                                                                            |
| Sounds: `get_length()`, `set_volume()`, `get_volume()`                                                                                                                                          | `getLength()`, `setVolume()`, `getVolume()`                                                                                                                      |
| Music: `play_once`, `fadeout`, `set_volume`, `get_volume`, `get_pos`, `set_pos`, `is_playing`                                                                                                   | `playOnce`, `fadeOut`, `setVolume`, `getVolume`, `getPos`, `setPos`, `isPlaying`                                                                                 |
| Clock: `schedule_interval`, `schedule_unique`, `each_tick`                                                                                                                                      | `scheduleInterval`, `scheduleUnique`, `eachTick`                                                                                                                 |
| Storage: `setdefault`                                                                                                                                                                           | `setDefault`                                                                                                                                                     |
| Animation: `on_finished`; tweens `accel_decel`, `in_elastic`, `out_elastic`, `in_out_elastic`, `bounce_end`, `bounce_start`, `bounce_start_end`, `end_elastic`, `start_elastic`, `both_elastic` | `onFinished`; `accelDecel`, `inElastic`, `outElastic`, `inOutElastic`, `bounceEnd`, `bounceStart`, `bounceStartEnd`, `endElastic`, `startElastic`, `bothElastic` |

Pygame Zero names that are one word, or run words together with no
camelCase spelling, keep their spelling: `blit`, `unschedule`, `unpause`,
`rewind`, `textbox`, and the text options `fontname`, `sysfontname`,
`fontsize`, `lineheight`, `widthem`, `owidth`, `ocolor`, `scolor` and
`gcolor`.

## Where behavior genuinely differs

These are real differences, not just syntax — verified against this
project's source, not assumptions from the Python API's shape.

- **Animation calls take one options object, not keyword arguments.**
  JavaScript has no equivalent of Python's `**kwargs`, so
  `animate(ship, angle=90, tween='bounce_end')` becomes
  `animate(ship, { angle: 90, tween: "bounceEnd" })` — the tweens are
  otherwise Pygame Zero's same 13 curves, in camelCase (plus friendlier
  names such as `easeOut` and `bounce`). See
  [`docs/reference/clock.md#animation`](reference/clock.md#animation).
- **Generated tones are capped at 4 seconds.** `tone.play(note, duration)`
  throws a `RangeError` if `duration` is greater than `4` (or not greater
  than `0`). `tone` is meant for short blips; use `music` for anything
  longer.
- **Browser audio needs a user gesture, every time, no exceptions.**
  Pygame Zero (a desktop app) can play sound the instant the game starts.
  A browser tab cannot — no sound will be audible until the page has seen a
  click or key press, regardless of what your code does. Design your
  first sound cue to be triggered by player input, not by `draw()` on
  frame one. See the tutorial's [sound and tone
  step](tutorial.md#7-sound-and-tone).
- **`storage` is a proxy object, not a `dict` subclass.** Both support
  `storage["key"]`/`storage.key` and `.get`/`.setdefault`/`.clear` the same
  way Pygame Zero's `storage` does, but this project's `storage` is a class
  instance with real methods (`save`, `load`, `path`, ...) exposed through a
  JavaScript `Proxy` — using one of those method names as your own key (e.g.
  `storage.save = 5`) overwrites the method instead of storing a value. A
  Python dict has no such collision, since `dict` methods live outside `d[k]`
  attribute access. See [`docs/reference/storage.md`](reference/storage.md).
  Saving and loading are also automatic here (see the same page) where
  Pygame Zero's storage is saved explicitly.
- **One `Rect` class, always using floating-point coordinates.** Real
  pygame has a strictly-integer `Rect` and Pygame Zero layers its own
  float-friendly `ZRect` on top to work around that. JavaScript numbers are
  always floating point, so there's no such split here — `Rect` and `ZRect`
  are the exact same class, and neither ever truncates to an integer. If a
  ported script relied on pygame's `Rect` silently truncating coordinates,
  check for that assumption explicitly.
- **No `antialias` option on text.** Pygame Zero's `ptext`-based text
  drawing exposes an `antialias` toggle (inherited from pygame's font
  rendering). This project draws text with the browser's Canvas 2D text
  APIs, which are always antialiased by the browser with no toggle — the
  option doesn't exist here and there's nothing to pass instead.
- **Exceptions are plain JavaScript error types, not Python's hierarchy.**
  Where Pygame Zero might raise `KeyError`, `ValueError`, or `AttributeError`,
  this project raises `TypeError`, `RangeError`, or a small number of named
  `Error` subclasses (`MissingAssetError`, `InvalidAssetNameError`,
  `JsonStorageError`) — catch by checking `error.name` or
  `error instanceof X`, not by assuming a particular built-in type lines up
  one-to-one with its closest Python equivalent.
- **Hook arguments are matched by JavaScript parameter name, via source
  inspection — not Python's `inspect.signature`.** The effect is the same
  (`function onKeyDown(mod, key) {}` gets `mod` and `key` correctly, in
  whatever order you declare them, exactly like Pygame Zero), but the
  mechanism is a lightweight parse of your function's own source text rather
  than true runtime reflection. Ordinary parameter lists work exactly as
  expected; avoid exotic destructuring in a hook's parameter list. Unlike
  Pygame Zero, a parameter with an unfamiliar name isn't an error: it
  receives the next value by position, with a warning.

## Friendlier names you'll see in this project's examples

The tutorial and examples also use a few additions that read more easily
for beginners:

| Pygame Zero's form, in js-game-zero                                         | Also available                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `actor.collideRect(other)`, `actor.collidePoint(pos)`                       | `actor.touches(otherOrPos)`                                       |
| `screen.blit(image, pos)`                                                   | `screen.draw.image(image, pos)`                                   |
| `screen.draw.text(text, pos, { fontsize, owidth, ocolor, scolor, gcolor })` | `size`, `outline`, `outlineColor`, `shadowColor`, `gradientColor` |
| `screen.draw.text("Hi", undefined, { center: [x, y] })`                     | `screen.draw.text("Hi", { center: [x, y] })`                      |
| `sound.play(-1)`                                                            | `sound.loop()`                                                    |
| `music.getPos()` (ms) / `music.setPos(seconds)`                             | `music.position` (seconds, read and write)                        |
