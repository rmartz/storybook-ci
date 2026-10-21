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
  packages: read
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
  packages: read
  pull-requests: write
jobs:
  screenshots:
    uses: rmartz/storybook-ci/.github/workflows/storybook-screenshots.yml@<sha> # vX.Y.Z
    secrets: inherit # provides STORYBOOK_SCREENSHOT_PAT (fine-grained PAT)
```

Every scope listed is required, in every consumer. A caller's `permissions:`
block is exhaustive (every scope it omits becomes `none`), and each reusable
workflow requests the scopes it uses. If a called workflow requests a scope the
caller does not grant, GitHub rejects the whole run before any job is created.
See [Diagnosing a missing grant](#diagnosing-a-missing-grant). For why
`packages: read` is among them, see
[Private-registry dependencies](#private-registry-dependencies).

The screenshots caller needs **no** `concurrency` or `continue-on-error` block —
per-PR concurrency and the advisory isolation are centralized in the reusable
workflow. `secrets: inherit` is what forwards `STORYBOOK_SCREENSHOT_PAT`; see
[authentication.md](authentication.md).

When validating a newly-configured PAT, use a PR that actually touches a story
file or a co-located component. On a PR whose changes resolve to zero stories the
gate short-circuits everything after it — including the PAT check — so the job
goes green **without having exercised the token at all**. See
[authentication.md](authentication.md#verifying-your-setup--a-green-job-is-not-proof).

### Before/After (default)

The workflow renders the PR base alongside its head, so the gallery shows each
story's old and new rendering side by side. Set `capture-base: false` for an
After-only gallery:

```yaml
jobs:
  screenshots:
    uses: rmartz/storybook-ci/.github/workflows/storybook-screenshots.yml@<sha> # vX.Y.Z
    secrets: inherit
    with:
      capture-base: false
```

The base render roughly doubles the job (a second install, Storybook build, and
capture), so the job timeout is `base-timeout-minutes` while it is on and
`timeout-minutes` only when it is off. The base render is best-effort — if it
fails, the comment degrades to After-only and says so. See
[configuration.md](configuration.md#capture-base--the-beforeafter-gallery).

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
  token _for it_ — your own install is a separate matter, covered next.
- `_storybook-ci` never survives into your install step, so a workspace that globs
  broadly (`packages: ['**']`) will not pick it up as a member.

## Private-registry dependencies

Your **own** install — the step that runs `pnpm install` / `npm ci` / `yarn
install` in your checkout — does read your `.npmrc`. If it scopes a package to
GitHub Packages, that install needs credentials, and both workflows provide them:

- the job token carries `packages: read`, so it can read same-owner packages; and
- the install step exports `NODE_AUTH_TOKEN: ${{ github.token }}`, which is what
  an `.npmrc` line like `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}`
  interpolates. With `capture-base` on, the second install (of your base
  branch) gets the same token, so the Before column resolves private packages
  too.

No PAT is involved — `STORYBOOK_SCREENSHOT_PAT` authorizes gallery uploads only
(see [authentication.md](authentication.md)) and never reaches the install.

That is why both workflows request `packages: read`: without it the job token
cannot read GitHub Packages, and a private install fails with `ERR_PNPM_FETCH_401`
and `No authorization header was set for the request`.

**You must list `packages: read` in your caller's `permissions:` block, whether or
not you have an `.npmrc`.** Our workflows request the scope, and a called
workflow can only narrow the caller's grant, never widen it. A caller that omits
it does not get a 401: the whole run fails to start
([see below](#diagnosing-a-missing-grant)). In a repo with no `.npmrc` the
_token_ is inert, since nothing interpolates it, but the _grant_ is still
required.

Both workflows restore your package-manager store with `actions/setup-node`'s
`cache:` (keyed on your lockfile), and they share **one** cache entry — a store the
tests job saved also warms the screenshots job. That is an optimization, never a
substitute for the credentials above: a lockfile change is exactly when the store
goes cold and the install must authenticate. In the screenshots job the restore
runs after the capture bundle is built, so your store never reaches our isolated
install.

Cross-owner packages, which the built-in `GITHUB_TOKEN` cannot read, are not
supported today; open an issue if you need one.

## Diagnosing a missing grant

When a caller omits a scope the reusable workflow requests, the run's conclusion
is **`startup_failure`**, with zero jobs and zero check runs. Nothing installs,
so there is no `ERR_PNPM_FETCH_401` to find in a log. This happens in every
consumer, with or without an `.npmrc`, and it is easy to misread:

- A required check such as `storybook-tests / Storybook Tests` never reports, so
  the PR sits blocked on a check that is _missing_, not failing.
- A path-filtered screenshots caller looks green on the PR that bumps the pin,
  because it did not run there. It fails on the next PR that touches the filtered
  paths.

The run page shows an error naming the nested job and the scope it requested
but was not allowed. Add that scope to the caller's `permissions:` block and push
again.

## Upgrading from v1.2.1 or earlier

v1.2.2 added `packages: read` to both reusable workflows. It was released as a
patch, but it breaks any caller that does not grant the scope: moving the pin
alone turns a working caller into `startup_failure`. Dependabot presents the
bump as routine.

**If you are pinned at v1.2.1 or earlier, add `packages: read` to both caller
workflows before, or in the same PR as, moving the pin.** From here on, any new
scope a reusable workflow requests ships as a major release, so a minor or patch
bump never needs a permission change.
