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
- Turning grid coordinates into pixels and back (`TILE`-sized cells).
- Collecting items by checking `colliderect()` against a list of `Actor`s
  each frame, and removing them when touched.
- A simple "fall off the world" rule: once the player drops below the
  bottom of the screen, they respawn at the start instead of the game
  ending outright.
- Reacting to input with `on_key_down()` for jumping (so holding the key
  doesn't repeat-fire) alongside per-frame `keyboard` polling for running.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.

- `images/ground_top.png`, `images/ground_fill.png`, `images/gem.png`,
  `images/flag.png`, `images/water.png`, `images/tree.png` - tiles from
  the "Pixel Platformer" pack, scaled up 3x (with nearest-neighbour
  resampling, so the pixel art stays crisp) since this engine always
  draws sprites at their native size.
- `images/player.png` - a character from the same pack's tileset,
  scaled up the same way.
- `sounds/` - from the "Retro Sounds" pack.
