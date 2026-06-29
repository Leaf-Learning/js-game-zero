# Phase 04: Audio, Music, Tone, And Storage

## Implementation Steps

- Implement browser sound effects with play, loop, stop, and duration query.
- Implement one-track music with play, play-once, queue, stop, pause, unpause,
  fadeout, volume, and end hook behavior.
- Implement tone generation with note-name parsing, frequency input, duration
  guard, create, and play.
- Implement JSON storage with browser `localStorage` adapter and sandbox file
  adapter extension point.

## Verification Criteria

- Unit: tone note names map to expected frequencies and invalid durations fail.
- Unit: music state transitions and queue behavior work with mocked audio.
- Unit: storage persists JSON-compatible values and reports encoding errors.
- E2E: after a user gesture, a browser game can call tone and sound APIs
  without console errors, and storage survives a preview reload.
