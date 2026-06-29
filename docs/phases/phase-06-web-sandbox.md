# Phase 06: Web Sandbox

## Implementation Steps

- Build the Bun server and static browser UI.
- Implement project create/list/open, file read/write, asset upload, runtime
  bundle serving, and preview HTML serving.
- Add path traversal protection and project root confinement.
- Provide a two-pane editor and preview workflow with a Play button.
- Surface diagnostics and runtime errors in the UI.

## Verification Criteria

- Unit: server route tests cover project CRUD, file IO, and invalid path
  rejection.
- Unit: runtime bundle route returns executable JavaScript.
- E2E: create a project, edit `main.js`, upload an asset, press Play, and verify
  the preview canvas is nonblank.
- E2E: preview console errors fail tests.
