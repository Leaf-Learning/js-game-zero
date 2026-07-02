# Sounds, Music, And Tone

Browsers block audio from playing until the page has seen a user gesture
(a click or key press). Every audio API below works fine technically before
that gesture, but nothing will actually be _audible_ until the player has
interacted with the page at least once — trigger your first sound from an
`on_mouse_down` or `on_key_down` handler, not from top-level code or the
first `draw()` frame.

## Sound effects: `sounds`

`sounds.<name>` resolves an asset under `sounds/` (see
[`docs/reference/loaders.md`](loaders.md)) the first time you touch it.

```js
function on_mouse_down() {
  sounds.tap.play();
}
```

### `.play(loops = 0)`

Plays the sound. `loops` follows pygame's convention: `0` (the default)
plays it once; a positive integer plays it that many _additional_ times
after the first (so `loops: 2` plays three times total); `-1` loops forever
until `.stop()` is called.

Calling `.play()` again while a previous playback is still going **does not
cut it off** — sounds overlap, just like pygame's channel mixing, so rapid
repeated triggers (e.g. a machine-gun sound effect) layer instead of
stuttering.

### `.stop()`

Stops every currently-overlapping playback of this sound.

### `.get_length()`

Duration in seconds (`0` if not yet known).

### `.set_volume(volume)` / `.get_volume()`

Per-sound volume, `0`–`1`.

## Music: `music`

Unlike `sounds`, `music` plays **one track at a time** — starting a new
track always stops whatever was playing.

```js
music.play("theme.ogg"); // loops forever
```

| Method                                            | Behavior                                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `music.play(name)`                                | Stops the current track, plays `name` on a loop.                                                                                         |
| `music.play_once(name)`                           | Stops the current track, plays `name` once.                                                                                              |
| `music.queue(name)`                               | Appends `name` to the queue; starts immediately (as a one-shot) if nothing is currently playing. Queued tracks play in order, each once. |
| `music.stop()`                                    | Stops playback and clears the queue.                                                                                                     |
| `music.pause()` / `music.unpause()`               | Pause and resume without losing position.                                                                                                |
| `music.rewind()`                                  | Restarts the current track from the beginning without stopping it.                                                                       |
| `music.fadeout(seconds)`                          | Fades the volume to zero over `seconds`, then stops. `0` stops immediately.                                                              |
| `music.set_volume(volume)` / `music.get_volume()` | `0`–`1`.                                                                                                                                 |
| `music.get_pos()`                                 | Milliseconds the current track has been playing, or `-1` if nothing is loaded.                                                           |
| `music.set_pos(seconds)`                          | Seeks the current track to a position, in seconds.                                                                                       |
| `music.is_playing()`                              | `true` if a track is currently playing and not paused.                                                                                   |

`on_music_end()` (or `music.set_on_music_end(callback)`) fires once the
queue is exhausted and nothing is left to play.

## Generated tones: `tone`

`tone` synthesizes a short beep with the Web Audio API — no sound asset file
needed, useful for quick feedback sounds (menu blips, jumps, coin pickups).

```js
function on_mouse_down() {
  tone.play("A4", 0.2);
}
```

### `tone.play(noteOrFrequency, duration = 1, options?)`

- `noteOrFrequency` — either a note name like `"A4"`, `"C#5"`, or `"Bb3"`
  (letter, optional `#`/`b`, octave number, using standard scientific pitch
  notation with A4 = 440Hz), or a positive number of Hz.
- `duration` — seconds, **must be greater than `0` and at most `4`**; longer
  values throw a `RangeError`. Generated tones are meant for short blips,
  not background music — use `music` for that.
- `options.waveform` — `"sine"` (default), `"square"`, `"sawtooth"`,
  `"triangle"`, or the pgzero-style short aliases `"sin"` (→ `"sine"`) and
  `"saw"` (→ `"sawtooth"`).
- `options.volume` — `0`–`1`, defaults to `0.8` (matching pgzero's `tone`
  module default, which is louder than most other defaults in this API).

Returns a `Promise` that resolves once the tone has been scheduled.

### `tone.create(noteOrFrequency, duration = 1, options?)`

Builds a reusable tone spec without playing it yet — call `.play(options?)`
on the result whenever you want to trigger it, optionally overriding
`waveform`/`volume` for that one playback.

```js
const jumpTone = tone.create("E5", 0.12, { waveform: "square" });

function on_key_down(key) {
  if (key === keys.SPACE) jumpTone.play();
}
```
