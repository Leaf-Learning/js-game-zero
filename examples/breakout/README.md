# Breakout

A complete brick-breaking game in the spirit of the Pygame Zero
`breakout` example: bounce the ball off your paddle to clear the wall of
bricks. You have three lives — lose the ball three times and it's game
over; clear every brick and you win.

## Controls

- Move the **mouse** to steer the paddle (or use the **left/right arrow
  keys**).
- Aim by catching the ball off-centre: the far edges of the paddle send
  it out at a steeper angle.
- After winning or losing, click or press **space** to play again.

## What it teaches

- Building a grid of `Actor` sprites with nested loops.
- Ball physics: velocity, wall bounces, and paddle "spin" based on where
  the ball lands.
- Rectangle collision with `colliderect()` and stepping the simulation in
  small increments so a fast ball can't tunnel through the paddle.
- Mouse input with `on_mouse_move(pos)` alongside `keyboard` polling.
- Simple game states (`playing` / `won` / `lost`) and restart handling.
- Sound effects with `sounds.<name>.play()`.

## Reading and extending it

Start with `buildBricks()` and `startNewGame()`. Input moves the paddle;
`update()` steps the ball; `moveBall()` resolves collisions and changes
game state. `draw()` only reads that state. The bounce calculation is a
simple arcade approximation rather than a general physics solver.

Try changing the brick layout. If you increase the ball's speed, increase
the number of simulation steps so it cannot skip a paddle or brick.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.

- `images/` — from the "Puzzle Pack" set.
- `sounds/` — from the "Digital Audio", "Impact Sounds", and "Retro
  Sounds" packs.
