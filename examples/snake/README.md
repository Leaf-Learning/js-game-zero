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
- Queuing input: a turn pressed between ticks is stored and applied on
  the next scheduled move, so key presses never get lost or double up.
- Persisting a high score by assigning to `storage`.
- Mixing a sprite (`Actor` for the apple) with plain `screen.draw`
  rectangles for the snake itself.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.

- `images/fruit.png` - a cherry sprite from the "Platformer Assets Candy"
  pack, standing in for the classic apple pickup.
- `sounds/` - from the "Retro Sounds" pack.
