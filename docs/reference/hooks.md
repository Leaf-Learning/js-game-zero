# Hooks And Input Constants

Your game is a set of top-level functions. The runtime calls the ones it
recognizes, in zero-boilerplate mode as plain `function` declarations and in
import mode as properties on the object you pass to `run()`. This page
documents every hook, then the `keys`, `keymods`, and `mouse` constant tables
used by the input hooks.

A hook's arguments are matched **by parameter name**, not by position. The
runtime reads your function's declared parameter names and passes only the
values it has for those names, in whatever order you wrote them. That means
`function on_key_down(mod, key) {}` receives `mod` and `key` correctly even
though the "natural" order is `key, mod`. It also means a typo in a parameter
name silently gets `undefined` instead of the value you wanted — name your
parameters exactly as shown below.

## draw()

```ts
function draw(): void;
```

Called once per animation frame after `update` and after any pending assets
have loaded. `draw` must not declare any parameters — `run()` throws a
`TypeError` at startup if it does, since a `draw(dt)` typo (mixing it up with
`update`) is a common beginner mistake worth catching immediately.

```js
function draw() {
  screen.fill("#0f172a");
  screen.draw.filled_circle([160, 90], 40, "gold");
}
```

## update() / update(dt)

```ts
function update(): void;
function update(dt: number): void;
```

Called once per frame, before `draw`. Declare zero parameters if you don't
need frame timing, or one parameter (conventionally named `dt`) to receive the
seconds elapsed since the previous frame — use it to make movement
frame-rate-independent. `dt` is clamped to at most `0.25` seconds so a dropped
frame (e.g. the tab was backgrounded) can't cause a huge jump.

```js
function update(dt) {
  if (keyboard.right) player.x += 200 * dt; // 200 px/sec, any frame rate
}
```

## on_key_down(key, mod, unicode) / on_key_up(key, mod)

```ts
function on_key_down(
  key: number,
  mod: number,
  unicode: string,
  repeat: boolean,
): void;
function on_key_up(key: number, mod: number): void;
```

Fired on `keydown`/`keyup`. Import-mode hook objects may instead use the
camelCase aliases `onKeyDown` / `onKeyUp`.

- `key` — **a numeric key constant from `keys`**, not a string. This is the
  single most common mistake when porting from other frameworks: compare it
  with `key === keys.LEFT`, never `key === "left"` or `key === "ArrowLeft"`.
- `mod` — a bitmask of currently-held modifier keys from `keymods` (see
  below). Test a specific modifier with `mod & keymods.SHIFT`.
- `unicode` — the typed character as a one-character string (`""` for
  non-printable keys like arrows or function keys).
- `repeat` — `true` if this event is an OS-generated key-repeat while the key
  is held down, rather than the initial press. Only available on
  `on_key_down` (declare it as a fourth parameter if you need it).

```js
function on_key_down(key, mod) {
  if (key === keys.SPACE) jump();
  if (key === keys.R && mod & keymods.CTRL) restartLevel();
}
```

`keyboard.left`, `keyboard.a`, and similar boolean properties (see below) are
usually a better fit for continuous movement inside `update`; use
`on_key_down`/`on_key_up` for one-shot actions like jumping or firing.

## on_mouse_down(pos, button) / on_mouse_up(pos, button)

```ts
function on_mouse_down(pos: [number, number], button: number): void;
function on_mouse_up(pos: [number, number], button: number): void;
```

Fired on `mousedown`/`mouseup`, and also for **wheel scroll**: a wheel event
is reported as `on_mouse_down` with `button` set to `mouse.WHEEL_UP` or
`mouse.WHEEL_DOWN` (matching pygame's convention of treating the scroll wheel
as buttons 4 and 5, rather than a separate event). There is no
`on_mouse_wheel` hook — check `button` inside `on_mouse_down` instead. Import
mode aliases: `onMouseDown` / `onMouseUp`.

```js
function on_mouse_down(pos, button) {
  if (button === mouse.LEFT) fireAt(pos);
  if (button === mouse.WHEEL_UP) zoom += 1;
  if (button === mouse.WHEEL_DOWN) zoom -= 1;
}
```

## on_mouse_move(pos, rel, buttons)

```ts
function on_mouse_move(
  pos: [number, number],
  rel: [number, number],
  buttons: Set<number>,
): void;
```

Fired on `mousemove`. `rel` is the movement since the previous event (from
the browser's `movementX`/`movementY` when available). `buttons` is a `Set`
of currently held mouse buttons (`mouse.LEFT`, `mouse.MIDDLE`, `mouse.RIGHT`)
— check membership with `buttons.has(mouse.LEFT)`. Import mode alias:
`onMouseMove`.

## on_music_end()

```ts
function on_music_end(): void;
```

Fired once the active `music` track (and any queued tracks) finish playing
with nothing left to play. Import mode alias: `onMusicEnd`.

## Duplicate hooks

If you define both the snake_case and camelCase form of the same hook (e.g.
`on_key_down` and `onKeyDown`) the runtime emits a diagnostic warning and
runs the snake_case one; `draw` and `update` have no camelCase alias.

## `keyboard`

`keyboard` is a live object of boolean properties reflecting which keys are
currently held down, keyed by lowercase key name (`keyboard.left`,
`keyboard.space`, `keyboard.a`, `keyboard.k_1` for the digit keys). Read it
inside `update()` for continuous movement:

```js
function update(dt) {
  if (keyboard.left) player.x -= 150 * dt;
  if (keyboard.right) player.x += 150 * dt;
}
```

Accessing an attribute that isn't a real key name throws an error (`The key
"..." does not exist`) instead of silently returning `false` — this catches
typos like `keyboard.lfet` immediately rather than letting your character
quietly fail to move. `keyboard.pressed()` returns a sorted array of every
currently-held key constant, for debugging.

## `keys`

Numeric key constants, one property per key. The full set includes:

| Category                   | Names                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Letters                    | `keys.A` … `keys.Z`                                                                                                                                                                 |
| Digits                     | `keys.K_0` … `keys.K_9`                                                                                                                                                             |
| Arrows                     | `keys.UP`, `keys.DOWN`, `keys.LEFT`, `keys.RIGHT`                                                                                                                                   |
| Editing                    | `keys.BACKSPACE`, `keys.TAB`, `keys.RETURN` (alias `keys.ENTER`), `keys.DELETE`, `keys.ESCAPE`, `keys.SPACE`                                                                        |
| Function keys              | `keys.F1` … `keys.F15`                                                                                                                                                              |
| Navigation                 | `keys.HOME`, `keys.END`, `keys.PAGEUP`, `keys.PAGEDOWN`, `keys.INSERT`                                                                                                              |
| Modifiers (as key presses) | `keys.LSHIFT`, `keys.RSHIFT`, `keys.LCTRL`, `keys.RCTRL`, `keys.LALT`, `keys.RALT`, `keys.LMETA`, `keys.RMETA`                                                                      |
| Numpad                     | `keys.KP0` … `keys.KP9`, `keys.KP_PERIOD`, `keys.KP_DIVIDE`, `keys.KP_MULTIPLY`, `keys.KP_MINUS`, `keys.KP_PLUS`, `keys.KP_ENTER`, `keys.KP_EQUALS`                                 |
| Punctuation                | `keys.MINUS`, `keys.EQUALS`, `keys.LEFTBRACKET`, `keys.RIGHTBRACKET`, `keys.BACKSLASH`, `keys.SEMICOLON`, `keys.QUOTE`, `keys.BACKQUOTE`, `keys.COMMA`, `keys.PERIOD`, `keys.SLASH` |
| Locks                      | `keys.CAPSLOCK`, `keys.NUMLOCK`, `keys.SCROLLOCK`                                                                                                                                   |

The values are arbitrary integers (matching SDL/pygame's numbering) — never
hardcode them, always compare against the named constant.

## `keymods`

A bitmask of held modifier keys, combined with `|` and tested with `&`:

| Constant                            | Meaning                                   |
| ----------------------------------- | ----------------------------------------- |
| `keymods.NONE`                      | No modifier held                          |
| `keymods.SHIFT`                     | Either Shift key (`LSHIFT \| RSHIFT`)     |
| `keymods.CTRL`                      | Either Control key (`LCTRL \| RCTRL`)     |
| `keymods.ALT`                       | Either Alt/Option key (`LALT \| RALT`)    |
| `keymods.META`                      | Either Cmd/Windows key (`LMETA \| RMETA`) |
| `keymods.LSHIFT` / `keymods.RSHIFT` | Left/right Shift specifically             |
| `keymods.LCTRL` / `keymods.RCTRL`   | Left/right Control specifically           |
| `keymods.LALT` / `keymods.RALT`     | Left/right Alt specifically               |
| `keymods.LMETA` / `keymods.RMETA`   | Left/right Cmd/Windows specifically       |
| `keymods.CAPS`                      | Caps Lock is toggled on                   |
| `keymods.NUM`                       | Num Lock is toggled on                    |
| `keymods.MODE`                      | AltGr / alternate-graphics modifier       |

```js
function on_key_down(key, mod) {
  if (mod & keymods.SHIFT) console.log("shift-modified key");
}
```

## `mouse`

| Constant           | Value | Meaning                                                |
| ------------------ | ----- | ------------------------------------------------------ |
| `mouse.LEFT`       | 1     | Left mouse button                                      |
| `mouse.MIDDLE`     | 2     | Middle mouse button (wheel click)                      |
| `mouse.RIGHT`      | 3     | Right mouse button                                     |
| `mouse.WHEEL_UP`   | 4     | Scroll wheel moved up (reported via `on_mouse_down`)   |
| `mouse.WHEEL_DOWN` | 5     | Scroll wheel moved down (reported via `on_mouse_down`) |
