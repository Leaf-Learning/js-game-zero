# Changelog

All notable changes to `js-game-zero` are recorded here.

## Unreleased

### Friendlier call shapes

- `screen.draw.text(text, options)` takes its options second when they
  position the text, so `text("Game Over", { center: [x, y] })` replaces the
  `undefined`/`[]` placeholder the examples used to need.
- Readable text option names alongside Pygame Zero's: `size` (`fontsize`),
  `outline` (`owidth`), `outline_color` (`ocolor`), `shadow_color`
  (`scolor`), `gradient_color` (`gcolor`) and, for textboxes, `min_size`
  (`min_fontsize`). Giving both names for one option is an error.
- `actor.touches(target)` and `rect.touches(target)` test overlap with an
  actor, a rect, or an `[x, y]` point in one method.
- `screen.draw.image(image, pos)` is a readable name for `screen.blit`.
- `sound.loop()` plays a sound until `stop()`; a bad `loops` count now
  explains that it counts extra plays. `SoundAsset` implementations gain a
  `loop()` member (lazy sounds fall back to `play(-1)` for host assets
  without one).
- `music.position` reads and seeks the current track in seconds, avoiding
  the milliseconds/seconds mismatch between `get_pos()` and `set_pos()`.
- Tween aliases `ease_in`, `ease_out`, `ease_in_out`, `bounce` and `spring`.
  The tween table describes each curve by what the motion looks like, and
  explains that Pygame Zero's `end_elastic`/`start_elastic` name when the
  wobble happens, not where.
- The tutorial, cookbook and examples use these forms.

### Actor

- `Actor.clamp_ip(area)` moves the actor so its bounding box fits inside
  `area`; `player.clamp_ip(screen.bounds())` keeps a player on screen in one
  line. The Rect reference's "keep the player on screen" example, which only
  clamped a copy of the player's rectangle, now shows the working form, and
  the tutorial, cookbook and examples use it in place of hand-written
  `Math.max`/`Math.min` clamps.

### Beginner-facing errors

- Reading an undefined name in a game file now throws a `ReferenceError`
  with a suggestion (`scren is not defined. Did you mean screen?`) instead of
  failing later as "undefined is not an object". `typeof` checks and the
  runtime's own reads of optional hooks and settings are unaffected.
- Browser APIs games can't reach (`setTimeout`, `setInterval`, `alert`,
  `document`, `window`, `localStorage`, `Image`, `Audio`, ...) fail with a
  hint naming the js-game-zero equivalent. `isNaN`, `isFinite`, `Symbol`,
  `BigInt`, `Intl`, `WeakMap`, `WeakSet` and the URI helpers are now
  available to game code.
- camelCase input hooks (`onKeyDown`, `onMouseDown`, ...) now run in
  zero-boilerplate game files, not just import mode.
- A hook parameter that isn't one of the documented names now receives the
  next unclaimed value by position (`on_key_down(k)` gets the key) instead of
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
