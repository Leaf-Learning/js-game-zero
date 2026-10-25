# Contributing

Thanks for considering a contribution to `js-game-zero`. This document
covers dev setup, the test suite, formatting, and what to expect from a PR
review.

## Dev setup

You need [Bun](https://bun.sh) 1.3+.

```sh
git clone https://github.com/Leaf-Learning/js-game-zero.git
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
- `packages/cli` — the `jgz` command, which runs a game in Chromium to
  drive input, inspect state and take screenshots (see `docs/cli.md`).
- `apps/sandbox` — the local editor/preview server (`apps/sandbox/src`) and
  its browser UI (`apps/sandbox/client`).
- `examples` — playable example games, listed in `examples/manifest.ts`.
- `docs` — user-facing docs (`docs/*.md`, `docs/reference/`).
- `tests/e2e` — Playwright browser tests.
- `scripts` — build and docs-consistency tooling.

## Running the sandbox locally

```sh
bun run dev:sandbox
```

Opens on `http://127.0.0.1:4173` (the game preview uses port 4174), storing
projects under `.jgz-projects`.
Pass `-- --projects-root <path>` for a disposable project directory while
iterating.

## Tests

```sh
bun test              # unit tests (packages, apps, scripts)
bun run test:e2e       # Playwright browser tests
bun run docs:check     # documentation consistency checks
```

Unit tests live in each package's `test/` directory (`packages/core/test`,
`packages/cli/test`, `apps/sandbox/test`, and so on), as `*.test.ts` files,
and run under Bun's built-in test runner. Browser (e2e) tests live in
`tests/e2e` as `*.pw.ts` files and drive a real Chromium instance against a
locally started sandbox server — see `playwright.config.ts`.

If you add or change a public API in `packages/core`, add or update a unit
test alongside it, and update the relevant page under `docs/reference/` in
the same change.

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

- Every required doc file exists.
- Every JavaScript code block in `docs/tutorial.md` and `docs/cookbook.md`
  actually compiles.
- README's shell command blocks reference real `package.json` scripts.
- The CI workflow includes the expected steps, in order, and the release
  workflow runs the same steps before it publishes.
- User-facing docs don't reintroduce internal "Verification Criteria"
  language, and nothing claims this project is a "clean-room"
  implementation — its behavior is matched against Pygame Zero's docs and
  source by design, so it is an independent implementation but not a
  clean-room one.
- `LICENSE` is the MIT License with both copyright notices (this
  project's, and Robert Penner's for the easing equations), each package's
  `LICENSE` is a copy of it, and every package declares `MIT`.

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

## Releasing

The three packages are released together, at one version.

1. Set the version in `package.json`, in each `packages/*/package.json`, in
   `VERSION` in `packages/cli/src/cli.ts`, and in the three `packages/*`
   workspace entries at the top of `bun.lock`. `bun install` doesn't update
   those, and `bun pm pack` takes browser-runtime's dependency on core from
   them.
2. Make the changelog's newest entry `## <version> — <date>`.
3. Commit, tag the commit `v<version>`, and push both:

   ```sh
   git tag v0.2.1
   git push origin main v0.2.1
   ```

The tag starts `.github/workflows/release.yml`. It runs CI's checks, then
`bun run release:pack --tag <tag> --publish`, which checks that the
versions, the tag and the changelog agree, packs each package with
`bun pm pack`, and publishes core, browser-runtime and the CLI in that
order. It skips any that npm already has at that version, so a release that
failed halfway can be rerun. A prerelease version such as `0.3.0-beta.1` is
published under the `next` tag, leaving `latest` alone.

npm trusts the workflow to publish (trusted publishing), so no token is
stored anywhere and each version carries a provenance statement. To see
what a release would publish, run `bun run build`, `bun run package:check`
and `bun run release:pack`: the tarballs are left in `.release/`.

## Licensing of contributions

`js-game-zero` is MIT licensed, and contributions are accepted under the
same license. Matching Pygame Zero's names, defaults and behavior is
welcome, and reading its docs and source to get them right is fine; copying
its code or documentation text is not, because Pygame Zero is LGPL-3.0.
Write the code and the docs in your own words.
