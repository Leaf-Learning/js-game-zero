# Changelog

All notable changes to `js-game-zero` are recorded here.

## 0.2.1 — 2026-10-26

### Published from GitHub

- This is the first release the release workflow publishes, through npm's
  trusted publishing, so each package carries a provenance statement. The
  packages' code is the same as 0.2.0's.

### The docs

- The README and Getting started show a game in one web page, which loads
  the script-tag build from jsDelivr, so there's nothing to install.
  Getting started says where its problems appear, and how such a page uses
  images and sounds.
- The README links each package's npm page, shows how to install one, and
  has an npm badge. The browser-runtime README's script-tag example loads the
  build from jsDelivr. The runtime reference says where the build is, and that
  only a `diagnostics` callback hears about a page's problems. The cookbook's
  explicit-imports recipe says to install core first.
- The docs check accepts README commands that install this repo's own
  packages.

## 0.2.0 — 2026-10-26

### Ready for npm

- This is the first version on npm. 0.1.0 to 0.1.3 were never published.
- Each package carries its description, repository, author, homepage and
  issue tracker, publishes as public, and has its own README.
- Releases after this one are published from a version tag by GitHub
  Actions, through npm's trusted publishing, and carry a provenance
  statement. `CONTRIBUTING.md` describes the steps.

### New since 0.1.3

- `@js-game-zero/cli`: `jgz test` runs a game in headless Chromium and
  drives it from the terminal or, with `--json`, from another program. It
  steps frames, presses keys, moves and clicks the mouse, reads live state,
  calls a game's probe functions, takes screenshots, and runs a whole
  scenario in one `play` request. `docs/cli.md` covers it.
- `TOUCH_CONTROLS` puts a D-pad and A, B, Start and Select buttons below a
  game on touch screens, each pressing a key the game already reads. The
  hooks reference covers it.
- The Flappy Bird example is now Tappy Plane.

### A logo, and a sandbox made for beginners

- js-game-zero has a logo: a ball in flight over a hill, seen through a
  rounded window. It heads the README, the package READMEs, the sandbox and
  its documentation, and is the sandbox's tab icon. `docs/media` has the
  mark and a light and a dark lockup with the wordmark.
- The sandbox is redesigned, with the game at the center:
  - A first screen for when there are no games yet: remix one of three
    first examples, or make a blank game.
  - The example gallery shows a picture of each game, groups them into
    **Start here**, **Try next** and **Full games**, and says whether each
    plays with the keyboard, the mouse, or by itself.
  - **My game** in the top bar switches, renames and deletes games, and
    makes new ones. Code files are tabs above the editor.
  - A bar down the left opens panels for the game's images, sounds, music
    and fonts, each saying how to use one in code and flagging a name that
    can't be.
  - Play and Stop share one big button. Play hands the keyboard to the
    game, ringed in teal while it has it.
  - Console and Problems are one **Messages** panel. When a problem stops
    the game, its line is marked in the editor with the message under it,
    a button makes the change when the message names the right spelling,
    and a link opens the reference page for it.
  - The editor colors js-game-zero's own names and hooks, wraps long
    lines, and saves without a Save button.
  - Light mode is warm paper and dark mode a deep plum, both set in
    Fredoka, Nunito and JetBrains Mono, which the sandbox serves itself so
    it looks the same offline.

### MIT license

- `js-game-zero` is now released under the MIT License instead of
  `LGPL-3.0-only`, so a game, an app or a page can bundle it with nothing
  more than its license notice. Packages ship `LICENSE` alone; `COPYING` is
  gone.
- The tweens' easing curves are written from Robert Penner's easing
  equations, credited in `LICENSE`, in place of the version ported from
  Pygame Zero. Every tween gives exactly the values it did.
- The README credits pygame-text (CC0), which text wrapping is ported from,
  and Tappy Plane credits Pygame Zero's Flappy Bird example, whose idea and
  shape it follows.
- Every built file with the library's code opens with its license: a
  `/*! … */` comment holding the package, its version and the whole MIT
  text. Most bundlers and minifiers keep such comments, so a page or an app
  that bundles js-game-zero carries its notice without doing anything.

### The CLI's Playwright

- `@js-game-zero/cli` takes Playwright (1.57 or later) as a peer dependency
  instead of its own. Bun and npm still install it with the CLI, but a
  project that already has Playwright, pinned to the version whose Chromium
  it installs, keeps that one, so one Chromium serves both.
- It declares the Bun it runs on: `"engines": { "bun": ">=1.3" }`.

### The API reference in core

- `@js-game-zero/core/reference` exports `reference`, every page of the API
  reference as Markdown by its file name (`reference["actor.md"]`), and each
  page is also a file at `@js-game-zero/core/reference/<page>.md`, for a host
  that hands the docs to a learner, a tool or a model.

### Fixes

- A `defineGame()` game's input hooks get their event object in an app a
  bundler has minified. The runtime knew them by their parameter's name,
  `event`, which a minifier renames, so `onKeyDown(event)` received the key
  number instead.
- A callback a game gives `music.setOnMusicEnd()` at its top level is kept.
  The runtime cleared it at startup when the game had no `onMusicEnd()`.
- Reading an image's size while it's still loading, such as
  `images.player.getSize()` at a game's top level, says it's still loading
  and how to have the first frame wait for it. It said the image was
  missing.
- A game's sounds stop when it stops or restarts, a looping one too. They
  kept playing, so each restart added another loop.
- `tone.isUnlocked()` is `true` once any sound or tone has played, as the
  reference says. In a run, only the run's own tones counted.
- An image or font a hook asks for that fails to load fails the game, as
  one asked for at the top level does. One that failed at once, such as a
  name an asset map doesn't list, went unnoticed.
- Setting `left`, `top`, `topLeft`, `center` or any other edge or corner of
  a rotated Actor puts its rotated bounding box there, as reading them
  measures it. It placed the unrotated picture, so after
  `actor.angle = 45` and `actor.left = 0`, `actor.left` read about -8.
- A rotated Actor keeps the position it was given when its size changes or
  its image finishes loading. It moved:
  `new Actor("ship", { center: [100, 100], angle: 90 })` ended up centred at
  `[110, 90]`.
- `actor.inflateIp()` grows only the hitbox and leaves the picture where it
  was. The picture moved with the hitbox's top-left corner.
- `screen.draw.textbox` centres each line in its rect by default, and lines
  them up by its `anchor` unless `align` is given, as the reference says.
  The lines were always left-aligned.
- `screen.draw.textbox` refuses `center`, `topLeft`, `pos` and the other
  position options, saying its rect places its text. It accepted them and
  then failed with "draw.text accepts exactly one position source."
- `screen.blit` of an image that can't be loaded reports a warning naming
  the image, once. It left an unhandled promise rejection every frame.
- A callback that schedules itself again with `clock.schedule(callback, 0)`
  runs once a frame. It ran again straight away, forever, freezing the tab,
  so `function loop() { …; clock.schedule(loop, 0); }`, the usual port of a
  `setTimeout` loop, hung the game.
- `clock.eachTick(spin())`, with brackets, throws where it's written, saying
  to drop the brackets, as the other schedules do. The game failed on its
  first frame with "event.callback is not a function".
- A game file can use all of JavaScript's standard built-ins, such as
  `Float32Array` and the other typed arrays, `ArrayBuffer`, `DataView`,
  `Reflect`, `Proxy`, `encodeURI`, `structuredClone` and `WeakRef`. They
  weren't defined, so `new Float32Array(4)` threw "Float32Array is not
  defined". `globalThis` in a game file is the game's own global scope, not
  the page's `window`.
- `animate()` and `new Animation()` called outside a hook, such as in
  `actor.ready().then(...)`, run on the game's clock, in a game file and in
  a `defineGame()` game. The animation never moved.
- A game file's top-level code sees the screen size its `WIDTH` and
  `HEIGHT` give (800 × 600 without them), as `update()` and `draw()` do. It
  saw the canvas's size before the game sized it, such as 300 × 150, so
  `screen.width / 2` at the top level wasn't the middle.
- A game file no longer sees `createBrowserSoundAsset`, `KeyboardState` or
  `run`, which are for host pages. Calling `run()` in a game file says a
  game file runs by itself.
- A change inside a stored object or list, such as
  `storage.highScores.push(score)`, is saved. It was lost, even when the
  tab closed or the game stopped, unless a key was set too.
- Storing a value JSON can't hold, such as `storage.lastSpeed = 0 / 0`,
  throws a `JsonStorageError` naming the key ("NaN is not a JSON value at
  storage.lastSpeed") and stores nothing, as the reference says. The value
  was stored, and every later save then failed with only a warning.
- A `tone` waveform that doesn't exist, such as `"squar"`, throws, listing
  the four waveforms and suggesting the nearest. It was ignored, and the
  tone played as a sine wave.

### Sandbox

- The sandbox works when opened at `http://localhost:4173` as well as at
  `http://127.0.0.1:4173`, the address it prints. At localhost the game
  preview stayed blank while the status said "Running", because the preview
  let only `http://127.0.0.1:4173` embed it.
- The Docs tab includes the CLI guide, and links to other files in the
  repository, such as `CONTRIBUTING.md`, `LICENSE` or an example's README,
  open on GitHub. The CLI guide was missing, and those links opened the
  sandbox in a new tab, showing "Not found".
- Each card in the example gallery has a short description written for
  learners. Cards showed the example's browser-test description with a
  capital letter added, such as "Renders deterministic canvas primitives".
  Sound And Tone is now Sound and Tone.

### The docs

- The hooks reference lists a game's settings (`WIDTH` and `HEIGHT`, which
  default to 800 × 600, `TITLE`, `ICON`, `PIXEL_DENSITY` and
  `TOUCH_CONTROLS`), says a hook whose one parameter is `event` receives
  every value in one object, and gives `onKeyUp` all four values.
- The runtime reference lists a `defineGame()` game's event fields and
  services, the rest of `@js-game-zero/core/host` and
  `@js-game-zero/core/node`, and every mistake that stops a game at startup.
- Corrected: the clock reference on a callback that throws and on
  `onFinished`; the loaders reference's top-level `await`, which a game file
  can't use; the `…Ip` names in the rect reference; and the migration
  guide's comparisons of tones, storage, tweens and `ZRect` with Pygame
  Zero's. README and the tutorial count five complete games, and the Space
  Shooter README describes its code as it is.

### Images ready before a game starts

- `loadImages(assetUrls)`, in `@js-game-zero/core/host` and on `window.JGZ`,
  decodes every image in an asset map for `preloadedAssets`. `run()` starts
  a game's code at once, so an image the run loads itself has no size while
  the top level runs: `player.width` read 0 there, and an Actor placed by
  `midBottom` and then moved landed as if it were 0×0, sunk by half its
  height. Images handed over decoded are ready from the first line, as they
  already were in `jgz` and the sandbox preview, which now use `loadImages`
  themselves.
- The Actor reference no longer suggests `await player.ready()` at a game's
  top level, which a zero-boilerplate game can't do.

### Late images

- `screen.blit` and `screen.draw.image` draw nothing for an image that
  hasn't loaded, and their `Promise` resolves once it has. They used to draw
  it when it arrived, outside any frame and on top of whatever the frame drew
  after it, while `$drawn` already listed it. The runtime holds the frames
  that follow until it loads, so it shows from the next one, as before.
- The reference says what a late image or font holds: whole frames, `update`
  as well as `draw`, while `handle.step()` does nothing. It said only drawing
  waited.

### The CLI's sessions

- `jgz` gives the game `--timeout` (15000 ms by default) to answer each call
  into the browser, such as one `step`'s frames, a key press or an
  `inspect`. A game stuck in an endless loop in `update` or `draw` fails the
  request with `command_failed`, saying it may be stuck, and is restarted on
  a new page, which a `restarted` event with `"source": "timeout"` reports.
  The CLI used to wait forever, because Playwright gives `evaluate` and
  input no timeout of their own.
- A game that doesn't finish starting within `--timeout` fails with
  `startup_failed`, saying it may be stuck. It failed with Playwright's
  "page.waitForFunction: Timeout 15000ms exceeded."
- Ctrl-C at the prompt, SIGINT, SIGTERM and SIGHUP all close the browser
  and exit, mid-command too, with 130, 130, 143 and 129: 128 plus the
  signal's number. Ctrl-C at an idle prompt exited with 0, and mid-command
  it closed the prompt and left the CLI waiting. After a SIGHUP the CLI kept
  running with its browser closed.
- `jgz install-chromium` installs Chromium for the Playwright the CLI uses.
  When that Chromium is missing, `jgz test` names that Playwright's version
  and the exact command that installs it. A global install has a Playwright
  of its own, so the documented `bunx playwright install chromium` could
  install another version's Chromium in a project that pins Playwright, and
  `jgz test` then failed with "Executable doesn't exist". The install docs
  now add the CLI to the project, where `bunx playwright` runs the CLI's own
  Playwright, and use `jgz install-chromium` for a global install.
- `--watch` restarts the game only when `main.js` or a file in its
  `images/`, `sounds/`, `music/` or `fonts/` folder changes, in `assets/` in
  that layout. It restarted on any change in the project folder, including a
  screenshot the CLI had just saved there.
- `play` checks every action, key names included, before it runs any, and
  its errors give the action's place: `actions[1]: Unsupported key: zz. …`.
  An unknown key failed only when its action came up, after the actions
  before it had moved the game on.
- A `play` whose single `inspect` path can't be read answers
  `{ "error": … }` in its place, as a list of paths already did, alongside
  the status. The whole request failed after its actions had run.
- Error messages are the game's own first line, such as
  `Unknown game-state binding: nothere`, with the same `command_failed` code
  from `inspect` as from `call`. `inspect` errors began with Playwright's
  `evaluate: TypeError: ` and went on with the in-page stack and the
  session's URL.
- `status`'s `heldKeys` lists each key by one name: its name (`right`,
  `ctrl`), else what it types (`b`), else its code (`Numpad1`). A `key tap`
  of a held key, or a `mouse click` of a held button, leaves it released.
  `heldKeys` echoed the key as given, lowercased (`keyb`), and a tapped key
  or clicked button stayed listed as held.
- At the prompt, `key tap '` and `key tap \` press the quote and backslash
  keys, and `docs/cli.md` also shows `\'`, `\\`, `Quote` and `Backslash`.
  Both failed with "Unterminated quote or escape.", though the guide listed
  them as key names.
- `docs/cli.md` has tables of `jgz test`'s flags, error codes and exit
  codes, and says what `--timeout` covers. `jgz --help` says what each flag
  does and gives `--timeout`'s default.

### The CLI's keys

- `jgz` presses a letter or digit by its key, as a keyboard does: `a` and `A`
  both arrive with `unicode` `"a"`, and as `"A"` while Shift is held (`7`
  with Shift is `"&"`). It used to send `"A"` with no Shift, which no
  keyboard sends, so a typing game behaved differently under `jgz` than in a
  browser.
- `jgz` presses every key the engine knows: Backspace, Tab, Delete, Home,
  End, Page Up and Down, the lock keys, punctuation (`,` or `Comma`), the
  number pad, left and right modifiers, and any key by its `code`. It
  pressed only the arrows, Space, Enter, Escape, the modifiers, letters,
  digits and F-keys. F13 to F15, which Playwright can't press, are refused
  up front instead of failing in the browser. `docs/cli.md` lists the names.

### Where text is drawn

- A `$drawn` text entry gives its box, `x`, `y`, `width` and `height`,
  however the text was placed. Text placed by `center`, `midTop` or another
  named point had no position at all, and text at a point with an `anchor`
  gave the anchor point, so a check couldn't tell where a centred title was.

### Inspecting Actors

- An inspected Actor's `properties` are only the fields the game gave it.
  Flip-book Actors also showed the engine's own `_images`, `_fps`, `_loop`,
  `animationStart` and `clockSource`, the last as a whole clock. The CLI and
  runtime references now name `properties`.
- `docs/cli.md` gives a `step`'s limits: a `count` from 1 to 100,000 and a
  `dt` of 0 or more.

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
  (`scolor`) and `gradientColor` (`gcolor`). Textboxes' own `minFontsize`,
  which Pygame Zero doesn't have, is also `minSize`. Giving both names for
  one option is an error.
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
