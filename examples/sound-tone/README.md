# Sound and Tone

This zero-boilerplate example plays a sound file from its `assets/sounds/`
folder (via the `sounds.click` loader) alongside a short synthesized tone
whenever the canvas is clicked.

The mouse hook changes the click counter and triggers sound; `draw()` only
displays the result. Starting audio from a user input event lets the browser
unlock playback. Do not trigger sound inside `draw()`, which runs repeatedly.

Try changing the tone note or duration and listen to how the two audio
sources combine.

Run it from `/examples/sound-tone`.

## Assets

Assets by Kenney (kenney.nl), licensed CC0.
