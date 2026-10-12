# Hooks And Input Constants

Your game is a set of top-level functions. The runtime calls the ones it
recognizes, in zero-boilerplate mode as plain `function` declarations and in
import mode as properties on the object you pass to `run()`. This page
documents every hook, then the `keys`, `keymods`, and `mouse` constant tables
used by the input hooks.

Hook names are camelCase (`onKeyDown`, `onMouseDown`, ...), and work the
same way in both modes. (A game made with `defineGame()` is the exception:
its input hooks receive one event object — see [`runtime.md`](runtime.md).)
A hook spelled another way, such as Pygame Zero's `on_key_down`, is never
called; the runtime warns about it with a `hook-typo` diagnostic that names
the camelCase hook to rename it to.

A hook's arguments are matched **by parameter name** first. The runtime reads
your function's declared parameter names and passes the value with that name,
in whatever order you wrote them. That means
`function onKeyDown(mod, key) {}` receives `mod` and `key` correctly even
though the "natural" order is `key, mod`.

A parameter with any other name receives the next value in the hook's
documented order that isn't already taken by name, just like an ordinary
JavaScript function: `function onKeyDown(k) {}` gets the key, and
`function onMouseDown(position) {}` gets `pos`. The runtime adds a
`hook-parameter` warning saying which value such a parameter receives, since
`onMouseDown(btn)` gets the position, not the button. Name your parameters
as shown below to avoid the warning.

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
  screen.draw.filledCircle([160, 90], 40, "gold");
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

## onKeyDown(key, mod, unicode) / onKeyUp(key, mod)

```ts
function onKeyDown(
  key: number,
  mod: number,
  unicode: string,
  repeat: boolean,
): void;
function onKeyUp(key: number, mod: number): void;
```

Fired on `keydown`/`keyup`.

- `key` — **a numeric key constant from `keys`**, not a string. This is the
  single most common mistake when porting from other frameworks: compare it
  with `key === keys.LEFT`, never `key === "left"` or `key === "ArrowLeft"`.
- `mod` — a bitmask of currently-held modifier keys from `keymods` (see
  below). Test a specific modifier with `mod & keymods.SHIFT`.
- `unicode` — the typed character as a one-character string (`""` for
  non-printable keys like arrows or function keys).
- `repeat` — `true` if this event is an OS-generated key-repeat while the key
  is held down, rather than the initial press. Only available on
  `onKeyDown` (declare it as a fourth parameter if you need it).

```js
function onKeyDown(key, mod) {
  if (key === keys.SPACE) jump();
  if (key === keys.R && mod & keymods.CTRL) restartLevel();
}
```

`keyboard.left`, `keyboard.a`, and similar boolean properties (see below) are
usually a better fit for continuous movement inside `update`; use
`onKeyDown`/`onKeyUp` for one-shot actions like jumping or firing.

## Touch controls

Set `TOUCH_CONTROLS` near `WIDTH` and `HEIGHT` to add controls below your
game on phones, tablets, and computers with touch input. The runtime fits
the canvas into the space above the controls, preserving its aspect ratio
and logical `WIDTH`/`HEIGHT`. Keyboard code works with these buttons too:

```js
TOUCH_CONTROLS = {
  left: keys.LEFT,
  right: keys.RIGHT,
  a: keys.SPACE,
  start: keys.RETURN,
};
```

In portrait mode, the dock places the D-pad on the left and the action
buttons on the right, with Start/Select beneath them. A sits above and to
the right of B in a Game Boy-style diagonal arrangement. The dock stays
below the canvas in both portrait and landscape layouts, near the bottom
of the game's viewport. In portrait, the canvas is centered vertically with
at least 48px above the control dock. On shorter screens it moves upward as
needed to keep the game and controls visible. Landscape keeps a 16px gap.
Bottom padding keeps buttons clear of the device's home indicator.

Only the buttons you list appear. Supported names are `up`, `down`, `left`,
`right`, `a`, `b`, `start`, and `select`. Each value must be a numeric
constant from `keys`; the button's label is independent of its mapped key.
For example, `a: keys.SPACE` makes A trigger a game's existing Space action.
Omitting `TOUCH_CONTROLS`, or setting it to `false`, hides the controls.

`TOUCH_CONTROLS = true` enables this full preset:

| Button                   | Mapped key                                           |
| ------------------------ | ---------------------------------------------------- |
| Up / Down / Left / Right | `keys.UP` / `keys.DOWN` / `keys.LEFT` / `keys.RIGHT` |
| A                        | `keys.SPACE`                                         |
| B                        | `keys.X`                                             |
| Start                    | `keys.RETURN`                                        |
| Select                   | `keys.ESCAPE`                                        |

The default `show: "auto"` displays controls when the browser reports touch
support or a coarse pointing device. Add `show: "always"` to a mapping to
preview them on desktop. These are native buttons, so mouse clicks and
Tab followed by Space or Enter work as well.

Holding a button updates `keyboard` and fires `onKeyDown` once; releasing
it fires `onKeyUp`. Virtual presses have `mod: keymods.NONE`,
`unicode: ""`, and `repeat: false`; use `update(dt)` for repeated actions.
Multiple fingers can hold directions and action buttons together. Slide a
finger across the D-pad to change direction. Each mapped key stays held
until every touch button and physical key holding it has
been released. Cancellation, loss of pointer capture, leaving the window,
and hiding the page clear held inputs. Stopping or reloading a game removes
its controls and listeners.

In import mode, put `TOUCH_CONTROLS` on the module returned by `defineGame`,
on a raw game module, or in the options passed to `run`. TypeScript exports
`TouchButton`, `TouchControlsConfig`, and `TouchControlsOptions`.

### Tapping and dragging the canvas

Canvas touch and pen input work even without a control dock. A primary
touch triggers `onMouseDown`, dragging triggers `onMouseMove` with
`mouse.LEFT` in `buttons`, and releasing or cancelling triggers
`onMouseUp`. Positions and movement are converted to logical game
coordinates when the canvas is scaled. The pointer remains captured when
it leaves the canvas; extra canvas touches are ignored until the first is
released. Touch buttons do not trigger canvas mouse hooks.

The canvas and control buttons disable native touch panning during play;
the surrounding page retains its normal gestures. Games can therefore use
tap-to-flap or drag-to-steer without adding separate touch hooks.

For embedding, give each canvas a parent with a defined height. While the
dock is visible, the runtime groups the canvas and controls into a column
that fills the available space, anchors controls at the bottom, and centers
the portrait canvas when space permits. It accounts for visible siblings,
padding, and row gaps, and restores the original canvas placement when the
dock is hidden or the game stops.
The sandbox preview handles this automatically.

## onMouseDown(pos, button) / onMouseUp(pos, button)

```ts
function onMouseDown(pos: [number, number], button: number): void;
function onMouseUp(pos: [number, number], button: number): void;
```

Fired on `mousedown`/`mouseup`, and also for **wheel scroll**: a wheel event
is reported as `onMouseDown` with `button` set to `mouse.WHEEL_UP` or
`mouse.WHEEL_DOWN` (matching pygame's convention of treating the scroll wheel
as buttons 4 and 5, rather than a separate event). There is no
`onMouseWheel` hook — check `button` inside `onMouseDown` instead.

```js
function onMouseDown(pos, button) {
  if (button === mouse.LEFT) fireAt(pos);
  if (button === mouse.WHEEL_UP) zoom += 1;
  if (button === mouse.WHEEL_DOWN) zoom -= 1;
}
```

## onMouseMove(pos, rel, buttons)

```ts
function onMouseMove(
  pos: [number, number],
  rel: [number, number],
  buttons: Set<number>,
): void;
```

Fired on `mousemove`. `rel` is the movement since the previous event (from
the browser's `movementX`/`movementY` when available). `buttons` is a `Set`
of currently held mouse buttons (`mouse.LEFT`, `mouse.MIDDLE`, `mouse.RIGHT`)
— check membership with `buttons.has(mouse.LEFT)`.

## onMusicEnd()

```ts
function onMusicEnd(): void;
```

Fired once the active `music` track (and any queued tracks) finish playing
with nothing left to play.

## `keyboard`

`keyboard` is a live object of boolean properties reflecting which keys are
currently held down, one for each key in `keys` under the same name in any
capitalization (`keyboard.left`, `keyboard.space`, `keyboard.a`, and
`keyboard.K_1` for the digit keys). Read it inside `update()` for continuous
movement:

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
hardcode them, always compare against the named constant. Constants are
upper case. In a game file, any other spelling such as `keys.space` or
`keys.SPCE` throws with a suggestion (`Did you mean keys.SPACE?`) instead of
quietly comparing against `undefined`. The same goes for `keymods` and
`mouse`.

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
function onKeyDown(key, mod) {
  if (mod & keymods.SHIFT) console.log("shift-modified key");
}
```

## `mouse`

In a game file, `mouse` also says where the mouse is right now, for code in
`update()` that follows or aims at it — the way `keyboard` does for keys:

| Property        | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `mouse.pos`     | `[x, y]` of the mouse (or a finger) over the game. The center until it moves. |
| `mouse.x`       | The same `x`.                                                                 |
| `mouse.y`       | The same `y`.                                                                 |
| `mouse.buttons` | A `Set` of buttons held now: `mouse.buttons.has(mouse.LEFT)`.                 |
| `mouse.down`    | `true` while any button, or a finger, is down.                                |

```js
function update(dt) {
  ship.angle = ship.angleTo(mouse.pos); // aim at the mouse
}
```

Button constants:

| Constant           | Value | Meaning                                              |
| ------------------ | ----- | ---------------------------------------------------- |
| `mouse.LEFT`       | 1     | Left mouse button                                    |
| `mouse.MIDDLE`     | 2     | Middle mouse button (wheel click)                    |
| `mouse.RIGHT`      | 3     | Right mouse button                                   |
| `mouse.WHEEL_UP`   | 4     | Scroll wheel moved up (reported via `onMouseDown`)   |
| `mouse.WHEEL_DOWN` | 5     | Scroll wheel moved down (reported via `onMouseDown`) |
