# Changelog

All notable changes to `js-game-zero` are recorded here.

## Unreleased

### What a frame drew

- A game inspector reads `$drawn`: what the game's last `draw()` drew, in
  order, each thing with its kind (`fill`, `image`, `actor`, `circle`,
  `rect`, `polygon`, `line`, `text`, `clear`) and what it is and where. The
  CLI's `inspect` reads it too, so a check that something is on the screen
  can read what the game drew instead of adding state of its own or reading
  the canvas.

### Syntax error lines

- A syntax error in a game names its line in Chrome and other V8 browsers,
  which give no position for compiled game code. It's the first line whose
  part of the source fails the same way: a missing `)` is placed on the line
  it's missing from, and a block left open on the line it opens on.
- A name the game never defined names its line in Safari too, where the error,
  thrown in the game's scope, has no game frame: it's the one line that reads
  the name, when only one does.

### Error lines in Safari

- A game's error names its line in Safari and other JavaScriptCore browsers,
  as it does in Chrome and Firefox. JavaScriptCore gives no place in the stack
  for `new Function` code, so the line comes from the error's own `line`,
  calibrated the same way, and only for errors thrown in the game's code.

### Driving a game from a host page

- `run()` takes `seed`, a string or number that makes a game's randomness
  repeatable: a zero-boilerplate game's `Math.random`, and `randomInt` and
  `randomChoice`, follow one sequence, the one `jgz test --seed` gives. It is
  the game's own: the page's `Math.random` and other games on the page keep
  theirs. The CLI now seeds through this option instead of replacing the
  page's `Math.random`, so the CLI and a host page agree by construction.
- The script-tag build (`window.JGZ`) carries `getGameInspector`,
  `serializeGameValue`, `parseStatePath` and `createSeededRandom`, so a page
  can step a game, send it input and read its state the way the CLI does.
- A game inspector's `read(path)` takes state paths (`fish[0].y`), and its new
  `inspect(path?)` returns values exactly as `jgz`'s `inspect` reports them.
  The value serialiser and the path reader moved from the CLI into
  `@js-game-zero/core/host`, so both share one implementation.
- `run()` takes `mouseReleaseTarget`, where `mouseup` is heard (default
  `window`), so a game a host drives off-screen gets releases no other game
  hears.

### Touch controls you can style

- The D-pad is one joined cross with drawn arrows when a game uses three or
  four directions; left and right alone (or up and down) are two separate
  keys. A held key moves onto its shadow when it has one.
- In portrait, a game with no A or B puts Start/Select on the right of the
  D-pad instead of beneath it.
- A host page styles the dock with `--jgz-*` CSS custom properties: key
  size, fill, ink, outline, held colors, shadow, corners, fonts, Start/Select
  size and the least gap above the dock. Without them the dock looks as it
  did, in the new shapes.

### Assets without a server

- `run()` takes `assetUrls`, a map from each asset's path
  (`images/cat.svg`) to a URL such as a data URL, so a page can run a game
  with no asset server and no network. With a map, assets load only from
  it; one it doesn't list is a `MissingAssetError`, with nothing requested.
  Loaders built with `createAssetLoaders({ assetUrls })` or the single
  factories take it too, and expose it as `loader.assetUrls`.
- Sounds, music and fonts given as `data:` URLs are decoded in the page
  instead of fetched, so they work under a content security policy that
  allows no connections.

### Names are camelCase

- **Breaking:** snake_case names are gone, a breaking change made before
  the first published release. Every library name has one spelling, its
  camelCase one: hooks (`onKeyDown`, `onKeyUp`, `onMouseDown`, `onMouseUp`,
  `onMouseMove`, `onMusicEnd`), helpers (`randomInt`, `randomChoice`), and
  every method, property and option (`screen.draw.filledCircle`,
  `actor.angleTo`, `rect.moveIp`, `clock.scheduleInterval`,
  `music.setVolume`, `images.cacheKeys`, `onFinished`, `outlineColor`).
  Pygame Zero's run-together names become camelCase too (`collideRect`,
  `collidePoint`, `topLeft`, `midBottom`, `centerX`, `unionAll`, `fadeOut`,
  `setDefault`), as do the tween names (`bounceEnd`, `accelDecel`,
  `inOutElastic`) and the text anchors (`anchor: "topLeft"`). One-word and
  run-together names with no camelCase spelling keep theirs (`blit`,
  `unschedule`, `fontsize`, `owidth`).
- Constants stay upper case, as is usual in JavaScript: `WIDTH`, `HEIGHT`,
  `TITLE`, `ICON`, `PIXEL_DENSITY`, `TOUCH_CONTROLS`, `keys.LEFT`,
  `keys.KP_ENTER`, `mouse.WHEEL_UP`, `keymods.SHIFT`, `DEFAULT_TONE_VOLUME`.
- Another spelling fails where it's written, naming the real name: reading
  or setting `actor.angle_to`, `rect.colliderect` or `storage.setdefault`
  throws `actor.angle_to doesn't exist. Did you mean actor.angleTo?`; a
  service member such as `screen.draw.filled_circle` or `keys.space` throws
  the same way; `random_int` is not defined (`Did you mean randomInt?`); a
  snake_case tween suggests its camelCase name; and an asset loader names its
  method (`images.cache_keys`) instead of loading an image by that name.
- A hook defined under another spelling, such as `function on_mouse_down`,
  is never called, and gets a `hook-typo` warning saying so:
  `on_mouse_down is never called. Hooks are named in camelCase, so rename it
to onMouseDown.` The `duplicate-hook-alias` diagnostic is gone, since a hook
  can no longer be given two ways.
- Host interfaces follow the same rule: a `SurfaceLike` implements
  `getWidth()`, `getHeight()`, `getSize()` and `getRect()`; a `SoundAsset`
  implements `getLength()`, `setVolume()` and `getVolume()`; asset loaders
  have `unloadAll()` and `cacheKeys()`; and the debug helpers are
  `debugState()`, `debugInstanceCount()` and `debugCurrentElement()`.
- `docs/migrating-from-pgzero.md` lists every Pygame Zero name with its
  js-game-zero spelling.

### Pixel density

- Games are sharp on high-density screens. The canvas holds
  `WIDTH × HEIGHT × density` pixels, where density is the device's
  `devicePixelRatio` from 1 to 3, and the screen scales its drawing to
  match. Text, outlines and SVG Actors no longer look soft on phones.
- Game code stays in logical pixels: drawing calls, text, images, Actors,
  `screen.width`/`height`, `screen.bounds()`, mouse and touch positions and
  hit tests are unchanged. `screen.density` reports the density.
- `PIXEL_DENSITY` in a game file, or as a `RunOptions` option, sets the
  density. A value that isn't a positive number warns and uses the
  device's; a canvas too big for iOS Safari (over 4096² pixels) gets a
  lower density, with a warning when the game asked for more.
- A denser canvas gets its logical CSS width through a zero-specificity
  `:where(canvas[data-jgz-density])` rule, so page CSS still wins. The
  touch-control dock and the sandbox preview fit the canvas by its logical
  size.
- Before each frame the runtime follows changes to `devicePixelRatio`
  (keeping what's drawn), adopts a size a host sets on the canvas as the
  logical size, and restores the density scale after a canvas reset.
- The `jgz` CLI's browser runs at device pixel ratio 1, so games run at
  density 1 there unless they set `PIXEL_DENSITY`. `status` reports the
  logical canvas size with its `density`, and the pixel summary samples a
  grid over the logical screen.

### Short drawing calls

- Short forms take positions as separate numbers instead of `[x, y]`
  lists, so a call fits on a phone-width line:
  `screen.circle(x, y, radius, color)`,
  `screen.rect(x, y, width, height, color)`,
  `screen.triangle(x1, y1, x2, y2, x3, y3, color)` and
  `screen.line(x1, y1, x2, y2, color, width)`. The shapes are filled and
  the color defaults to `"white"`; the outline versions stay under
  `screen.draw`, whose list signatures are unchanged.
- `screen.text(text, x, y, color, size)` draws text from its top-left
  corner, white and 24 tall unless told otherwise, so
  `screen.text("Score: " + score, 20, 30)` fits a phone-width line. It takes
  words in quotes or a number; centering, wrapping and outlines stay under
  `screen.draw.text`.
- A wrong short call explains itself: a list points to the `screen.draw`
  method that takes lists, a missing or non-number argument is named, and an
  extra argument (usually an outline width) points to the outline method.
  `screen.circel` suggests `screen.circle`, and `screen.draw.triangle`
  suggests `screen.triangle`.
- `rgb(red, green, blue, alpha?)` returns the matching color list, so
  `rgb(255, 140, 105)` works anywhere a color does. It's a game-file global
  and package export, checked like a color list, with each missing or
  non-number argument named.

### Helpers

- `randomInt(min, max)` (both ends included), `randomChoice(list)` and
  `clamp(value, min, max)` are game-file globals and package exports, with
  errors that explain a backwards range or an empty list.
- In game files and `defineGame()`, `mouse` also reports the live pointer:
  `mouse.pos`, `mouse.x`, `mouse.y` (the screen center until the mouse
  moves), `mouse.buttons`, and `mouse.down` (true while any button or a
  finger is down), updated by mouse and canvas touch input.
- `Actor` flip-book animation: `images`, `fps` and `loop` (as options or
  properties) cycle pictures on the game clock, with `frame` and `finished`
  to follow along. The space shooter's explosions use it in place of 20
  lines of hand-written frame timing.
- New `docs/reference/helpers.md` page; the tutorial, cookbook and examples
  use the helpers instead of hand-written `Math.random`/`Math.max` code.

### Service errors

- In zero-boilerplate games, `screen` (including `screen.draw`), `clock`,
  `music`, `tone`, `keys`, `keymods` and `mouse` throw when a game reads a
  member they don't have,
  `screen.draw.cirlce doesn't exist. Did you mean screen.draw.circle?`,
  instead of failing as `undefined is not a function`. Guesses such as
  `screen.drawRect` or `screen.draw.fillRect` point at the real method.

### Friendlier call shapes

- `screen.draw.text(text, options)` takes its options second when they
  position the text, so `text("Game Over", { center: [x, y] })` replaces the
  `undefined`/`[]` placeholder the examples used to need.
- Readable text option names alongside Pygame Zero's: `size` (`fontsize`),
  `outline` (`owidth`), `outlineColor` (`ocolor`), `shadowColor`
  (`scolor`), `gradientColor` (`gcolor`) and, for textboxes, `minSize`
  (`minFontsize`). Giving both names for one option is an error.
- `actor.touches(target)` and `rect.touches(target)` test overlap with an
  actor, a rect, or an `[x, y]` point in one method.
- `screen.draw.image(image, pos)` is a readable name for `screen.blit`.
- `sound.loop()` plays a sound until `stop()`; a bad `loops` count now
  explains that it counts extra plays. `SoundAsset` implementations gain a
  `loop()` member (lazy sounds fall back to `play(-1)` for host assets
  without one).
- `music.position` reads and seeks the current track in seconds, avoiding
  the milliseconds/seconds mismatch between `getPos()` and `setPos()`.
- Tween aliases `easeIn`, `easeOut`, `easeInOut`, `bounce` and `spring`.
  The tween table describes each curve by what the motion looks like, and
  explains that `endElastic`/`startElastic` (Pygame Zero's `end_elastic`/
  `start_elastic`) name when the wobble happens, not where.
- The tutorial, cookbook and examples use these forms.

### Actor

- `Actor.clampIp(area)` moves the actor so its bounding box fits inside
  `area`; `player.clampIp(screen.bounds())` keeps a player on screen in one
  line. The Rect reference's "keep the player on screen" example, which only
  clamped a copy of the player's rectangle, now shows the working form, and
  the tutorial, cookbook and examples use it in place of hand-written
  `Math.max`/`Math.min` clamps.

### Beginner-facing errors

- A capital letter by mistake on a service, as in `Screen.fill("navy")`,
  reaches the class `Screen` and used to fail as "Screen.fill is not a
  function". Reading one of a service's members on its class (`Screen`,
  `Clock`, `Storage`) now says which name was meant: "Screen.fill doesn't
  exist. Did you mean screen.fill?".
- A clock schedule given something other than a function, as in
  `clock.scheduleInterval(spawn(), 1)`, throws where it's written, saying to
  drop the brackets and naming the call used, instead of failing a second
  later as "event.callback is not a function".
- Reading an undefined name in a game file now throws a `ReferenceError`
  with a suggestion (`scren is not defined. Did you mean screen?`) instead of
  failing later as "undefined is not an object". `typeof` checks and the
  runtime's own reads of optional hooks and settings are unaffected.
- Browser APIs games can't reach (`setTimeout`, `setInterval`, `alert`,
  `document`, `window`, `localStorage`, `Image`, `Audio`, ...) fail with a
  hint naming the js-game-zero equivalent. `isNaN`, `isFinite`, `Symbol`,
  `BigInt`, `Intl`, `WeakMap`, `WeakSet` and the URI helpers are now
  available to game code.
- A hook parameter that isn't one of the documented names now receives the
  next unclaimed value by position (`onKeyDown(k)` gets the key) instead of
  `undefined`, and a new `hook-parameter` warning says which value it gets.
- Colors are validated: a misspelled name throws with a suggestion
  (`"lightblu"` → `"lightblue"`), malformed hex codes are rejected, and a
  fractional tuple alpha (`[255, 0, 0, 0.5]`) explains the 0–255 range
  instead of drawing an almost invisible color.
- `screen.draw.text`, `screen.draw.textbox`, `tone`, and `Actor` reject
  options they don't have, naming the closest real one; `animate()` suggests
  the option or property a misspelled key was meant to be.

## 0.1.3 — 2026-09-07

### Diagnostics

- Hook/constant typo diagnostics only consider top-level definitions and use
  a length-aware distance, so ordinary names like `row` or `dogW` are never
  flagged. Only a top-level function (`function drow()`, `const udpate = () =>
{}`) is checked against hook names, only a top-level assignment against
  `WIDTH`/`HEIGHT`/`TITLE`/`ICON`, names shorter than six characters get one
  edit of slack instead of two (a transposition counts as one), and a name
  whose correct spelling is also defined (`draw` alongside `drawn`) is left
  alone. Strings, comments, template literals and regex literals are skipped
  by a small tokenizer instead of a regex strip.

## 0.1.2 — 2026-09-07

### Actor

- `Actor.scale`, and `width`/`height` as setters (and as constructor
  options), draw a sprite at a chosen size while keeping its proportions.
  The hitbox and every position property follow the drawn size, the
  anchored position stays put when the size changes, and a size requested
  before the image loads is applied when it arrives. `inflate_ip` still
  changes only the hitbox.

## 0.1.1 — 2026-09-06

### Diagnostics

- `runtime-error` diagnostics and `handle.failure` now carry `line`, the
  1-based source line the game threw from (calibrated against the source
  wrapper, so it holds across engines). Hosts can point straight at the
  failing line instead of showing "update failed: …" with no location.

### Reliability

- Sandbox saves now validate server responses, serialize/coalesce writes,
  preserve dirty content after failure, and block navigation/play/destructive
  actions until acknowledged. Project writes are atomic and example clones are
  staged before publication.
- Runtime failures now have deterministic phase-tagged lifecycle semantics,
  awaited disposal, per-run asset/storage/input/audio isolation, and reliable
  startup/late-asset cleanup. Music loads are generation-cancelable, storage
  initializes through one sync or async path, and input state clears on focus
  loss/outside release.
- Learner previews now run on a separate read-only origin with validated
  cross-window messages and narrowly scoped asset/source access.

### API and packaging

- Added the typed `defineGame()` API and expanded `GameHandle` with
  `state`, `failure`, `done`, `dispose()`, and `restart()`.
- Added compiled ESM/declaration packages plus explicit
  `@js-game-zero/core/host` and `@js-game-zero/core/node` entry points.
  Browser-runtime ESM is now a small core facade; only its IIFE bundles core.
- Curated and locked public export manifests. Browser-safe advanced root
  imports remain as deprecated compatibility aliases through 0.2.

### Verification

- Added deterministic sandbox client/runtime race and cleanup tests, packed
  consumer type/import checks, Chromium ESM/IIFE smoke tests, bundle budgets,
  Node-builtin rejection, and per-subsystem coverage gates.
- CI now rejects focused and flaky Playwright tests while retaining one retry
  for trace collection.

## 0.1.0 — Initial release

The first complete release of `js-game-zero`: a Pygame Zero-inspired,
zero-boilerplate JavaScript game framework for the browser, plus a local
sandbox for learners to write and play games without any build tooling.

### Framework (`packages/core`, `packages/browser-runtime`)

- Zero-boilerplate and explicit import entry points via `run()`, with
  snake_case hooks (`draw`, `update`, `on_key_down`, `on_mouse_down`,
  `on_mouse_up`, `on_mouse_move`, `on_music_end`, ...) and camelCase
  aliases in import mode.
- `Actor`: image loading, all pgzero position keywords, anchor points,
  rotation, opacity, and full `Rect`-delegated collision/geometry methods.
- `Rect`/`ZRect`: pygame-style geometry, half-open collision bounds, set
  operations (`clamp`, `clip`, `union`, `unionall`, and their `_ip`
  variants), `collidedict`/`collidedictall`, index access, and iteration.
- `Screen`/`screen.draw`: shape primitives (line, circle, polygon, rect,
  filled variants) and a ptext-parity `text`/`textbox` implementation with
  wrapping, alignment, outlines, shadows, gradients, bold/italic/underline,
  custom and system fonts, and scalar/named/anchor positioning.
- Input: `keyboard`, `keys`, `keymods` (including `NONE`), `mouse`
  (including wheel-as-buttons), hook-argument dispatch by parameter name,
  and a hard error on unknown `keyboard.*` attribute access.
- `clock`: one-shot/interval/unique scheduling, per-tick callbacks,
  `clear()`, and per-callback exception guarding so one broken timer can't
  take down the frame loop.
- `animate()`: 13 named tween curves, options-object target properties,
  and safe replacement of in-flight animations on the same property.
- Audio: overlapping sound playback (pygame-style channel mixing), one-track
  `music` with queueing, fadeout, `rewind`, `get_pos`/`set_pos`, and
  generated `tone`s with a 0.8 default volume, a 4-second duration cap, and
  `sin`/`saw` waveform aliases.
- `storage`: JSON persistence with automatic load-before-startup and
  debounced auto-save, browser `localStorage` and sandbox file-backed
  adapters, and dict-like proxy access.
- Asset loaders for images, sounds, music, and fonts, with a shared naming
  grammar, lazy property-style access, and a startup "preload gate" so the
  first frame never shows a half-loaded asset.

### Sandbox (`apps/sandbox`)

- A Bun-backed local server and browser UI: project creation (blank or
  cloned from an example), a CodeMirror editor with autosave, an asset
  panel with drag-and-drop upload, Play/Stop/Restart controls, a live
  preview with a keyboard-focus overlay, and a Console/Problems panel.
- An example gallery backed by `examples/manifest.ts`.
- Path-safety hardening against traversal, absolute paths, encoded escapes,
  and symlink escapes across every project/file/asset route.

### Examples

- Drawing Basics, Actor Movement, Sound And Tone, Animation Basics,
  Storage Save, and Sandbox Starter — plus two complete arcade games,
  Flappy Bird and Breakout.

### Documentation

- A full learner-facing documentation layer: a real step-by-step tutorial,
  a task-oriented cookbook, a per-symbol API reference under
  `docs/reference/`, a sandbox UI guide, an examples gallery page, and a
  Pygame Zero migration guide for teachers.
