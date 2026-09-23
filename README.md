# storybook-ci

Shared **Storybook CI** for the fleet's Next.js repos, delivered as two reusable
GitHub Actions workflows a repo pins by SHA:

- **Chromium/Playwright provisioning** — download + cache the browser binary.
- **Storybook tests** — the vitest browser project, plus an optional gating
  `build-storybook`.
- **Per-PR screenshot galleries** — screenshot the stories a PR's changes touch
  and post them as one update-in-place PR comment whose images are GitHub
  user-attachments uploaded by `gh --attach` (no orphan branch, no cleanup
  workflow).

The subtle operational reasoning — concurrency, fail-vs-cancel, deadlines, fork
exclusion, story-change gating — lives here once, so a consuming repo adopts it
with a handful of caller lines instead of copy-pasting logic that drifts.

## Quickstart

**Gating tests** — `.github/workflows/storybook-tests.yml`:

```yaml
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

**Advisory screenshots** — `.github/workflows/storybook-screenshots.yml`:

```yaml
name: Storybook Screenshots
on:
  pull_request:
    branches: [main]
    paths: ['src/**/*.stories.tsx', 'src/**/*.stories.ts', 'src/**', '.storybook/**']
permissions:
  contents: read
  packages: read
  pull-requests: write
jobs:
  screenshots:
    uses: rmartz/storybook-ci/.github/workflows/storybook-screenshots.yml@<sha> # vX.Y.Z
    secrets: inherit # provides STORYBOOK_SCREENSHOT_PAT (fine-grained PAT)
```

Replace `<sha>` with the current release commit of `rmartz/storybook-ci`;
Dependabot's `github-actions` ecosystem keeps the pin current.

Keep `packages: read` even if you think you don't need it: a caller's
`permissions:` block is exhaustive, a called workflow can only narrow it, and
omitting the scope fails the dependency install with `ERR_PNPM_FETCH_401` in any
repo whose `.npmrc` scopes a package to GitHub Packages. See
[docs/consuming.md](docs/consuming.md#private-registry-dependencies).

## Screenshot posting needs a user-level PAT

The GitHub user-attachments upload endpoint (`gh --attach`) rejects the Actions
`GITHUB_TOKEN`, so the screenshots workflow authenticates `gh` with a PAT named
`STORYBOOK_SCREENSHOT_PAT`, forwarded by `secrets: inherit`. Use a **fine-grained
PAT** scoped to the consuming repository with a single permission,
**`Pull requests: Read and write`** — tested, and `Contents` is not needed. A
classic `repo`-scoped PAT also works but grants far more. The job is skipped on
fork PRs so the PAT never reaches fork-authored code. See
[docs/authentication.md](docs/authentication.md).

## Documentation

Full documentation lives in [`docs/`](docs/index.md):

- [What storybook-ci is](docs/overview.md)
- [Adopting it in a consuming repo](docs/consuming.md)
- [Configuration reference](docs/configuration.md)
- [Change filtering](docs/change-filtering.md)
- [Authentication](docs/authentication.md)

## Development

This repo is CI-only and unpublished — the capture logic (TypeScript, with the
story-resolver as the unit-tested core) is built by the screenshots workflow at
the pinned SHA and run directly.

```bash
pnpm install
pnpm run build        # tsup → dist
pnpm run test         # vitest — the resolver
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

See [AGENTS.md](AGENTS.md) for the contributor guide.
