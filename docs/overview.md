---
type: Reference
title: What storybook-ci is
description: The shared Storybook CI action — Chromium provisioning, Storybook tests, and per-PR screenshot galleries — delivered as two reusable workflows a fleet repo pins by SHA.
tags: [storybook, ci, screenshots, overview]
---

# What storybook-ci is

`storybook-ci` extracts the Storybook CI tooling that was duplicated per-repo
across the fleet's Next.js projects into one shared repository. It handles three
concerns behind two reusable workflows a consuming repo pins by SHA:

1. **Chromium/Playwright provisioning** — download + cache the browser binary,
   keyed on the lockfile with a prefix restore-key, retrying transient CDN/apt
   failures.
2. **Storybook interaction/render tests** — the vitest browser project, plus an
   optional gating `build-storybook`.
3. **Per-PR screenshot galleries** — screenshot the stories a PR's changes touch
   and post them as one update-in-place PR comment whose images are GitHub
   **user-attachments** uploaded by `gh --attach`. Opt into `capture-base` and
   the same comment renders the PR base too, Before and After side by side.

The goal is that a repo adopts all three with a handful of caller lines, and the
subtle operational reasoning — concurrency, fail-vs-cancel, deadlines, fork
exclusion, story-change gating — lives **once** here instead of drifting across
copies.

## The two reusable workflows

| Workflow                                                                      | Gating?      | Trigger permissions                       | Secrets                                 | What it does                                                                                                              |
| ----------------------------------------------------------------------------- | ------------ | ----------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`storybook-tests.yml`](../.github/workflows/storybook-tests.yml)             | **gating**   | `contents: read`                          | none                                    | Runs the browser test project and (optionally) the gating `build-storybook`. Change-gated by a `detect-changes` denylist. |
| [`storybook-screenshots.yml`](../.github/workflows/storybook-screenshots.yml) | **advisory** | `contents: read` + `pull-requests: write` | fine-grained PAT via `secrets: inherit` | Builds Storybook, screenshots the resolved-changed stories, posts the gallery via `gh --attach`.                          |

A consuming repo may adopt either or both. See [consuming.md](consuming.md).

## Why a reusable workflow, not a composite action

Two things decide it. First, the screenshots workflow needs a **user-level PAT**
(the GitHub user-attachments upload endpoint rejects the Actions `GITHUB_TOKEN` —
see [authentication.md](authentication.md)), and `secrets: inherit` on a reusable
workflow passes it cleanly where a composite action would force it into an
explicit `with:` input. Second, the most valuable thing to centralize is the
~50 lines of subtle operational reasoning (triggers, concurrency, fork-skip,
fail-not-cancel) — which only a reusable workflow, owning its own job, captures.
A composite action leaves all of that in each caller.

## Fail, don't cancel (screenshots)

The capture script enforces its own `capture-deadline-ms` wall-clock budget, set
below the job's `timeout-minutes`, and exits non-zero on the deadline or a broken
story. That is deliberate: a job that hits `timeout-minutes` is _cancelled_ (which
the PR coordinator escalates to a human), whereas a non-zero exit is a _failure_
(auto-routed to fix-review, where an agent can fix a slow or broken story). The
job's `continue-on-error` keeps that failure non-blocking for the merge.

A failed capture still posts whatever it did get. But when **no** head story
screenshots and no Before render is usable, there is nothing to show: the job
fails without posting, and any previous gallery comment is left as it was rather
than overwritten with an empty table.

The corollary: consumer **misconfiguration** is neither a failure nor a
cancellation. A missing or invalid `STORYBOOK_SCREENSHOT_PAT` posts an advisory
comment for a human and lets the job succeed with a warning, while a GitHub-side
failure (rate limit, outage) still fails — see
[authentication](authentication.md#missing-or-invalid-pat--advisory-never-red).

## Best-effort Before render (screenshots)

`capture-base` adds a second render — the PR's base, built in a detached worktree
at the merge base — so the gallery can pair each story's old and new rendering.
It is deliberately best-effort and the asymmetry of the two sides is expected,
not an error:

- Every step of the base path is isolated: a base branch that will not install or
  build costs the PR its Before column and nothing else. The head screenshots are
  captured and posted regardless, with a note explaining the gap.
- A story added in the PR has no Before; one deleted has no After. The base-side
  file list is taken from `git diff --name-status`, whose second field is the
  **pre-rename** path, so a renamed story still finds itself in the base
  `index.json` instead of silently losing its Before.
- Two renders need roughly twice the budget, so the job timeout switches to
  `base-timeout-minutes` — see [configuration.md](configuration.md).

## This repo is CI-only and unpublished

Unlike `@rmartz/merge-safety` (a published package with a dual CLI life), the
capture logic here has no local-run life — it is CI-only, so it ships **no npm
package**. The screenshots workflow checks this repo out at its own pinned SHA,
builds the bundle, and runs it. Releases exist purely so Dependabot's
github-actions ecosystem can bump the `@<sha>` pins consumers put on the two
workflows.
