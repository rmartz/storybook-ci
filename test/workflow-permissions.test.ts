import { readFileSync } from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Pins the permission scopes each reusable workflow requests from its caller.
 *
 * A called workflow that requests a scope its caller does not grant is rejected
 * before any job is created: the run concludes `startup_failure` with no jobs and
 * no check runs. So adding a scope here breaks every consumer that has not
 * granted it yet, however harmless the scope is, and must ship as a breaking
 * (`!`) change with an upgrade note in docs/consuming.md. When this test fails
 * because you added a scope, that is the decision it is asking you to make.
 */

type Permissions = Record<string, string>;
type Job = { uses?: string; permissions?: Permissions };
type Workflow = { permissions?: Permissions; jobs?: Record<string, Job> };

const EXPECTED: Record<string, Permissions> = {
  'storybook-tests.yml': { contents: 'read', packages: 'read' },
  'storybook-screenshots.yml': {
    contents: 'read',
    packages: 'read',
    'pull-requests': 'write',
  },
};

const readText = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Every scope the workflow can request: the top-level block plus any job-level
// block, since GitHub checks both against the caller's grant.
const requestedScopes = (workflow: Workflow) =>
  Object.assign(
    {},
    workflow.permissions,
    ...Object.values(workflow.jobs ?? {}).map((job) => job.permissions ?? {}),
  ) as Permissions;

// The documented caller workflows: fenced YAML blocks that call `file` and
// declare their own `permissions:` block.
const documentedCallers = (markdownPath: string, file: string) =>
  [...readText(markdownPath).matchAll(/```yaml\n([\s\S]*?)```/g)]
    .map((match) => parse(match[1] ?? '') as Workflow)
    .filter(
      (caller) =>
        caller.permissions !== undefined &&
        Object.values(caller.jobs ?? {}).some((job) => job.uses?.includes(`/${file}@`)),
    );

describe.each(Object.entries(EXPECTED))('%s caller permissions', (file, expected) => {
  const workflow = parse(readText(`.github/workflows/${file}`)) as Workflow;

  it('requests exactly the pinned scopes — a new scope is a breaking change', () => {
    expect(requestedScopes(workflow)).toEqual(expected);
  });

  it.each(['README.md', 'docs/consuming.md'])(
    'is documented in %s with a caller that grants every requested scope',
    (markdownPath) => {
      const callers = documentedCallers(markdownPath, file);

      expect(callers).toHaveLength(1);
      expect(callers[0]?.permissions).toEqual(expected);
    },
  );
});
