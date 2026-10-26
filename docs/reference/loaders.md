# Loading Assets

Games load four kinds of asset, each from its own conventional directory:

| Kind   | Directory | Extensions                                        |
| ------ | --------- | ------------------------------------------------- |
| Images | `images/` | `png`, `gif`, `jpg`, `jpeg`, `bmp`, `webp`, `svg` |
| Sounds | `sounds/` | `wav`, `ogg`, `mp3`, `m4a`                        |
| Music  | `music/`  | `wav`, `ogg`, `mp3`, `m4a`                        |
| Fonts  | `fonts/`  | `ttf`, `otf`, `woff`, `woff2`                     |

In the sandbox, these are the Images, Sounds, Music and Fonts panels; for examples and
hand-written projects, they're plain directories next to your game's code.

## Asset name grammar

An asset name is a lowercase, forward-slash path, resolved relative to its
kind's directory — `"player.svg"` means `images/player.svg`,
`"levels/forest_bg.png"` means `images/levels/forest_bg.png`. Rules:

- Each path segment must start with a lowercase letter and contain only
  lowercase letters, digits, and underscores (no hyphens, no uppercase, no
  spaces) — `"player.svg"` is valid, `"Player.svg"` and `"player-1.svg"` are
  not.
- No leading `/`, no `\`, no empty segments, no `.`/`..` segments.
- At most one extension per segment, and it must be one of the kind's
  supported list above, in lowercase.
- The extension is optional when you reference the asset — `images.player`
  and `new Actor("player")` both work by trying every supported extension
  for that kind in turn until one loads.

An invalid name throws `InvalidAssetNameError`; a name that doesn't match
any file throws `MissingAssetError` naming the asset kind and the name you
asked for — both are meant to be immediately readable, so check the browser
console for the exact reason before assuming a typo is something else.

## Using assets

### Images

Most games load images through `Actor` (see
[`docs/reference/actor.md`](actor.md)) or `screen.blit()`. To use an image
directly — for its dimensions, say — the zero-boilerplate `images` global
(or `import { images } from "@js-game-zero/core"`) exposes property-style
lazy access:

```js
let ship = images.player; // starts loading images/player.svg

function draw() {
  let [width, height] = ship.getSize();
}
```

The game's first frame waits for every image its top level named, so their
sizes are there in `update()` and `draw()`. At the top level an image is
usually still loading, and reading its size there throws an error that says
so, unless the host page handed the images over already decoded
(`loadImages`, which `jgz` and the sandbox use).

An image has `getWidth()`, `getHeight()`, `getSize()` and `getRect()`. Give
`getRect()` a point to place it by, like an Actor's
(`images.player.getRect({ center: [160, 90] })`), for a `Rect` of the image's
size there; without one it sits at `[0, 0]`.

In an import-mode game, or any `async` function, load explicitly and `await`
the result:

```js
const sprite = await images.load("player.svg");
sprite.getWidth();
sprite.getHeight();
```

### Sounds and music

`sounds.<name>` and `music.play(name)` resolve assets the same way — see
[`docs/reference/audio.md`](audio.md) for the playback API.

### Fonts

Fonts aren't injected as a zero-boilerplate global; use `fontname` in
`draw.text`/`draw.textbox` (see [`docs/reference/screen.md`](screen.md)) and
the loader starts fetching the font in the background the first time it's
referenced:

```js
screen.draw.text("Retro!", [20, 20], { fontname: "pixel", fontsize: 32 });
```

`fontname` is the file's stem (`fonts/pixel.ttf` → `"pixel"`), registered
with the browser under that family name once loaded. If you need to `await`
a font being ready (e.g. to measure text before your first draw), import
`fonts` and call `await fonts.load("pixel")` directly.

## Assets without a server

By default a run loads each asset from a URL under `assetBaseUrl`
(`/assets/<projectId>/images/cat.svg`), so something has to serve them. A
host page that already has the files can hand them over instead, with
`assetUrls`: a map from each asset's path, as it sits in the project, to a
URL the browser can load, such as a data URL or a blob URL.

```js
run(source, {
  assetUrls: {
    "images/cat.svg": "data:image/svg+xml;base64,PHN2ZyB4bWxucz0i…",
    "sounds/pop.wav": "data:audio/wav;base64,UklGRi…",
  },
});
```

Games name assets as usual: `new Actor("cat")`, `images.cat` and
`sounds.pop` find `images/cat.svg` and `sounds/pop.wav` in the map, trying
each supported extension as they would on a server. With a map, assets come
only from it: one it doesn't list is a `MissingAssetError`, and nothing is
requested from `assetBaseUrl`.

`run()` starts a game's code straight away, and an image the run loads
itself is still decoding while the top level runs, so it has no size yet:
`player.width` reads 0 there, and an Actor placed by `midBottom` and then
moved lands as if it were 0×0. A page can decode the images first with
`loadImages` from `@js-game-zero/core/host` (`JGZ.loadImages` in the
script-tag build), as `jgz` and the sandbox do. The game then finds them
ready from its first line, as a Pygame Zero game would:

```js
const images = await loadImages(assetUrls);
run(source, { assetUrls, preloadedAssets: { images } });
```

`loadImages` decodes every `images/` entry of the map, by its name under
`images/`. One that fails is left out, so the run loads it itself and
reports the failure only if the game uses it. Sounds, music and fonts given as data URLs
are decoded in the page rather than fetched, so a page whose content
security policy allows no connections (no `connect-src`) still plays them;
images need `img-src data:` (or `blob:`), and sounds `media-src` to match.
An `ICON` the map doesn't list leaves the page's favicon as it is.

## Loader methods (advanced)

Every asset kind is backed by a loader with the same shape. Games normally use
the `images`, `sounds`, and `fonts` services from `@js-game-zero/core`; music
playback uses the `music` player. Hosts that need to construct or override
loaders import `createAssetLoaders()` or the individual factories from
`@js-game-zero/core/host`:

- `load(name): Promise<Asset>` — fetches and caches the asset.
- `assetUrls` — the asset map the loader reads instead of `assetBaseUrl`,
  or `undefined` when it has none.
- `get(name): Asset | undefined` — synchronous; only returns something if
  already cached.
- `has(name): boolean`
- `define(name, asset)` — registers an asset object directly without going
  through the network, useful for tests or preloading fixtures.
- `unload(name): boolean` — evicts one cached asset.
- `unloadAll()` — clears the whole cache.
- `cacheKeys(): string[]` — every currently-cached asset name, sorted.

Why a frame never shows a half-loaded sprite: each runtime tracks its own image
and font loads started while the script's top level runs (and any started
afterward) and holds frames until they settle. Audio loads remain recoverable
and do not gate frames — see the
"preload gate" section of [`docs/reference/runtime.md`](runtime.md).
