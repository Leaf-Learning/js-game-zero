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
- A tiny hand-rolled sprite animation: cycling an `Actor`'s `image`
  through a list of frames to play an explosion.
- Reacting to input with `on_key_down()`/`on_mouse_down()` and polling
  `keyboard` every frame for smooth movement.
- Playing sound effects with `sounds.<name>.play()`.
- Escalating difficulty by scaling speed and enemy count with a wave
  counter.
- A starfield background drawn entirely with `screen.draw.filled_rect()` -
  no image asset required.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.

- `images/player_ship.png`, `images/enemy_ship.png`,
  `images/laser.png` - from the "Space Shooter Remastered" pack.
- `images/explosion_*.png` - from the "Explosion Pack" (pixel explosion
  animation).
- `sounds/` - from the "Sci-Fi Sounds" pack.
