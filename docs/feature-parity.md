# Feature Parity Matrix

## Summary

The matrix tracks the public Pygame Zero features that `js-game-zero` must
support. Each row must have unit tests and browser e2e coverage before v1 is
considered complete.

| Area      | Feature                                 | Unit Coverage               | Browser E2E Coverage                   |
| --------- | --------------------------------------- | --------------------------- | -------------------------------------- |
| Runtime   | `draw`, `update`, `update(dt)`          | runtime fixture tests       | Phase 05 examples smoke                |
| Runtime   | mouse/key/music hooks                   | event dispatch tests        | Phase 05 keyboard/mouse examples       |
| Runtime   | zero-boilerplate global mode            | runtime fixture tests       | Phase 05 global examples               |
| Runtime   | explicit import mode                    | runtime import tests        | Phase 05 sandbox starter example       |
| Runtime   | learner diagnostics                     | runtime diagnostic tests    | Phase 05 examples console health       |
| Screen    | clear, fill, gradient fill              | canvas mock/pixel tests     | Phase 05 drawing basics smoke          |
| Screen    | line, circle, polygon, rect             | drawing tests               | Phase 05 drawing basics smoke          |
| Text      | text, textbox, color, align, wrap       | formatting tests            | Phase 03 text e2e + Phase 07 tutorials |
| Assets    | images, sounds, music, fonts            | loader validation tests     | Phase 05 actor/sound examples          |
| Geometry  | Rect and ZRect properties/methods       | rect behavior tests         | collision example test                 |
| Actor     | position, anchor, angle, opacity        | actor math tests            | actor example smoke test               |
| Input     | `keyboard`, `keys`, `keymods`, `mouse`  | key mapping tests           | Playwright input test                  |
| Timing    | `clock` schedule APIs                   | scheduler tests             | callback canvas/log test               |
| Animation | all tween names and `Animation.stop`    | tween/animation tests       | animation example test                 |
| Audio     | sound effects and music queue           | mocked audio tests          | user gesture audio test                |
| Tone      | note names, frequencies, duration guard | tone tests                  | tone play state test                   |
| Storage   | JSON persistence and errors             | storage tests               | reload persistence test                |
| Sandbox   | project CRUD and file operations        | Phase 06 server route tests | Phase 06 create/edit/play test         |
| Docs      | README, API, tutorials, phase specs     | docs check                  | Phase 07 tutorial launch tests         |

## Verification Criteria

- No row may remain without both unit and e2e coverage at v1.
- The CI workflow must run all tests referenced by this matrix.
- Feature exceptions require an explicit documented compatibility note.
