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

## Server API

- `GET /api/health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:project/files/:path`
- `PUT /api/projects/:project/files/:path`
- `PUT /api/projects/:project/assets/:path`
- `GET /play/:project`
- `GET /runtime/browser.js`

## Verification Criteria

- Unit route tests cover project creation, file read/write, and path traversal
  rejection.
- Browser e2e tests create a project, edit code, upload an SVG image, press Play,
  verify the preview canvas is nonblank, check diagnostics, and reload the page
  to confirm the project/file list persists.
- Preview console errors fail e2e tests.
