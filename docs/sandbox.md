# Sandbox Guide

## Summary

The sandbox is a local Bun web app for creating, editing, and playing
`js-game-zero` projects. It stores projects under `.jgz-projects` by default.

## Workflow

1. Run `bun run dev:sandbox`.
2. Open `http://localhost:4173`.
3. Create a project.
4. Edit `main.js`.
5. Add assets under `images`, `sounds`, `music`, or `fonts`.
6. Press Play to reload the preview pane.

Projects are stored under `.jgz-projects` by default. For local testing, pass
`--projects-root <path>` to `bun run dev:sandbox --` to use an explicit
alternate root.

## Starter Project

New projects include `main.js` and empty `images`, `sounds`, `music`, and
`fonts` directories. A minimal starter can draw without any assets:

```js
WIDTH = 320;
HEIGHT = 180;
TITLE = "Sandbox Starter";

function draw() {
  screen.fill("#10243d");
  screen.draw.filled_circle([160, 90], 42, "#38bdf8");
  screen.draw.text("js-game-zero", [22, 24], {
    fontsize: 24,
    color: "#ffffff",
  });
}
```

Asset uploads preserve bytes and must target one of the conventional asset
directories. For example, uploading `player.svg` creates
`images/player.svg`, and learner code can use `new Actor("player.svg")`.

## Server API

- `GET /api/health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:project/files/:path`
- `PUT /api/projects/:project/files/:path`
- `PUT /api/projects/:project/assets/:path`
- `GET /play/:project`
- `GET /runtime/browser.js`

All project and file routes reject path traversal, absolute paths, encoded
separators, backslash traversal, unsafe project names, and symlink escapes.

## Browser Verification Workflow

The Playwright workflow starts from a clean project root, creates a project,
edits `main.js`, uploads an SVG asset, presses Play, checks the preview canvas,
enters a deliberate `drwa` typo to verify diagnostics, then reloads the page to
confirm project and file persistence.

## Verification Criteria

- Unit route tests cover project creation, file read/write, and path traversal
  rejection.
- Browser e2e tests create a project, edit code, upload an SVG image, press Play,
  verify the preview canvas is nonblank, check diagnostics, and reload the page
  to confirm the project/file list persists.
- Preview console errors fail e2e tests.
