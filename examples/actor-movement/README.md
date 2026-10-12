# Actor Movement

This zero-boilerplate example loads `assets/images/player.svg` and moves an
`Actor` with the left and right arrow keys.

Read `update(dt)`: velocity in pixels per second is multiplied by elapsed
seconds. Holding a key is checked every frame through `keyboard`;
`draw()` only renders. `player.clampIp(screen.bounds())` keeps the whole
sprite on screen using the Actor's actual bounds, so resizing the sprite
does not change which code keeps it there.

Try changing `MOVE_SPEED` or the Actor's `width`. `const player` keeps the
same Actor while its position properties remain mutable.

Run it from `/examples/actor-movement`.
