# Agent guide — storybook-ci

This repo is the fleet's shared **Storybook CI**: Chromium/Playwright
provisioning, Storybook interaction/render tests, and per-PR screenshot galleries
posted via `gh --attach` — delivered as **two reusable workflows** a consuming
repo pins by SHA and Dependabot keeps current. See [README.md](README.md) and the
[documentation](docs/index.md).

It was extracted from the bespoke implementation in `rmartz/hidden-role-game` (the
capture script, the Chromium setup action, and the test/build jobs), replacing the
old orphan-branch image hosting with native `gh --attach` user-attachments.

## This repo is CI-only and unpublished

Unlike `@rmartz/merge-safety`, the capture logic here has **no local-run life** —
it is CI-only, so this repo ships **no npm package** (`package.json` is `private`
with a frozen `0.0.0` placeholder; there is no `bin`/`exports`/`files`, no
`publishConfig`, and `.releaserc.json` has **no `@semantic-release/npm`**). The
screenshots reusable workflow runs the capture code by checking this repo out at
its own pinned SHA (`job.workflow_sha`), building the tsup bundle, and running
`dist/bin/screenshots.js`. Releases exist only so Dependabot's github-actions
ecosystem can bump the `@<sha>` pins consumers put on the workflows — **do not**
bump `package.json` by hand.

## The public surface is the two workflow interfaces

The consumer-facing contract is the **inputs** of
[`storybook-tests.yml`](.github/workflows/storybook-tests.yml) and
[`storybook-screenshots.yml`](.github/workflows/storybook-screenshots.yml), and
the `STORYBOOK_SCREENSHOT_PAT` secret. Treat those input names/defaults as a
compatibility surface: renaming or removing one is a breaking change for every
consumer. Add inputs with safe defaults rather than repurposing existing ones.
Full reference: [docs/configuration.md](docs/configuration.md).

## Two operational invariants that must not regress

- **Fail, don't cancel (screenshots).** The capture script enforces its own
  `capture-deadline-ms`, kept below the job `timeout-minutes`, and exits non-zero
  on the deadline or a broken story — a _failure_ routed to fix-review, not a
  _cancellation_ escalated to a human. Keep the deadline below the timeout.
- **Fork safety.** The screenshots job is skipped on fork PRs; the classic PAT
  must never reach fork-authored code. See [docs/authentication.md](docs/authentication.md).

## Reusable-workflow gotcha: no `./`-local actions across the boundary

A reusable workflow's `uses: ./…` resolves against the **caller's** checkout, not
this repo's, so the two reusable workflows **inline** their toolchain/Chromium
setup rather than referencing `./.github/actions/setup`. That composite action is
the canonical FR-1 provisioning and is used by this repo's **own** CI; if you
change the provisioning logic, update both it and the inlined copies.

## Documentation — update it as part of every task

- **Read first.** Before editing, read the relevant `docs/` page(s) and this file.
- **Update in the same PR.** If your change adds, alters, or contradicts a
  documented input, resolver behavior, or invariant, fix the doc in the same PR.
- **Docs follow OKF.** Pages under `docs/` use OKF frontmatter and stay reachable
  from [docs/index.md](docs/index.md). The `okf`/`okf-index` checks enforce this —
  see [docs/okf-format.md](docs/okf-format.md).

## Repository conformance

This repo is held to the shared
[repository checklist](https://github.com/rmartz/ai/blob/main/docs/guidance/repository-checklist.md)
and **self-manages** its own config — fix conformance gaps directly here, in a PR.
Bootstrap (`ai-ensure-*`) is a one-time starter, not an ongoing manager.

- **Hygiene** arrives via the [`repo-hygiene.yml`](.github/workflows/repo-hygiene.yml)
  caller (SHA-pinned, Dependabot-bumped), running conflict-markers, action-pins,
  package-pins, docs-links, md-pairing, okf, okf-index, and file-caps.
- **Safe bot merge:** this repo consumes [`merge-safety.yml`](.github/workflows/merge-safety.yml)
  (required check `merge-safety`) and [`bot-automerge.yml`](.github/workflows/bot-automerge.yml).
- **CI, releases, labels** are owned here: typecheck / lint / format / build /
  test / release-dry-run ([ci.yml](.github/workflows/ci.yml)), the PR-title lint,
  the post-merge commit-convention tripwire, and the semantic-release
  [release.yml](.github/workflows/release.yml).

## Common commands

```bash
pnpm install                 # deps (run in each worktree first)
pnpm run build               # tsup → dist (ESM)
pnpm run typecheck           # tsc --noEmit
pnpm run lint                # eslint (incl. max-lines caps)
pnpm run format:check        # prettier --check
pnpm run test                # vitest (the resolver is the tested core)
```

Before pushing, run `ai-pre-push-verify -C <worktree>` and fix every failure — it
re-runs the actual CI checks locally so a green result predicts CI.

## Code standards

Most are enforced by eslint; the intent:

- **Strict TypeScript.** No `any`, no `@ts-ignore` (use `@ts-expect-error` with a
  reason). Favor type inference; explicit generic args are a smell.
- **Named exports only**; no default exports. No IIFEs. Prefer `async/await`.
- **Value sets:** default to a structural string union or `as const` array over an
  `enum` (the `ScreenshotResolver` union is the example).
- **File caps:** `max-lines` 480 (src) / 720 (tests) via eslint; non-TS files are
  capped by the `file-caps` check per [`.repo-hygiene.yml`](.repo-hygiene.yml).
  The response to a cap is extraction, never terser code.
- **Pin dependencies** to full `major.minor.patch` (keep the `^`), and **SHA-pin**
  every third-party GitHub Action with a `# vX.Y.Z` comment.

## Worktrees, PRs, and releases

- **Work in a dedicated worktree** under `.git-worktrees/` (`ai-new-worktree`),
  never on `main` in the root checkout. Run `pnpm install` in a fresh worktree
  first. (The one exception was the genesis scaffold commit, which had no prior
  branch to base a worktree on.)
- **PR titles must be Conventional Commits.** The repo squash-merges using the PR
  title, so it is the only subject that reaches `main`.
- **Releases are automatic** via `semantic-release` on every push to `main`: it
  analyzes the conventional subjects since the last `vX.Y.Z` tag, computes the
  next version, and creates the tag + GitHub Release. **Version mapping (v0):**
  `feat:` → minor; `fix:` / `perf:` → patch; a breaking `!` is **capped at minor**
  while pre-1.0. Cutting `1.0.0` is a deliberate manual act at go-live.

## Agent directive files

- **`AGENTS.md` is the single source of truth** for agent instructions — author
  directives here, never in `CLAUDE.md`.
- **Every `AGENTS.md` has a companion `CLAUDE.md`** (a bare `@AGENTS.md` import),
  enforced by the `md-pairing` check.
