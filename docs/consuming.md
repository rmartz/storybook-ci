---
type: Reference
title: Adopting storybook-ci in a consuming repo
description: The two thin caller workflows a fleet repo adds to consume the shared Storybook tests and screenshots reusable workflows, what they replace, and how the pins stay current.
tags: [storybook, ci, consuming, adoption]
---

# Adopting storybook-ci in a consuming repo

A consuming repo adds one or both of the thin caller workflows below. Each pins
the shared reusable workflow by a full commit SHA with a `# vX.Y.Z` comment;
Dependabot's `github-actions` ecosystem bumps the pin via PRs, so shared-logic
changes propagate with no edit in the consumer.

Replace `<sha>` with the current release commit of `rmartz/storybook-ci` (see the
repo's latest release).

## Storybook tests (gating)

```yaml
# .github/workflows/storybook-tests.yml
name: Storybook Tests
on:
  pull_request: {}
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  storybook-tests:
    uses: rmartz/storybook-ci/.github/workflows/storybook-tests.yml@<sha> # vX.Y.Z
    with:
      test-command: pnpm exec vitest run --project storybook
```

## Storybook screenshots (advisory)

```yaml
# .github/workflows/storybook-screenshots.yml
name: Storybook Screenshots
on:
  pull_request:
    branches: [main]
    paths:
      - 'src/**/*.stories.tsx'
      - 'src/**/*.stories.ts'
      - 'src/**'
      - '.storybook/**'
permissions:
  contents: read
  pull-requests: write
jobs:
  screenshots:
    uses: rmartz/storybook-ci/.github/workflows/storybook-screenshots.yml@<sha> # vX.Y.Z
    secrets: inherit # provides STORYBOOK_SCREENSHOT_PAT (classic PAT)
```

Both scopes are required: a caller's `permissions:` block is exhaustive — every
scope it omits becomes `none` — and the reusable workflow checks out the consumer
repo, so omitting `contents: read` fails the run at checkout.

The screenshots caller needs **no** `concurrency` or `continue-on-error` block —
per-PR concurrency and the advisory isolation are centralized in the reusable
workflow. `secrets: inherit` is what forwards `STORYBOOK_SCREENSHOT_PAT`; see
[authentication.md](authentication.md).

## What adoption removes

A repo migrating off a bespoke implementation deletes:

- its hand-rolled `storybook-screenshots.yml` and capture script;
- any `storybook-screenshots-cleanup.yml` and the per-PR orphan image branch
  (`gh-screenshots-pr-<N>`) — `gh --attach` hosts the images natively, so there
  is no branch to clean up and no `contents: write` grant needed;
- the `storybook-tests` / `storybook-build` jobs in its main CI workflow (moved
  into the tests caller).

## Required-checks note (important)

If a repo adds **Storybook Tests** to its default-branch ruleset's required
checks, the check **must** stay change-gated by the reusable workflow's
`detect-changes` job + per-job `if:` — which it already is. A skipped required job
counts as passing, so gating this way is safe. **Never** gate a required check
with `on.paths`: a required check that never runs because its paths didn't match
hangs the PR forever. The screenshots workflow is advisory and never a required
check, so its caller may safely use `on.paths` (as shown above) to avoid running
on unrelated PRs.

## How the version resolves

The screenshots workflow runs this repo's own capture code. It does not install a
published package — it checks `rmartz/storybook-ci` out at the exact SHA the
consumer pinned (`job.workflow_sha`), builds the bundle, and runs it. So a pinned
ref is fully reproducible, and the version lives only in the git tag Dependabot
bumps — never hardcoded in a workflow file.

That bundle builds in **isolation from your repository**. `actions/checkout`
refuses any path outside `GITHUB_WORKSPACE`, so the checkout lands at
`_storybook-ci` inside your checkout and the workflow immediately moves it to
`$RUNNER_TEMP` before installing anything. That matters because a package manager
reads the directories _above_ the one it installs in: a root `pnpm-workspace.yaml`
would make our install resolve **your** dependency graph instead of ours, and a
root `.npmrc` scoping a private registry (`@scope:registry=…` with an auth token
we are not given) would then fail that install with `ERR_PNPM_FETCH_401` on
packages we never declared. The install also runs under the pnpm **our**
`package.json` pins, so your pnpm major cannot break it.

Two consequences for you:

- Nothing in your `.npmrc`, `pnpm-workspace.yaml`, or lockfile affects the capture
  bundle, and you do **not** need to grant `packages: read` or pass a registry
  token for it.
- `_storybook-ci` never survives into your install step, so a workspace that globs
  broadly (`packages: ['**']`) will not pick it up as a member.
