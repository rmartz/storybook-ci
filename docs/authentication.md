---
type: Reference
title: Authentication
description: Why posting the screenshot gallery via gh --attach requires a user-level PAT rather than the Actions GITHUB_TOKEN, the tested minimum permissions for a fine-grained PAT, and how the STORYBOOK_SCREENSHOT_PAT secret reaches the workflow without exposure on fork PRs.
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
installation token (`ghs_`), and so is a custom GitHub App token. The endpoint
wants **user-level** auth: a personal access token or a user OAuth token. Both
PAT flavors qualify — see below.

## Use a fine-grained PAT

**Tested 2026-09-22 against v1.2.0**, in consumer `rmartz/hidden-role-game`
([PR 907](https://github.com/rmartz/hidden-role-game/pull/907),
[run 35774585336](https://github.com/rmartz/hidden-role-game/actions/runs/35774585336)):
a fine-grained PAT **works**. Every step from `Verify screenshot PAT` through
`Capture screenshots and post PR comment` succeeded, and the posted gallery's
`user-attachments` image resolved `HTTP 200 image/png`.

The token that worked:

| Field                  | Value                                       |
| ---------------------- | ------------------------------------------- |
| Type                   | Fine-grained PAT                            |
| Repository access      | **Only select repositories** — the consumer |
| Repository permissions | **Pull requests: Read and write**           |
| User permissions       | none                                        |

`Metadata: Read` is GitHub's mandatory baseline and is granted automatically, so
**`Pull requests: Read and write` is the only permission you choose.**

**`Contents` is not required.** Do not add it. `actions/checkout` clones the
consumer with the job's own `GITHUB_TOKEN`; this PAT authenticates `gh` for
exactly two things — the attachment upload and the comment write — and neither
touches repository contents. The `Contents: Read-only` in the original proposal
was a guess, and the measurement disproved it.

**Set an expiration.** Fine-grained PATs support one, and rotation is cheap here:
the workflow warns you **before** it lapses (below), and an already-expired token
is caught by the preflight and announces itself as an advisory PR comment rather
than failing silently.

### A classic PAT also works, but grant far more

A classic PAT with `repo` scope is the historical setup and still functions. Prefer
fine-grained anyway: `repo` scope grants full read/write across **every repository
its owner can reach**, while the tested fine-grained token grants pull-request
access to **exactly one**. Same capability, a fraction of the blast radius.

### Untested

The measurement used a **user-owned** token scoped to a **single repository**. An
**organization-owned** fine-grained PAT has not been tested. If you set one up
org-wide, treat it as unverified until a run posts a gallery.

## The secret

- **Name:** `STORYBOOK_SCREENSHOT_PAT`
- **Type:** fine-grained PAT with `Pull requests: Read and write` on the consuming
  repository (a classic PAT with `repo` scope also works), owned by a user or bot
  account.
- **How it reaches the workflow:** the consumer caller passes `secrets: inherit`,
  which forwards the secret to the reusable workflow. The workflow sets
  `GH_TOKEN` to it only in the capture step.

Set it ideally **org-wide** so every consuming repo inherits it; on a personal
account it is a per-repo Actions secret named `STORYBOOK_SCREENSHOT_PAT`. Note
that a fine-grained PAT scoped to one repository cannot serve an org-wide secret —
scope it to every consuming repo, or accept per-repo tokens.

## Verifying your setup — a green job is not proof

The screenshots job gates on whether a PR's changes resolve to any stories. On a
PR that resolves to **zero** stories, the gate short-circuits everything after it,
including the PAT check:

```
success  Resolve stories to capture (gate)
skipped  Verify screenshot PAT
skipped  Install consumer dependencies / Build Storybook / Install gh / Capture
```

That is correct behavior, but it means **a green screenshots job on a PR with no
story-adjacent change has not exercised the PAT at all.** To validate a new token,
use a PR that actually touches a story file or a co-located component.

## Expiring PAT — a warning on the gallery

Once the PAT is within `pat-expiry-warning-days` of expiry (default **14**), the
gallery comment carries a footer naming the date:

> ⚠️ The `STORYBOOK_SCREENSHOT_PAT` secret expires in **9 days** (2026-10-01).
> Rotate it to keep this gallery posting — see docs/authentication.md.

This is a **nudge, not a gate**: the token is still valid, `pat_status` stays `ok`,
and the gallery posts exactly as usual. The warning rides on the gallery comment
rather than a second comment of its own, so it appears where a reviewer is already
looking and cannot accumulate.

The date comes from the `github-authentication-token-expiration` response header,
which GitHub returns on the request the preflight already makes — no extra API
call and no extra permission.

**A token created with no expiration date never warns.** GitHub sends no header
for one, so there is nothing to count down. That is the main practical reason to
set an expiration: a no-expiry token trades a scheduled, announced rotation for an
unannounced failure whenever it is eventually revoked.

## Missing or invalid PAT — advisory, never red

A same-repo PR whose PAT is **misconfigured** never fails the merge **and never
turns the screenshots job red**. Misconfiguration is not a code problem, so a red
job (routed to fix-review) would only send an agent after something it cannot fix.
Before the expensive Storybook build, a **preflight** step checks the PAT:

- **missing** (secret not set) or **invalid** (rejected: bad credentials, or a
  missing scope/permission) → the job posts a single, update-in-place **advisory
  PR comment** naming the reason, adds a `::warning::` annotation to the run, skips
  the build and capture, and **succeeds**. The comment is posted with the Actions
  `GITHUB_TOKEN` (which can post a normal comment even though it cannot do
  `--attach`), tagged with its own marker (`<!-- storybook-screenshots-advisory -->`)
  so a reviewer sees exactly one notice.
- **valid** → any prior advisory comment is deleted and the gallery is captured and
  posted as usual.

If the PAT authenticates in preflight but the user-attachments upload is still
rejected for a token reason (e.g. a missing scope), the capture step posts the same
`invalid` advisory, annotates the run, and exits **zero**.

## GitHub failures — still red

A failure on GitHub's side is **not** misconfiguration, and still fails the job
(non-blocking for the merge, since the job is `continue-on-error`), like any other
flaky dependency:

- **Rate limit** — the PAT's account has exhausted its API quota (the `--attach`
  upload is GraphQL-heavy, so this can happen mid-job). The job also posts a
  rate-limited advisory saying the token is fine and to re-run once the limit
  resets, so nobody rotates a working PAT.
- **Anything else** — a 5xx, a GraphQL error, a network failure. No advisory; the
  error is in the job log.

The failure is classified from `gh`'s stderr: a rate-limit message first (GitHub
reports it as a 403 too), then any other 401/403 as a rejected token, and everything
else as GitHub failing. So the states are: valid → gallery; missing/invalid →
advisory and a green job with a warning; GitHub failure → red job; and in every case
the merge is never blocked.

## Fork safety

The entire screenshots job is skipped when the PR head is a fork
(`github.event.pull_request.head.repo.full_name != github.repository`). The PAT
must **never** be exposed to fork-authored code — fine-grained or classic — and a
fork PR receives a read-only token anyway, so skipping is both the safe and the
correct behavior.

## `gh` version

The `--attach` flag requires `gh ≥ 2.99.0`. Runners did not all ship that version
at the time this was built, so the workflow installs the exact `gh-version`
(default `2.99.0`) explicitly rather than depending on the preinstalled `gh`.
