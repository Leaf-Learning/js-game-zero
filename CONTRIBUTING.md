# Contributing

Thanks for considering a contribution to `js-game-zero`. This document
covers dev setup, the test suite, formatting, and what to expect from a PR
review.

## Dev setup

You need [Bun](https://bun.sh) 1.3+.

```sh
git clone https://github.com/taharafiq/js-game-zero.git
cd js-game-zero
bun install
```

For browser tests, install Chromium once via Playwright:

```sh
bunx playwright install chromium
```

## Project layout

- `packages/core` — the framework itself (rendering, actors, geometry,
  input, animation, audio, storage). Most contributions land here.
- `packages/browser-runtime` — the zero-boilerplate wrapper.
- `apps/sandbox` — the local editor/preview server (`apps/sandbox/src`) and
  its browser UI (`apps/sandbox/client`).
- `examples` — playable example games, listed in `examples/manifest.ts`.
- `docs` — user-facing docs (`docs/*.md`, `docs/reference/`) and
  engineering-internal docs (`docs/internal/`).
- `tests/e2e` — Playwright browser tests.
- `scripts` — build and docs-consistency tooling.

## Running the sandbox locally

```sh
bun run dev:sandbox
```

Opens on `http://localhost:4173`, storing projects under `.jgz-projects`.
Pass `-- --projects-root <path>` for a disposable project directory while
iterating.

## Tests

```sh
bun test              # unit tests (packages, apps, scripts)
bun run test:e2e       # Playwright browser tests
bun run docs:check     # documentation consistency checks
```

Unit tests live next to the code they cover, as `*.test.ts` files, and run
under Bun's built-in test runner. Browser (e2e) tests live in `tests/e2e`
as `*.pw.ts` files and drive a real Chromium instance against a locally
started sandbox server — see `playwright.config.ts`.

If you add or change a public API in `packages/core`, add or update a unit
test alongside it, and update the relevant page under `docs/reference/`
(and `docs/internal/feature-parity.md`'s coverage row, if the change is
substantial) in the same change.

## Formatting and linting

```sh
bun run format          # apply Prettier formatting
bun run format:check    # check formatting without writing
bun run typecheck       # tsc --noEmit
bun run lint            # typecheck + format:check
```

## The full check suite

```sh
bun run check    # lint + unit tests + docs:check
bun run build    # emit package bundles
bun run test:e2e # browser tests
```

This is the same sequence CI runs (see `.github/workflows/ci.yml`) — all
three should pass locally before opening a PR.

### What `docs:check` verifies

`bun run docs:check` (`scripts/check-docs.ts`) is a strict, scripted gate
over the documentation, not just a link checker:

- Every required doc file exists and, for internal phase docs, carries a
  `Complete` status banner and the expected sections.
- Every JavaScript code block in `docs/tutorial.md` and `docs/cookbook.md`
  actually compiles.
- README's shell command blocks reference real `package.json` scripts.
- The CI workflow includes the expected steps, in order.
- User-facing docs don't reintroduce internal "Verification Criteria"
  language, and nothing claims this project is a "clean-room"
  implementation (see [`docs/internal/engineering-design.md`](docs/internal/engineering-design.md)
  for why that word is specifically avoided).
- Every package that should declare `LGPL-3.0-only` does.

If you add a new doc file that should be part of the required set, add it
to `requiredDocs` in `scripts/check-docs.ts`.

## Commit and PR expectations

- Keep commits scoped to one logical change; write commit messages that
  explain _why_, not just _what_.
- Run `bun run check`, `bun run build`, and `bun run test:e2e` before
  opening a PR — a red CI run on an otherwise-good PR just costs everyone
  time.
- If your change affects the public API surface, update the matching page
  under `docs/reference/` in the same PR — undocumented public API is
  treated as incomplete work, not a follow-up.
- Describe what you tested manually, if anything, beyond the automated
  suite (e.g. "played through the sandbox tutorial flow by hand").
