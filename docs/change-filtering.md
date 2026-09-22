---
type: Reference
title: Change filtering
description: How storybook-ci maps a PR's changed files to the stories that get screenshotted — the resolver modes, the precedence rules, and the residual coverage gap of each mode.
tags: [storybook, ci, screenshots, resolver]
---

# Change filtering

The request has two parts in productive tension: _don't run on PRs that don't
change UI, but do run reliably when UI does change_ and _screenshot only the
interfaces that were changed_. Satisfying both needs a changed-file →
owning-story mapping, and the mapping trades accuracy against cost. That mapping
is the `resolveStories` function in [`src/resolve-stories.ts`](../src/resolve-stories.ts),
covered by [`test/resolve-stories.test.ts`](../test/resolve-stories.test.ts).

## Tests use a coarse gate; screenshots use a resolver

- **Tests** (`storybook-tests.yml`) keep a coarse **denylist**: run unless the PR
  changes _only_ provably-inert docs. Tests are cheap and gating — correctness
  beats precision.
- **Screenshots** (`storybook-screenshots.yml`) resolve the _changed stories_ via
  a configurable `screenshot-resolver`, because "screenshot only what changed"
  needs the mapping.

## Precedence

`resolveStories` decides in this order:

1. **A Storybook config/addon/preview change** (`storybook-config-globs`, default
   `.storybook/**`) can't be localized to specific stories → **capture all**.
2. **`resolver: all`** → **capture all**.
3. Otherwise resolve per the selected resolver (below).

A directly changed story file is always captured (when it still exists in the
built `index.json` — a deleted story is excluded).

## Resolver modes and their residual gap

| Mode                       | What it captures beyond directly-changed stories              | Residual gap                                                                                                                               |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `changed-stories-only`     | nothing                                                       | A component edited without touching its story regenerates no screenshot — the original bespoke behavior's false negative.                  |
| `colocation` (**default**) | stories in the **same directory** as a changed component file | A changed component whose story lives elsewhere, or a shared/presentational component consumed by stories in other directories, is missed. |
| `import-graph`             | _(reserved)_ — see below                                      | Not yet implemented.                                                                                                                       |
| `all`                      | every story                                                   | None (captures everything); the cost is a full-suite screenshot on every run.                                                              |

`colocation` is the default because it closes the most common false negative — a
co-located component edited without its story — without the cost or complexity of
a full dependency graph. Repos with many shared/presentational components that are
imported across directories should be aware of colocation's gap and consider
`all` for smaller Storybooks.

## `import-graph` is reserved, not yet implemented

The `import-graph` value is accepted so a repo can opt in ahead of the
implementation without a breaking input change, but it currently **falls back to
`colocation`** and logs a clear notice saying so. When implemented it will parse
the built bundle to find every story that transitively imports a changed module —
more accurate for shared components, more expensive. Until then, do not rely on it
for full shared-component coverage; use `all` if you need that guarantee today.

## The honest-coverage principle

Each mode documents its residual gap on purpose. The one thing worse than missing
a screenshot is _believing_ coverage is complete when it isn't — so a repo picks a
mode with the gap in view rather than trusting a silent heuristic.
