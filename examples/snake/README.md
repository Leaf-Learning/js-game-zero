# Snake

The classic grid game: steer the snake around the board to eat apples and
grow, without running into a wall or your own tail. Every apple makes the
snake a little faster, and your best score is remembered between visits.

## Controls

- **Arrow keys** or **WASD** to turn.
- After a game over, click or press space to play again.

## What it teaches

- Driving gameplay from the **`clock`** API instead of every-frame code:
  `clock.schedule_interval()` moves the snake on a fixed schedule, and
  eating an apple calls `clock.unschedule()` before rescheduling at a
  shorter interval to speed the game up.
- Modelling a game grid as plain data (an array of `{x, y}` cells) and
  turning it into pixels only in `draw()`.
- Queuing input: up to two turns pressed between ticks are stored and applied
  one per scheduled move, so quick corners cannot reverse into the body.
- Persisting a high score by assigning to `storage`.
- Fitting a fruit sprite inside its grid cell with `Actor` sizing and
  keeping the score bar outside the playable grid.
- Picking fruit from free cells, allowing moves into a vacating tail cell,
  and winning when the board is full.
- Mixing a sprite (`Actor` for the apple) with plain `screen.draw`
  rectangles for the snake itself.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.

- `images/fruit.png` - a cherry sprite from the "Platformer Assets Candy"
  pack, standing in for the classic apple pickup.
- `sounds/` - from the "Retro Sounds" pack.
