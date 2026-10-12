# Platformer

A small hand-built platforming level: run and jump across floating
platforms, grab the gems, and reach the flag without falling into the
water below.

## Controls

- **Arrow keys** or **A**/**D** to run.
- **Up**, **W**, or **space** to jump.
- After reaching the flag, click or press space to play again.

## What it teaches

- Building a level as **data**: the whole map is an array of strings
  (`LEVEL`), where each character is one tile. `draw()` and the collision
  code both just read characters out of that array - a classic, very
  teachable way to build a tilemap.
- Simple tile-grid physics written from scratch: gravity, axis-by-axis
  collision resolution against the level array, and a small "coyote
  time" grace window that keeps a late jump press feeling fair.
- Short physics substeps keep a dropped frame from skipping a platform
  or collectible while still consuming the full elapsed time.
- Turning grid coordinates into pixels and back (`TILE_SIZE`-sized cells).
- Collecting items by checking `touches()` against a list of `Actor`s
  each physics step, and removing them when touched.
- A simple "fall off the world" rule: once the player drops below the
  bottom of the screen, they respawn at the start instead of the game
  ending outright.
- Reacting to input with `onKeyDown(key, repeat)` for jumping, explicitly
  ignoring OS key repeats, alongside `keyboard` polling for running.

## Reading and extending it

Start with `LEVEL`, then `resetGame()` / `respawn()`. `update()` divides time
into short steps; `updatePlayer()` handles input and calls the horizontal
and vertical collision helpers. `drawLevel()` reads the same map as physics.
This is an intermediate example: understand Actor bounds and velocity first.

Try adding a platform and gem to `LEVEL`. Keep all rows the same length and
update `COLS` / `ROWS` if you change the map dimensions.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.

- `images/ground_top.png`, `images/ground_fill.png`, `images/gem.png`,
  `images/flag.png`, `images/water.png`, `images/tree.png` - tiles from
  the "Pixel Platformer" pack, scaled up 3x (with nearest-neighbour
  resampling, so the pixel art stays crisp). They are 54-pixel tiles.
- `images/player.png` - a character from the same pack's tileset,
  scaled up the same way, then matched to the tile width with
  `new Actor("player", { width: TILE_SIZE })`. Actors support `width`,
  `height`, and `scale`; collision bounds follow the drawn size.
- `sounds/` - from the "Retro Sounds" pack.
