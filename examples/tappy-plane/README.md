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
- Reacting to input with `onMouseDown()` and `onKeyDown(key)`.
- Playing sound effects with `sounds.flap.play()`.
- Persisting a high score by assigning to `storage` — saving happens
  automatically.
- Testing convex shapes with the separating axis test, using a rotated
  fuselage and tapered mountain hitboxes so transparent corners stay safe.

## Reading and extending it

Start with the tuning constants, then `resetGame()`, `updatePlane()`, and
`updateMountains()`. Input changes velocity; updating advances the game;
drawing only displays it.

The collision helpers are the advanced part. Hitbox constants hold points
in local sprite coordinates. `hitsRock()` rotates the plane's points and
moves both shapes into screen coordinates. `polygonsOverlap()` projects
both convex shapes onto axes perpendicular to every edge. If any axis has
a gap between the projections, the shapes are separate. Rectangle bounds
alone would count transparent mountain corners as hits.

Try changing `GAP` or `MOUNTAIN_SPEED` first. If you replace the art, update
the hitbox points to fit its painted silhouette; these are hand-tuned
shapes for the shipped sprites, rather than automatic pixel collision.

## Credits

The game follows the idea and shape of Pygame Zero's Flappy Bird example
(by Max00355, ported to Pygame Zero by Daniel Pope), written anew for
js-game-zero.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.

- `images/` — from the "Tappy Plane" pack.
- `sounds/` — from the "Retro Sounds" packs.
