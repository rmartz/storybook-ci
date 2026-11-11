import { readFileSync } from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Guards that storybook-tests.yml keeps apt off the critical path. The ubuntu-
 * latest image already has Chromium's libraries; `--with-deps` / `install-deps`
 * only add optional fonts from the Ubuntu mirror, and a slow mirror stalled the
 * job past its timeout without the retry loop ever running (#90). apt is opt-in
 * via `install-system-deps`, which must default to off.
 */

type Step = { name?: string; env?: Record<string, string>; run?: string };
type Workflow = {
  on: { workflow_call: { inputs: Record<string, { default?: unknown }> } };
  jobs: Record<string, { steps: Step[]; 'timeout-minutes'?: number }>;
};

const workflow = parse(
  readFileSync(new URL('../.github/workflows/storybook-tests.yml', import.meta.url), 'utf8'),
) as Workflow;

const installStep = (job: string) => {
  const step = workflow.jobs[job]?.steps.find((s) => s.name === 'Install Playwright browser');
  expect(step).toBeDefined();
  return step ?? {};
};

describe('storybook-tests.yml browser provisioning', () => {
  it('defaults install-system-deps to off', () => {
    expect(workflow.on.workflow_call.inputs['install-system-deps']?.default).toBe(false);
  });

  describe.each(['storybook-tests', 'storybook-build'])('%s job', (job) => {
    it('never runs `playwright install-deps`', () => {
      expect(installStep(job).run).not.toContain('install-deps');
    });

    it('adds --with-deps only when the caller opts in', () => {
      const step = installStep(job);
      expect(step.env?.SYSTEM_DEPS).toBe('${{ inputs.install-system-deps }}');
      expect(step.run).toContain(
        'if [ "$SYSTEM_DEPS" = "true" ]; then sub="install --with-deps"; else sub="install"; fi',
      );
    });
  });

  it('keeps the test job timeout at 8 minutes', () => {
    expect(workflow.jobs['storybook-tests']?.['timeout-minutes']).toBe(8);
  });
});
