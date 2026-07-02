# Flappy Bird

A complete little game in the spirit of the Pygame Zero `flappybird`
example: keep the plane in the air and steer it through the gaps between
the rocks. Every gap you pass scores a point, and your best score is
remembered between visits.

## Controls

- **Click** or press **space** to flap.
- After a crash, click or press space to start a new run.

## What it teaches

- `Actor` sprites: positions, custom anchors (the rocks hang from their
  tips), rotation (`plane.angle`), and rectangle collision with
  `colliderect()`.
- Frame-rate independent movement with `update(dt)`, plus simple gravity
  and velocity.
- Reacting to input with `on_mouse_down()` and `on_key_down(key)`.
- Playing sound effects with `sounds.flap.play()`.
- Persisting a high score by assigning to `storage` — saving happens
  automatically.
- Shrinking collision boxes with `inflate()` so near-misses feel fair.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.

- `images/` — from the "Tappy Plane" pack.
- `sounds/` — from the "Retro Sounds" packs.
