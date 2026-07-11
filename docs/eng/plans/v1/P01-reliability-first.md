# Reliability-First Improvement Plan for js-game-zero

**Status:** Completed

## Summary

The baseline is strong: `bun run check` and the build pass; all 233 unit tests and 48 Chromium tests pass; measured unit coverage is 92.16% functions / 93.64% lines. The suite particularly excels at geometry, rendering, path safety, examples, and real-browser gameplay.

The main weaknesses are hidden lifecycle races and an overly broad public/package boundary—not general lack of testing.

### Highest-impact findings

| Priority | Finding                                         | Evidence and impact                                                                                                                                                                                                                            |
| -------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Sandbox saves can report success after failure  | [`writeFile()`](/Users/taha/Projects/js-game-zero/apps/sandbox/client/api.ts:84) ignores `response.ok`; a simulated HTTP 500 resolved successfully. Concurrent saves are also not serialized, allowing stale content to overwrite newer edits. |
| P0       | Runtime callback failures leave a zombie handle | A thrown `draw()`/`update()` escapes the frame, prevents the next animation frame, emits no diagnostic, and leaves input/storage resources attached.                                                                                           |
| P0       | Async operations lack cancellation/versioning   | `music.play()` followed by `stop()` can still begin playback after loading; async storage is loaded twice at startup; stale project/file reads can overwrite newer UI selection.                                                               |
| P0       | Runtime isolation is incomplete                 | `screen` is not restored with the other active services; assets and `storage` are not context-scoped in import mode; one global asset load can gate unrelated game handles.                                                                    |
| P1       | Several documented contracts are ineffective    | `RunOptions.container` is ignored, owned canvases are not removed on stop/reload, and `Clock.clear()` called inside an interval does not cancel that interval.                                                                                 |
| P1       | Import-mode typing is weak                      | Every hook is `(...unknown[]) => void`; tests must annotate and cast `dt`/input arguments. Parameter-name reflection via `Function.toString()` is brittle under wrappers, destructuring, and transformation.                                   |
| P1       | Packaging exposes implementation internals      | The wildcard barrel exports roughly 70 runtime values, including active-context setters and debug/test seams. Package manifests point consumers at TypeScript source rather than built output or declarations.                                 |
| P1       | Browser bundles include server concerns         | The 153,670-byte core bundle includes a `node:path` shim because the Node file-storage adapter shares the browser entry point. `browser-runtime` also duplicates the core bundle.                                                              |
| P2       | Large modules hide reusable concepts            | Runtime, rendering, assets, sandbox routing, test fixtures, and client orchestration each combine several independent responsibilities in 600–1,150-line files.                                                                                |
| P2       | Test gates miss consumer and client contracts   | Client logic has no isolated unit coverage; e2e tests run framework source rather than the packed package; export tests preserve wholesale re-exporting instead of enforcing an intentional API.                                               |

## Implementation Changes

### 1. Close confirmed reliability gaps first

- Route every sandbox API operation through one response decoder that checks status, validates the expected response shape, and throws an `ApiError` containing a stable server error code.
- Replace the editor’s loose timer/pending-save fields with a document session that:
  - permits only one write in flight;
  - coalesces queued edits to the latest revision;
  - makes navigation, Play, Restart, rename, and deletion await queue idle;
  - retains dirty content after failure and never displays “Saved” for an unacknowledged write.
- Guard project/file loading with monotonically increasing operation tokens so out-of-order responses cannot change the current editor state.
- Make sandbox file writes atomic through temporary-file-plus-rename; create cloned projects in a staging directory and publish them only after every source and asset copy succeeds.
- Add operation generations to music loading and queue advancement. `stop()` and a newer `play()` must invalidate every older pending load.
- Replace `StorageAdapter.load(): value | Promise` with an async `load()` plus optional `loadSync()`. The runtime calls exactly one path, eliminating duplicate reads and ignored rejection promises.
- Fix `Clock.clear()` by marking active scheduled events canceled before clearing collections.
- Clear keyboard state on blur/visibility loss and capture pointer release outside the canvas to prevent stuck input.

### 2. Introduce an additive, typed, isolated import API

Keep zero-boilerplate source execution, uppercase configuration, snake_case hooks, and Pygame Zero parameter-name dispatch unchanged.

Add a branded `defineGame(factory)` API:

```ts
run(
  defineGame(
    ({
      Actor,
      screen,
      clock,
      keyboard,
      keys,
      mouse,
      images,
      sounds,
      music,
      fonts,
      storage,
      tone,
      animate,
    }) => ({
      WIDTH: 320,
      HEIGHT: 180,
      update(dt) {},
      draw() {},
      onKeyDown(event) {},
    }),
  ),
  options,
);
```

- Each factory receives resources bound to that specific run. Its `Actor`, loaders, animation clock, screen, storage, and audio cannot fall back to another game’s singleton state.
- Define typed `GameKeyEvent` and `GameMouseEvent` objects. New camelCase factory hooks receive these positionally; legacy raw `GameModule` hooks retain name-based dispatch.
- Stop global asset pending counts from gating unrelated handles. Startup waits only for assets owned by the current context; late audio loads never freeze rendering.
- Continue supporting existing package-level proxies for learner compatibility, but document them as the legacy single-runtime convenience API.

Extend `GameHandle` with:

- `state: "starting" | "running" | "paused" | "failed" | "stopped"`;
- `failure: RuntimeFailure | null`;
- `done: Promise<void>`;
- `dispose(): Promise<void>` for awaited storage flush and cleanup;
- `restart(source?): Promise<GameHandle>` as the reliable replacement for synchronous `reload()`.

Retain `stop()` and `reload()` temporarily as compatibility wrappers and mark `reload()` deprecated.

### 3. Establish deterministic failure semantics

- Wrap startup, input, clock, update, draw, and asynchronous asset completion in one runtime error boundary.
- A thrown update/draw/input hook emits one diagnostic with a `phase`, transitions the handle to `failed`, cancels the frame, detaches input, and begins disposal.
- Required image/font startup failures emit an error and reject `ready`; storage-load and audio-play failures emit warnings and allow the game to continue.
- Preserve original error causes and attempted URLs in asset errors instead of converting every failure into an indistinguishable `MissingAssetError`.
- Make canvas save/restore and temporary font changes use `try/finally`.
- Honor `RunOptions.container`; track canvas ownership so stopping or restarting removes only canvases created by the runtime.
- Restore every active service symmetrically after callbacks and replace the single `activeHandle` variable with a managed handle stack.

### 4. Tighten package and module boundaries

- Replace [`export *`](/Users/taha/Projects/js-game-zero/packages/core/src/index.ts:1) with a curated learner-facing export list.
- Move host factories, adapters, scheduler types, and diagnostics helpers to `@js-game-zero/core/host`; move filesystem storage to `@js-game-zero/core/node`.
- Keep currently documented learner symbols at the top level. Retain advanced legacy aliases through 0.2 with `@deprecated` annotations; remove active-context setters and debug-only methods from public entry points by 1.0.
- Publish compiled ESM and `.d.ts` files through package `exports`; add explicit `files`, `sideEffects`, and browser/IIFE subpaths.
- Make `browser-runtime`’s ESM entry re-export core without rebundling it; only the script-tag IIFE should bundle core.
- Enforce a browser-bundle budget and reject Node built-ins in browser artifacts.

Refactor by responsibility:

- Runtime: context creation, lifecycle, source evaluation, diagnostics, and persistence coordination.
- Rendering/assets: screen primitives, text layout, color handling, registries, lazy handles, and browser backends.
- Sandbox server: declarative router, project repository, path-policy primitives, example serving, and dynamically loaded test-only routes.
- Sandbox client: stateful controller/document session separated from DOM rendering.
- Derive hook aliases/metadata from one registry, centralize active-service proxy behavior, and share Rect delegation/position metadata without prototype mutation.

### 5. Define shared sandbox contracts and isolation

- Create one shared request/response contract module for server and client project, file, asset, example, error, and preview-message shapes.
- Validate JSON at both boundaries; do not trust generic casts from `requestJson<T>()` or `postMessage`.
- Verify both `event.origin` and `event.source` for preview messages.
- Serve learner previews from a separate local origin with narrowly scoped CORS for source/assets. Learner code must not have DOM access to the editor or permission to call project mutation endpoints.
- Move fixture pages and fixture route definitions out of production server modules and load them only under the existing test-fixture flag.

## Test Plan

- Add deterministic unit tests using deferred promises for:
  - HTTP 500 saves, retry, save coalescing, stale-write ordering, and navigation during a save;
  - out-of-order project/file selection;
  - `music.stop()` and competing `play()` calls during loading;
  - one-call async storage initialization;
  - `Clock.clear()` inside its own interval;
  - thrown startup/input/update/draw hooks and cleanup;
  - multiple simultaneous handles with independent screen/assets/storage;
  - blur, outside-canvas pointer release, ignored `container`, and owned-canvas cleanup.
- Add TypeScript consumer fixtures proving correct `dt` and input-event inference and expected compile errors for invalid hooks/options.
- Replace the export-surface test with an exact approved manifest for each public entry point.
- Pack each publishable package into a temporary consumer, typecheck/import it, and exercise both ESM and IIFE builds in Chromium. Assert no Node built-ins and enforce size budgets.
- Add isolated client-controller/API tests so save and selection logic contributes coverage; keep Playwright for integrated UI behavior.
- Add per-subsystem coverage thresholds after the refactor: core and sandbox domain logic at least 90% lines and 85% functions, with no aggregate-only loophole.
- In CI, enable `forbidOnly` and `failOnFlakyTests`; retain one retry for trace collection but fail the job if a test passes only on retry.
- Preserve the existing full gates: strict typecheck, formatting, 233+ unit scenarios, documentation checks, build, and all 48+ Chromium scenarios.

## Assumptions

- The learner-facing zero-boilerplate/Pygame Zero API is compatibility-critical; improvements to import/host APIs are additive and advanced removals use deprecation.
- Reliability and prevention of lost work take precedence over shortening files.
- Chromium remains the supported browser target; a broad browser matrix is not required.
- The core and browser-runtime packages are intended to become consumable artifacts even though current getting-started documentation uses a repository clone.
- No large parser or framework dependency is introduced solely for diagnostics or sandbox state management.

## Implementation notes

- Implemented the reliability work across the sandbox save protocol, atomic
  repository operations, selection controller, runtime lifecycle/error
  boundary, per-run services, audio/storage/input races, and owned-canvas
  cleanup. The save protocol uses per-session revisions, optimistic file
  versions, idempotent replay detection, and explicit conflict handling so
  neither unload races nor independent editors can acknowledge unwritten data.
- Added `defineGame`, typed input events, expanded `GameHandle` lifecycle APIs,
  curated `core`, `host`, and `node` entry points, compiled ESM/declarations,
  a non-duplicating browser-runtime facade, browser bundle budgets, and packed
  consumer checks for Bundler, NodeNext, Node16-compatible declarations, ESM,
  and IIFE artifacts.
- Split runtime source/diagnostics/contracts, sandbox path policy/repository,
  and client controller/document-session responsibilities. Shared validated
  sandbox contracts and a separate read-only preview origin now enforce the
  client/server and learner/editor boundaries.
- Final verification passed 286 unit tests, subsystem coverage thresholds,
  strict type/format/documentation checks, package builds and packed-consumer
  checks, plus all 50 Chromium scenarios. Independent adversarial review round
  five returned `PASS` with no completeness, test, e2e, or regression findings.
