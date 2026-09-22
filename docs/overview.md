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
   **user-attachments** uploaded by `gh --attach`.

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

## This repo is CI-only and unpublished

Unlike `@rmartz/merge-safety` (a published package with a dual CLI life), the
capture logic here has no local-run life — it is CI-only, so it ships **no npm
package**. The screenshots workflow checks this repo out at its own pinned SHA,
builds the bundle, and runs it. Releases exist purely so Dependabot's
github-actions ecosystem can bump the `@<sha>` pins consumers put on the two
workflows.
