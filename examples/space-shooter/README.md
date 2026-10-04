# Space Shooter

A vertical shoot-'em-up in the spirit of classic arcade shooters like
Galaxian: fly your ship, blast descending waves of enemies before they
reach you, and survive as the waves get faster and bigger.

## Controls

- **Arrow keys** or **WASD** to move the ship (it's kept in the lower half
  of the screen).
- **Space** to fire.
- After a game over, click or press space to try again.

## What it teaches

- `Actor` sprites, group movement (the whole enemy formation shares one
  velocity, like the paddle/ball in Breakout), and `colliderect()`.
- Frame-rate independent movement and timers with `update(dt)` - firing
  has a cooldown, and hits make the ship flash using `opacity`.
- Normalizing diagonal input so moving in two directions does not increase
  the ship's speed.
- A tiny hand-rolled sprite animation: cycling an `Actor`'s `image`
  through a list of frames to play an explosion, advancing all elapsed
  frames after a slow update.
- Reacting to input with `on_key_down()`/`on_mouse_down()` and polling
  `keyboard` every frame for smooth movement.
- Playing sound effects with `sounds.<name>.play()`.
- Escalating difficulty by scaling speed and enemy count with a wave
  counter.
- A starfield background drawn entirely with `screen.draw.filled_rect()` -
  no image asset required.

## Reading and extending it

Start with `resetGame()` and `spawnWave()`, then follow `update()` through
the movement helpers. Laser, enemy, and explosion removal loops walk
backwards so `splice()` does not skip the next item. Cosmetic explosions
continue updating after gameplay ends.

Try changing the firing cooldown or enemy speed. Keep new formations above
`PLAYER_TOP_LIMIT` when changing row counts or spacing.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.

- `images/player_ship.png`, `images/enemy_ship.png`,
  `images/laser.png` - from the "Space Shooter Remastered" pack.
- `images/explosion_*.png` - from the "Explosion Pack" (pixel explosion
  animation).
- `sounds/` - from the "Sci-Fi Sounds" pack.
