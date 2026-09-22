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

| Input             | Default                                    | Purpose                                               |
| ----------------- | ------------------------------------------ | ----------------------------------------------------- |
| `package-manager` | `pnpm`                                     | `pnpm` \| `npm` \| `yarn` — drives install + exec.    |
| `node-version`    | `24.x`                                     | Toolchain version.                                    |
| `test-command`    | `pnpm exec vitest run --project storybook` | The browser test project command.                     |
| `build-command`   | `pnpm build-storybook`                     | Gating production Storybook build.                    |
| `run-build`       | `true`                                     | Whether to also run the gating `build-storybook` job. |
| `browser`         | `chromium`                                 | Playwright browser(s) to install/cache.               |
| `change-filter`   | `denylist`                                 | `denylist` (skip docs-only) \| `always` \| `off`.     |

## `storybook-screenshots.yml` inputs

| Input                    | Default                              | Purpose                                                                      |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------- |
| `package-manager`        | `pnpm`                               | `pnpm` \| `npm` \| `yarn` — drives the consumer install + build.             |
| `node-version`           | `24.x`                               | Toolchain version.                                                           |
| `build-command`          | `pnpm build-storybook`               | Produce the static bundle.                                                   |
| `static-dir`             | `storybook-static`                   | Where `index.json` + assets land.                                            |
| `story-globs`            | `src/**/*.stories.@(ts\|tsx)`        | Which files count as stories.                                                |
| `component-globs`        | `src/**/*.@(ts\|tsx)`                | UI files that gate/resolve (see [change-filtering.md](change-filtering.md)). |
| `storybook-config-globs` | `.storybook/**`                      | Files whose change forces a full capture.                                    |
| `screenshot-resolver`    | `colocation`                         | `colocation` \| `changed-stories-only` \| `all` \| `import-graph`.           |
| `viewport`               | `1280x720`                           | Capture size (`WIDTHxHEIGHT`).                                               |
| `browser`                | `chromium`                           | Playwright browser to install/cache.                                         |
| `capture-deadline-ms`    | `240000`                             | Fail-not-cancel budget (keep below `timeout-minutes`).                       |
| `timeout-minutes`        | `8`                                  | Backstop job timeout.                                                        |
| `comment-marker`         | `<!-- storybook-screenshots-bot -->` | Update-in-place key.                                                         |
| `gh-version`             | `2.99.0`                             | Exact `gh` version to install for `--attach` support.                        |

## Secret

- **`STORYBOOK_SCREENSHOT_PAT`** — a **classic PAT** with `repo` scope, provided
  via `secrets: inherit`. The screenshots workflow authenticates `gh` with it to
  upload the gallery images. The whole screenshots job is skipped on fork PRs so
  the PAT is never exposed to fork-authored code. See
  [authentication.md](authentication.md).

## Why inputs, not a config file

This surface is small and flat, so inputs beat a `.storybook-ci.yml` config file:
the caller stays self-documenting, it mirrors the `merge-safety` ergonomics, and
there is no per-check matrix (as `repo-hygiene` has) to justify a file.
