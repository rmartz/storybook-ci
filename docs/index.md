---
okf_version: 0.2
---

# Documentation

Documentation for `storybook-ci`, the fleet's shared Storybook CI, written in
[Open Knowledge Format](okf-format.md).

- [What storybook-ci is](overview.md) — the three concerns it centralizes
  (Chromium provisioning, Storybook tests, per-PR screenshot galleries) and the
  two reusable workflows that deliver them.
- [Adopting it in a consuming repo](consuming.md) — the two thin caller
  workflows, what each removes from a repo's bespoke setup, and how the pins stay
  current.
- [Configuration reference](configuration.md) — every workflow input, its
  default, and what it controls.
- [Change filtering](change-filtering.md) — how changed files map to the stories
  that get screenshotted, the resolver modes, and the residual gap of each.
- [Authentication](authentication.md) — why screenshot posting needs a classic
  PAT and how the secret reaches the workflow safely.
- [The OKF documentation format](okf-format.md) — how these pages are structured
  and validated in this repo.
