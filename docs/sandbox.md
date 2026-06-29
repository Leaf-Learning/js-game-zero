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

## Server API

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:project/files/:path`
- `PUT /api/projects/:project/files/:path`
- `PUT /api/projects/:project/assets/:path`
- `GET /play/:project`

## Verification Criteria

- Unit route tests cover project creation, file read/write, and path traversal
  rejection.
- Browser e2e tests create a project, edit code, upload an SVG image, press Play,
  and verify the preview canvas is nonblank.
- Preview console errors fail e2e tests.
