# Storage Save

Edit a current score and see how saving and loading affect it.

- **+ 1** / **- 1** change only the current score (minimum zero).
- **Save current** writes it to `storage` and calls `storage.save()`.
- **Load saved** calls `storage.load()` to read persisted data again, then
  restores the saved score without saving your edits.
- Reload the page to see the saved score loaded automatically.

The two score cards and status message show exactly what changed. The
example teaches `Rect.touches()` buttons, `storage.get()` / `set()`,
asynchronous saving/loading, and automatic loading when the runtime starts.
`set()` updates memory before the write completes. The saved card changes
only after a successful write or load; failures keep the last confirmed
score visible. Buttons pause during these operations to avoid overlapping
requests.

Read `buttons` for the data-driven UI, then `saveScore()` and `loadScore()`
for the persistence boundary. Try adding a reset-current button that leaves
the saved score alone.

Run it from `/examples/storage-save`.
