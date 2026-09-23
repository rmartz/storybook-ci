---
type: Reference
title: Configuration reference
description: Every input to the storybook-tests and storybook-screenshots reusable workflows, with defaults and purpose, plus the one secret the screenshots workflow needs.
tags: [storybook, ci, configuration, inputs]
---

# Configuration reference

Everything project-specific is a workflow input with a sensible default, so a
default-heavy repo adopts with almost no inputs and a divergent repo overrides a
few.

## `storybook-tests.yml` inputs

| Input                 | Default                                    | Purpose                                                        |
| --------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| `package-manager`     | `pnpm`                                     | `pnpm` \| `npm` \| `yarn` — drives install + exec.             |
| `node-version`        | `24.x`                                     | Toolchain version.                                             |
| `test-command`        | `pnpm exec vitest run --project storybook` | The browser test project command.                              |
| `build-command`       | `pnpm build-storybook`                     | Gating production Storybook build.                             |
| `run-build`           | `true`                                     | Whether to also run the gating `build-storybook` job.          |
| `build-needs-browser` | `false`                                    | Provision the Playwright browser in the build job (see below). |
| `browser`             | `chromium`                                 | Playwright browser(s) to install/cache.                        |
| `change-filter`       | `denylist`                                 | `denylist` (skip docs-only) \| `always` \| `off`.              |

### Rendering the built bundle (`build-needs-browser`)

The `Storybook Build` job is browser-free by default: a compile check needs no
browser, and every consumer that only builds keeps today's cost and its 5-minute
budget untouched.

Set `build-needs-browser: true` when the build gate is _build plus a render
assertion against the built bundle_ — for example a script that serves
`storybook-static/` and mounts a few stories in real Chromium to catch a
tree-shaking regression the compile and the Vitest story suite both miss (the
story suite renders through the dev transform and never invokes `storybook
build`). The job then runs the same cached provisioning the test job uses —
honoring `browser` and `package-manager`, sharing one cache entry — and its
budget rises to 8 minutes to absorb the download:

```yaml
with:
  build-needs-browser: true
  build-command: pnpm build-storybook && node scripts/check-storybook-render.mjs
```

Folding the install into `build-command` instead would work but pays an uncached
~130 MB browser download on every run; the input exists so it does not.

## `storybook-screenshots.yml` inputs

| Input                     | Default                              | Purpose                                                                      |
| ------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `package-manager`         | `pnpm`                               | `pnpm` \| `npm` \| `yarn` — drives the consumer install + build.             |
| `node-version`            | `24.x`                               | Toolchain version.                                                           |
| `build-command`           | `pnpm build-storybook`               | Produce the static bundle.                                                   |
| `static-dir`              | `storybook-static`                   | Where `index.json` + assets land.                                            |
| `story-globs`             | `src/**/*.stories.@(ts\|tsx)`        | Which files count as stories.                                                |
| `component-globs`         | `src/**/*.@(ts\|tsx)`                | UI files that gate/resolve (see [change-filtering.md](change-filtering.md)). |
| `storybook-config-globs`  | `.storybook/**`                      | Files whose change forces a full capture.                                    |
| `screenshot-resolver`     | `colocation`                         | `colocation` \| `changed-stories-only` \| `all` \| `import-graph`.           |
| `viewport`                | `1280x720`                           | Capture size (`WIDTHxHEIGHT`).                                               |
| `browser`                 | `chromium`                           | Playwright browser to install/cache.                                         |
| `capture-base`            | `false`                              | Also render the PR base and post Before/After (see below).                   |
| `capture-deadline-ms`     | `240000`                             | Per-render fail-not-cancel budget (keep below the job timeout).              |
| `timeout-minutes`         | `8`                                  | Backstop job timeout when `capture-base` is off.                             |
| `base-timeout-minutes`    | `14`                                 | Backstop job timeout used instead when `capture-base` is on.                 |
| `comment-marker`          | `<!-- storybook-screenshots-bot -->` | Update-in-place key.                                                         |
| `gh-version`              | `2.99.0`                             | Exact `gh` version to install for `--attach` support.                        |
| `pat-expiry-warning-days` | `14`                                 | Warn on the gallery when the PAT expires within this many days.              |

## `capture-base` — the Before/After gallery

With `capture-base: true` the workflow renders the PR **base** as well as its
head and posts the gallery as a `Story | Before | After` table, so a reviewer
judges a visual change against what it replaced instead of from memory:

```yaml
jobs:
  screenshots:
    uses: rmartz/storybook-ci/.github/workflows/storybook-screenshots.yml@<sha> # vX.Y.Z
    secrets: inherit
    with:
      capture-base: true
```

Three things to know:

- **It is best-effort.** The base render happens in a detached worktree at the
  merge base, with its own install and Storybook build. Any failure along that
  path degrades the comment to After-only (with a note saying so) and never
  costs the PR its head screenshots.
- **Asymmetric sets are normal.** A story added in the PR has no Before and one
  deleted in the PR has no After; both still get a row, labelled. When a render
  did not finish, the empty cell reads `not captured` rather than claiming the
  story was added or removed.
- **It roughly doubles the job.** That is why it is opt-in and why the job
  timeout switches to `base-timeout-minutes` (default `14`) — leaving an
  untouched `timeout-minutes` to keep meaning what it did for consumers that
  never enable this. Keep `base-timeout-minutes` above **twice**
  `capture-deadline-ms` plus both builds, so a slow render still _fails_ (routed
  to fix-review) instead of hitting the job timeout and being _cancelled_.

## Secret

- **`STORYBOOK_SCREENSHOT_PAT`** — a **fine-grained PAT** scoped to the consuming
  repository with `Pull requests: Read and write` (a classic PAT with `repo` scope
  also works), provided via `secrets: inherit`. The screenshots workflow
  authenticates `gh` with it to upload the gallery images. The whole screenshots job is skipped on fork PRs so
  the PAT is never exposed to fork-authored code. See
  [authentication.md](authentication.md).

## Caller permissions (not an input)

Both workflows need `contents: read` and `packages: read`; the screenshots
workflow also needs `pull-requests: write`. These are set in the **caller's**
`permissions:` block, not passed as inputs — a called workflow can only narrow
the caller's grant, so the scopes we declare are intersected with yours. See
[consuming.md](consuming.md#private-registry-dependencies) for why
`packages: read` is required even though it is inert in a repo with no `.npmrc`.

## Storybook telemetry is off (not an input)

Every job that shells out to Storybook — `storybook-tests` and `storybook-build`
in `storybook-tests.yml`, and `screenshots` in `storybook-screenshots.yml` — sets
`STORYBOOK_DISABLE_TELEMETRY: '1'` as a job-level `env`. A consuming repo neither
has to set it nor can turn it back on: CI is not a useful telemetry sample, and
no caller wants the extra network round-trip, so it is fixed behavior rather than
a permanent caller-facing input. The `detect-changes` job never invokes
Storybook, so it does not set it.

## Why inputs, not a config file

This surface is small and flat, so inputs beat a `.storybook-ci.yml` config file:
the caller stays self-documenting, it mirrors the `merge-safety` ergonomics, and
there is no per-check matrix (as `repo-hygiene` has) to justify a file.
