# Tappy Plane

A complete little flying game: keep the plane in the air and steer it through the gaps between
the mountains. Every gap you pass scores a point, and your best score is
remembered between visits.

## Controls

- **Click** or press **space** to boost upward.
- After a crash, click or press space to start a new run.

## What it teaches

- `Actor` sprites: positions, custom anchors (the rocks hang from their
  tips), rotation (`plane.angle`), and collision with tapered mountains.
- Frame-rate independent movement with `update(dt)`, plus simple gravity
  and velocity.
- Reacting to input with `on_mouse_down()` and `on_key_down(key)`.
- Playing sound effects with `sounds.flap.play()`.
- Persisting a high score by assigning to `storage` — saving happens
  automatically.
- Testing convex shapes with the separating axis test, using a rotated
  fuselage and tapered mountain hitboxes so transparent corners stay safe.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.

- `images/` — from the "Tappy Plane" pack.
- `sounds/` — from the "Retro Sounds" packs.
