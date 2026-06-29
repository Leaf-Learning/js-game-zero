# Phase 04: Audio, Music, Tone, And Storage

## Summary

Add browser audio, music sequencing, tone synthesis, and persistent storage.
Because browser audio requires user gestures, tests must separate deterministic
state-machine coverage from browser integration checks.

## Implementation Steps

- Implement browser sound effects with play, loop, stop, and duration query.
- Implement one-track music with play, play-once, queue, stop, pause, unpause,
  fadeout, volume, and end hook behavior.
- Implement tone generation with note-name parsing, frequency input, duration
  guard, create, and play.
- Implement JSON storage with browser `localStorage` adapter and sandbox file
  adapter extension point.
- Use Web Audio oscillator nodes for generated tones and HTML audio elements for
  project audio files.
- Queue music tracks in FIFO order; `play(name)` replaces active and queued
  tracks, while `queue(name)` appends after the current/queued tracks.
- Clamp volume to `[0, 1]`, reject tone durations `<= 0` or `> 4`, and support
  sharps/flats such as `A#5` and `Bb3`.
- Storage exposes a map-like API plus learner-friendly proxy access. Save/load
  operations reject non-JSON values with the failing path.

## Unit Verification

- Audio unit tests use mock `AudioContext`, oscillator, gain, and audio element
  classes to verify calls without real sound hardware.
- Sound tests cover play once, loop count, infinite loop, stop, duration, volume,
  missing asset errors, and user-gesture unlock state.
- Music tests cover replace, play once, queue order, pause/unpause, stop,
  fadeout timing, volume, `is_playing`, and `on_music_end`.
- Tone tests cover note-name parsing, frequency input, sharps/flats, duration
  guard, waveform defaults, volume, `create`, and `play`.
- Storage tests cover empty load, set/get/setdefault/clear, JSON save/load,
  corrupt JSON, non-serializable values, browser adapter key scoping, and sandbox
  adapter path scoping.

## E2E Verification

- Playwright clicks a button to unlock audio, calls `tone.play`, and asserts the
  browser state machine reports a scheduled tone without page errors.
- A music fixture uses a short generated data URL track and asserts play-once end
  behavior triggers `on_music_end`.
- A storage fixture writes a high score, reloads the preview, and asserts the
  value persists.

## Exit Criteria

- All earlier phase tests still pass.
- Audio features fail gracefully in browsers without a supported codec.
- Storage file writes in sandbox mode are confined to the project root.

## Verification Criteria

- Every sound/music/tone/storage API has deterministic unit coverage and at
  least one browser e2e exercise through Playwright.
