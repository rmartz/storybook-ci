import { readFileSync } from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Guards the private-registry auth contract of the two reusable workflows.
 *
 * A consumer whose `.npmrc` scopes a package to GitHub Packages needs two things
 * from us that are invisible in a passing run: `packages: read` on the job token,
 * and `NODE_AUTH_TOKEN` on the install step their `.npmrc` interpolates. Missing
 * either one fails only in consumers that have a private dependency AND a cold
 * package-manager store — which is why `storybook-tests.yml` read as healthy for
 * so long. These assertions make the contract fail here instead.
 */

type Step = { name?: string; run?: string; env?: Record<string, string> };
type Job = { steps?: Step[] };
type Workflow = { permissions?: Record<string, string>; jobs?: Record<string, Job> };

const ACTIONS_TOKEN = '${{ github.token }}';

const WORKFLOWS = ['storybook-tests.yml', 'storybook-screenshots.yml'] as const;

const readWorkflow = (file: string) =>
  parse(readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8')) as Workflow;

const stepsOf = (workflow: Workflow) =>
  Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);

const isInstall = (step: Step) => /\b(pnpm install|npm ci|yarn install)\b/.test(step.run ?? '');

// The capture bundle installs from $RUNNER_TEMP, deliberately outside the
// consumer workspace, under our own package.json — it reads no consumer .npmrc
// and must not be handed a consumer registry token. See AGENTS.md.
const installsInConsumerWorkspace = (step: Step) =>
  isInstall(step) && !(step.run ?? '').includes('$RUNNER_TEMP');

describe.each(WORKFLOWS)('%s private-registry auth', (file) => {
  const workflow = readWorkflow(file);

  it('grants packages: read so the job token can read GitHub Packages', () => {
    expect(workflow.permissions?.packages).toBe('read');
  });

  it('sets NODE_AUTH_TOKEN on every install that runs in the consumer workspace', () => {
    const installs = stepsOf(workflow).filter(installsInConsumerWorkspace);

    expect(installs.length).toBeGreaterThan(0);
    for (const step of installs) {
      expect(step.env?.NODE_AUTH_TOKEN).toBe(ACTIONS_TOKEN);
    }
  });

  it('leaves the capture-bundle install unauthenticated — it reads no consumer .npmrc', () => {
    const bundleInstalls = stepsOf(workflow).filter(
      (step) => isInstall(step) && (step.run ?? '').includes('$RUNNER_TEMP'),
    );

    for (const step of bundleInstalls) {
      expect(step.env?.NODE_AUTH_TOKEN).toBeUndefined();
    }
  });
});
