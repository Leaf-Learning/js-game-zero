# Space Shooter

A vertical shoot-'em-up in the spirit of classic arcade shooters like
Galaxian: fly your ship, blast descending waves of enemies before they
reach you, and survive as the waves get faster and bigger.

## Controls

- **Arrow keys** or **WASD** to move the ship (it's kept in the lower part
  of the screen).
- **Space** to fire.
- After a game over, click or press space to try again.

## What it teaches

- `Actor` sprites, group movement (the whole enemy formation shares one
  velocity, like the paddle/ball in Breakout), and `touches()`.
- Frame-rate independent movement and timers with `update(dt)` - firing
  has a cooldown, and hits make the ship flash using `opacity`.
- Normalizing diagonal input so moving in two directions does not increase
  the ship's speed.
- Flip-book animation: each explosion is an `Actor` given a list of
  `images`, an `fps` and `loop: false`, so it plays its pictures once on
  the game clock and then reports `finished`.
- Reacting to input with `onKeyDown()`/`onMouseDown()` and polling
  `keyboard` every frame for smooth movement.
- Playing sound effects with `sounds.<name>.play()`.
- Escalating difficulty by scaling speed and enemy count with a wave
  counter.
- A starfield background drawn entirely with `screen.draw.filledRect()` -
  no image asset required.

## Reading and extending it

Start with `resetGame()` and `spawnWave()`, then follow `update()` through
the movement helpers. The laser and enemy loops walk backwards so `splice()`
does not skip the next item. Finished explosions are dropped with
`filter()`, which `update()` does before checking for game over, so the
last explosions still play out and disappear after the game ends.

Try changing the firing cooldown or enemy speed. Keep new formations above
`PLAYER_TOP_LIMIT` when changing row counts or spacing.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.

- `images/player_ship.png`, `images/enemy_ship.png`,
  `images/laser.png` - from the "Space Shooter Remastered" pack.
- `images/explosion_*.png` - from the "Explosion Pack" (pixel explosion
  animation).
- `sounds/` - from the "Sci-Fi Sounds" pack.
