---
type: Reference
title: Authentication
description: Why posting the screenshot gallery via gh --attach requires a classic PAT rather than the Actions GITHUB_TOKEN, and how the STORYBOOK_SCREENSHOT_PAT secret reaches the workflow without exposure on fork PRs.
tags: [storybook, ci, screenshots, auth, pat]
---

# Authentication

The screenshots workflow uploads its gallery images to GitHub's native
**user-attachments** store (`github.com/user-attachments/…`) with
`gh pr comment --attach`. That upload endpoint accepts only **user-level** auth,
which shapes the whole secret story.

## Why not the Actions `GITHUB_TOKEN`

The user-attachments upload endpoint **categorically rejects** the Actions
`GITHUB_TOKEN` with `unsupported authentication type`. That token is a GitHub App
installation token (`ghs_`), and so is a custom GitHub App token — the endpoint
accepts only a **classic PAT** (`ghp_`) or a user OAuth token. This was settled
empirically; fine-grained PATs were never confirmed to work, so assume a **classic
PAT**.

## The secret

- **Name:** `STORYBOOK_SCREENSHOT_PAT`
- **Type:** classic PAT with `repo` scope, owned by a user or bot account.
- **How it reaches the workflow:** the consumer caller passes `secrets: inherit`,
  which forwards the secret to the reusable workflow. The workflow sets
  `GH_TOKEN` to it only in the capture step.

Set it ideally **org-wide** so every consuming repo inherits it; on a personal
account it is a per-repo Actions secret named `STORYBOOK_SCREENSHOT_PAT`.

## Fork safety

The entire screenshots job is skipped when the PR head is a fork
(`github.event.pull_request.head.repo.full_name != github.repository`). A classic
PAT must **never** be exposed to fork-authored code, and a fork PR receives a
read-only token anyway, so skipping is both the safe and the correct behavior. If
the secret is absent on a same-repo PR, the capture step logs a clear notice and
exits 0 rather than failing.

## `gh` version

The `--attach` flag requires `gh ≥ 2.99.0`. Runners did not all ship that version
at the time this was built, so the workflow installs the exact `gh-version`
(default `2.99.0`) explicitly rather than depending on the preinstalled `gh`.
