---
type: Design
title: Why the public surface is two reusable workflows, not a composite Action
description: The decision to keep storybook-ci's consumer surface as reusable workflows rather than follow repo-hygiene-action's move to a composite Action, why that precedent does not transfer, and what would reopen the question.
tags: [design, workflows, actions, consuming, decision]
---

# Why the public surface is two reusable workflows, not a composite Action

**Decision:** [`storybook-tests.yml`](../.github/workflows/storybook-tests.yml) and
[`storybook-screenshots.yml`](../.github/workflows/storybook-screenshots.yml) stay
**reusable workflows**. We do not follow
[`rmartz/repo-hygiene-action`](https://github.com/rmartz/repo-hygiene-action) in
repackaging the consumer surface as a composite Action.

This page exists so a fleet-wide audit that notices the divergence does not have
to re-derive the reasoning.

## The repo-hygiene precedent does not transfer

repo-hygiene's move was driven by a **version-propagation seam**, not by consumer
ergonomics ([rmartz/repo-hygiene#45](https://github.com/rmartz/repo-hygiene/issues/45),
adopted in [rmartz/bot-automerge#29](https://github.com/rmartz/bot-automerge/pull/29)):

- Its check logic lives in a **separate npm package**, `@rmartz/repo-hygiene`. The
  reusable workflow referenced that package by a version string Dependabot could
  not see, so consumers froze at CLI 3.0.0 — bumping the workflow pin could no
  longer move the check logic at all.
- The pin itself was unresolvable: `# v1.0.1` against a tag actually named
  `repo-hygiene-v1.0.1`, so Dependabot never opened a bump PR in any repo.

A composite Action fixes exactly that, by turning the CLI version into a pinned
`package.json` dependency on Dependabot's **npm** channel.

**We have neither problem.** This repo is CI-only and unpublished (see
[AGENTS.md](../AGENTS.md)): the screenshots workflow checks this repo out at its
own `job.workflow_sha` and builds the capture bundle from source, so **the pin is
the version** — there is no second hop to go stale. `tagFormat` is `v${version}`,
and consumers pin a plain `# vX.Y.Z` comment that Dependabot resolves normally.
The seam that justified repo-hygiene's migration does not exist here.

## storybook-tests: a composite Action cannot express it

A composite Action is a sequence of steps **inside one job**. This workflow
declares three jobs, and each of the following depends on that:

- **Two check names.** `Storybook Tests` and `Storybook Build` are separate checks.
  Collapsing them into one job is a breaking change for any consumer that lists
  them in a default-branch ruleset.
- **Parallelism.** The tests and the build run concurrently on separate runners.
  One job serializes them.
- **The change gate.** `detect-changes` plus a per-job `if:` relies on _a skipped
  required job counting as passing_ — the required-checks invariant documented in
  [consuming.md](consuming.md#required-checks-note-important). That topology only
  exists at job level.

## storybook-screenshots: possible, but a net loss

This one is a single job, so a composite Action would work. There is a real win on
offer, and it is worth naming honestly:

> `$GITHUB_ACTION_PATH` already sits outside `GITHUB_WORKSPACE`, so the whole
> `_storybook-ci` checkout-then-move dance — the "build the capture bundle
> outside the consumer's workspace" invariant in [AGENTS.md](../AGENTS.md), and
> the subject of
> [#14](https://github.com/rmartz/storybook-ci/pull/14) — would simply disappear.

Against that, every one of the following moves out of here and into **each
consumer's** YAML:

| Centralized today                                             | Under a composite Action                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `if: …head.repo.full_name == github.repository` (fork skip)   | the consumer writes it — this is the **PAT-must-never-reach-a-fork** invariant        |
| `concurrency:` (per-PR, cancel-in-progress)                   | workflow/job-level only, so the consumer declares it                                  |
| `timeout-minutes` (the backstop behind `capture-deadline-ms`) | **not supported on composite-action steps at all** — the consumer owns it             |
| `continue-on-error: true` at job level                        | step-level only, which greens the _job_ too, losing the red that routes to fix-review |
| `secrets: inherit`                                            | an explicit `with:` input per secret                                                  |

The caller grows from roughly four lines to twenty-five, and the most
security-sensitive rule in the repo becomes a line each consumer has to remember
to write correctly. That inverts the workflow's stated purpose — centralizing the
advisory isolation, per-PR concurrency, fork-skip, fail-vs-cancel, change gating,
and Chromium provisioning so a consumer never restates them.

## What would reopen this

- **We start publishing a package** that the workflows install by version string.
  That recreates repo-hygiene's seam exactly, and the same fix would apply.
- **The bundle-isolation dance becomes a recurring bug source.** The hybrid then
  worth costing: keep both reusable workflows as the consumer surface and factor
  only _bundle provisioning_ into a composite Action the workflow calls. Note the
  `./`-local gotcha in [AGENTS.md](../AGENTS.md) — a reusable workflow's `uses: ./…`
  resolves against the **caller's** checkout, so it would need a self-reference by
  full ref (`rmartz/storybook-ci@<sha>`) plus a self-pin to keep current.
- **GitHub adds job-level controls to composite actions** — `timeout-minutes` on
  composite steps especially — which would shrink the table above materially.
