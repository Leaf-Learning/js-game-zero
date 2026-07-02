# Storage

`storage` is a persistent, dictionary-like object for saving small amounts
of data between play sessions — high scores, unlocked levels, settings.

```js
let highScore = storage.get("highScore") ?? 0;

function update() {
  if (score > highScore) {
    highScore = score;
    storage.set("highScore", highScore);
  }
}
```

## Auto-load and auto-save

You don't need to call `save()` or `load()` yourself in normal use:

- **Auto-load**: storage is loaded before your top-level game code runs, so
  a top-level read like `let score = storage.get("score") ?? 0` sees
  previously-saved data immediately, the first time it executes.
- **Auto-save**: any mutation (`storage.set(...)`, `storage.score = 5`,
  `storage.delete(...)`, `storage.clear()`) schedules a save a fraction of a
  second later; rapid changes coalesce into one write instead of saving on
  every single mutation. Storage is also flushed immediately when the tab is
  hidden or closed, so nothing is lost.

## Reading and writing

Two equivalent styles work — plain method calls, or attribute-style access
through a proxy (closer to pgzero's `storage` object):

```js
storage.set("score", 10);
storage.get("score"); // 10

storage.score = 10; // same as storage.set("score", 10)
storage.score; // 10
```

| Method                                  | Behavior                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `storage.get(key, defaultValue?)`       | Returns the stored value, or `defaultValue` (`undefined` if omitted) if `key` isn't set.           |
| `storage.set(key, value)`               | Stores `value` under `key`.                                                                        |
| `storage.setdefault(key, defaultValue)` | Sets `key` to `defaultValue` only if it isn't already set; returns the resulting value either way. |
| `storage.has(key)`                      | `boolean`.                                                                                         |
| `storage.delete(key)`                   | Removes `key`; also works as `delete storage.key`. Returns `true` if something was removed.        |
| `storage.clear()`                       | Removes everything.                                                                                |
| `storage.keys()`                        | Every stored key, alphabetically sorted.                                                           |
| `storage.path`                          | The backing location: a scoped `localStorage` key in the browser, or a file path in the sandbox.   |

Values must be JSON-serializable — plain objects, arrays, strings, numbers,
booleans, and `null`. Anything else (a class instance, a function, `NaN`,
`Infinity`, a circular reference) throws a `JsonStorageError` naming the
offending path, e.g. `highScores[2].player`.

## Gotchas

- **Don't shadow method names.** `storage.save`, `storage.load`, `storage.path`,
  and the other method names above are real properties on `storage` itself,
  not just proxy-forwarded keys — writing `storage.save = 5` overwrites the
  actual `save` method instead of storing a value. Pick key names that don't
  collide with the method list.
- Storage is scoped per project: in the browser it's namespaced by project
  id (so two different games on the same site don't share data); in the
  sandbox it's a JSON file inside that project's own directory.

## Manual save/load

For advanced cases — forcing an immediate write instead of waiting for the
debounce, or working outside of `run()` — `storage.save()` and
`storage.load()` are both available directly and return `Promise<void>`.
