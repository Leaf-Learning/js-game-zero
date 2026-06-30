# js-game-zero Implementation Plan

## Summary

Implementation is divided into seven phases. Each phase has a detailed spec in
`docs/phases/` with its own steps, unit verification, and browser e2e
verification. The plan implements a Bun + TypeScript monorepo, a clean-room
LGPL-3.0-only core framework, browser runtime, examples, sandbox, docs, CI, and
private GitHub publishing.

## Phase Index

1. [Repo, Tooling, And Docs](phases/phase-01-repo-tooling-docs.md)
2. [Core Semantics](phases/phase-02-core-semantics.md)
3. [Rendering, Assets, And Actor](phases/phase-03-rendering-assets-actor.md)
4. [Audio, Music, Tone, And Storage](phases/phase-04-audio-music-tone-storage.md)
5. [Runtime, Examples, And Parity](phases/phase-05-runtime-examples-parity.md)
6. [Web Sandbox](phases/phase-06-web-sandbox.md)
7. [Docs, CI, And GitHub](phases/phase-07-docs-ci-github.md)

## Implementation Defaults

- Package manager and server runtime: Bun.
- Language: TypeScript for packages and server code.
- Rendering: Canvas 2D.
- Audio: Web Audio plus HTML audio fallback.
- Storage: `localStorage` in browser, Bun file adapter in sandbox projects.
- Public license: LGPL-3.0-only, aligned with upstream Pygame Zero.
- Upstream compatibility: behavior-compatible clean-room implementation.
- Repository target: initialize `/Users/taha/Projects/js-game-zero` and publish
  a private GitHub repository named `js-game-zero`.

## Verification Criteria

- `bun run lint` passes TypeScript and non-mutating Prettier checks.
- `bun test` passes all unit tests.
- `bun run docs:check` confirms all required docs and phase specs exist.
- `bun run test:e2e` passes browser verification.
- `bun run build` emits browser-ready package bundles.
- `git status --short` shows only intentional source changes before commit.
