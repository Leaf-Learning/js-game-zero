# Storage Save

Edit a current score and see how saving and loading affect it.

- **+ 1** / **- 1** change only the current score (minimum zero).
- **Save current** writes it to `storage` and calls `storage.save()`.
- **Load saved** restores the saved score without saving your edits.
- Reload the page to see the saved score loaded automatically.

The two score cards and status message show exactly what changed. The
example teaches `Rect.collidepoint()` buttons, `storage.get()` / `set()`,
explicit saving, and automatic loading when the runtime starts.

Run it from `/examples/storage-save`.
