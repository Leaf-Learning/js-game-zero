# @js-game-zero/core

The framework behind [js-game-zero](https://github.com/Leaf-Learning/js-game-zero),
which teaches beginners to build browser games in JavaScript with as little
boilerplate as possible: actors, drawing, geometry, input, animation, sound and
storage, in the spirit of [Pygame Zero](https://github.com/lordmauve/pgzero).

```sh
bun add @js-game-zero/core
# or
npm install @js-game-zero/core
```

## Use

`defineGame()` gives a game its own set of services, so two games on one page
never share state:

```ts
import { defineGame, run } from "@js-game-zero/core";

run(
  defineGame(({ Actor, screen, keyboard }) => {
    const player = new Actor("player.svg");
    return {
      WIDTH: 320,
      HEIGHT: 180,
      update(dt) {
        if (keyboard.right) player.x += 120 * dt;
      },
      draw() {
        screen.clear();
        player.draw();
      },
    };
  }),
);
```

`run()` also takes a plain object of hooks, or a zero-boilerplate game's source
as a string. For a game a learner writes with no imports at all, see
[`@js-game-zero/browser-runtime`](https://www.npmjs.com/package/@js-game-zero/browser-runtime).

## Entry points

| Import                                   | What it holds                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@js-game-zero/core`                     | The game API: `run`, `defineGame`, `Actor`, `Rect`, `screen`, `keyboard`, `clock`, `animate`, `storage` and the rest. |
| `@js-game-zero/core/host`                | For pages and tools that embed games: asset loaders, browser adapters, the game inspector and the value serialiser.   |
| `@js-game-zero/core/node`                | A file-system storage adapter for sandbox projects, under Node or Bun.                                                |
| `@js-game-zero/core/reference`           | The API reference: `reference`, every page's Markdown by its file name (`reference["actor.md"]`).                     |
| `@js-game-zero/core/reference/<page>.md` | Each reference page as a Markdown file.                                                                               |

## Docs

- [Tutorial](https://github.com/Leaf-Learning/js-game-zero/blob/main/docs/tutorial.md):
  build a complete game step by step.
- [API reference](https://github.com/Leaf-Learning/js-game-zero/tree/main/docs/reference):
  every symbol, with a signature, an explanation and an example. The
  [runtime page](https://github.com/Leaf-Learning/js-game-zero/blob/main/docs/reference/runtime.md)
  covers `run()`, its options and embedding games in a host page.
- [Cookbook](https://github.com/Leaf-Learning/js-game-zero/blob/main/docs/cookbook.md):
  short recipes for specific tasks.

## License

MIT. See [LICENSE](LICENSE).
