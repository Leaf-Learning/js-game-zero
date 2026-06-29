# Phase 06: Web Sandbox

> Status: Complete

## Summary

Build the Bun-backed local project sandbox: create/edit projects, manage assets,
run the preview pane, and surface diagnostics. The sandbox stores files locally
and must treat path safety as a release blocker.

## Implementation Steps

- Build the Bun server and static browser UI.
- Implement project create/list/open, file read/write, asset upload, runtime
  bundle serving, and preview HTML serving.
- Add path traversal protection and project root confinement.
- Provide a two-pane editor and preview workflow with a Play button.
- Surface diagnostics and runtime errors in the UI.
- Project roots live under `.jgz-projects` by default and may be overridden only
  by an explicit CLI flag.
- Server endpoints: `GET /api/projects`, `POST /api/projects`,
  `GET /api/projects/:project/files/:path`, `PUT /api/projects/:project/files/:path`,
  `PUT /api/projects/:project/assets/:path`, `GET /play/:project`,
  `GET /runtime/browser.js`, and `GET /api/health`.
- File writes are UTF-8 for code/docs and binary-safe for assets. Parent
  directories are created only inside the project root.
- Preview iframe reloads after Play and receives diagnostics from the runtime.

## Unit Verification

- Route tests cover project create/list/open, file read/write, asset upload,
  missing project, invalid project names, missing files, binary asset writes,
  and health.
- Path tests reject `..`, absolute paths, URL-encoded traversal, backslash
  traversal, hidden root escapes, and symlink escapes where the platform
  exposes them.
- Bundle tests assert the runtime bundle route returns executable JavaScript and
  the preview HTML includes the selected project entry.
- UI-state tests cover selected file, dirty state, Play button enabling, and
  diagnostics display using DOM-level tests where possible.

## E2E Verification

- Playwright creates a project, edits `main.js`, uploads an image asset, presses
  Play, verifies the preview iframe canvas is nonblank, and checks no console or
  page errors.
- Playwright verifies diagnostics by intentionally entering a hook typo and
  seeing the expected warning in the UI.
- Playwright reloads the page and confirms the project/file list persists.

## Exit Criteria

- All server routes enforce project-root confinement.
- Sandbox e2e passes in Chromium from a clean `.jgz-projects` directory.
- Earlier runtime/examples e2e tests still pass.

## Verification Criteria

- The sandbox workflow is verified through both route-level unit tests and a
  full Playwright create/edit/upload/play browser flow.

## Implementation notes

- Added the Bun-backed sandbox server module and wired it into the existing
  sandbox server so `/` serves the project editor while earlier phase fixtures
  remain available under their explicit routes.
- Implemented project create/list/open, UTF-8 file read/write, binary-safe asset
  upload and serving, preview HTML, `/api/health`, and the explicit
  `--projects-root` CLI override with `.jgz-projects` as the default root.
- Added root-confining path resolution that rejects traversal, absolute paths,
  URL-encoded separators/traversal, backslash traversal, unsafe project names,
  symlink project roots, symlink parents, and symlink file targets before reads
  or writes.
- Built the two-pane editor/preview UI with project/file selection, dirty/save
  state, asset upload controls, Play-triggered iframe reload, and runtime
  diagnostics/runtime-error display.
- Added route/unit coverage for health, CRUD, file reads/writes, binary asset
  writes, missing/invalid cases, bundle/preview routes, path safety, symlink
  escapes, and UI state, plus a clean-root Playwright workflow covering
  create/edit/upload/play/nonblank-canvas, diagnostics, reload persistence, and
  earlier phase e2e compatibility.
- Critic iteration 1 passed. The critic independently reran unit/e2e checks,
  drove a live server with explicit `--projects-root`, probed traversal/root
  escapes against planted out-of-root secrets, and verified hook diagnostics,
  runtime-error display, preview rendering, and reload persistence.
