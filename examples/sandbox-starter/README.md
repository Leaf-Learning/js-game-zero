# Sandbox Starter

This example demonstrates scoped import mode with `defineGame()` and `run()`.
Use the arrow keys to move; press space to reset the position.

- `game.ts` contains the game factory, its private state, and its hooks.
  The factory receives services such as `screen` and `keyboard` for each run.
- `main.ts` contains host setup: selecting a canvas and calling `run()`.
  The game module can be reused with a different canvas without DOM changes.
- `onKeyDown(event)` receives a typed event object in scoped import mode.
  Global examples use named arguments such as `on_key_down(key, repeat)`.

For your own page, bundle `main.ts` with a browser bundler that resolves
`@js-game-zero/core`, then load the resulting JavaScript as a module beside:

```html
<canvas data-jgz-example-canvas></canvas>
```

Alternatively, import `game` into your own host and call
`run(game, { canvas: yourCanvas })`. Each run gets independent state.
This example is built by the example server; it cannot be cloned into the
sandbox's single-script editor, which runs zero-boilerplate source.

Try running the same `game` on two canvases and changing one run's input.
The two circles should have independent positions.

Run it from `/examples/sandbox-starter`.
