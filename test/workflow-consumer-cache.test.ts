import { readFileSync } from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Guards where the screenshots workflow restores the consumer's package-manager
 * store. The placement is the whole design: `cache: pnpm` needs a pnpm on PATH,
 * and the consumer's store must not be restored before the capture bundle — an
 * isolated install under our own package.json — has installed. See AGENTS.md.
 */

type Step = {
  name?: string;
  uses?: string;
  if?: string;
  run?: string;
  with?: Record<string, string>;
};
type Workflow = { jobs: Record<string, { steps: Step[] }> };

const workflow = parse(
  readFileSync(new URL('../.github/workflows/storybook-screenshots.yml', import.meta.url), 'utf8'),
) as Workflow;
const steps = workflow.jobs.screenshots?.steps ?? [];

const indexOf = (predicate: (step: Step) => boolean) => {
  const index = steps.findIndex(predicate);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
};

const isSetupNode = (step: Step) => (step.uses ?? '').startsWith('actions/setup-node@');
const cacheStep = () => indexOf((step) => isSetupNode(step) && step.with?.cache !== undefined);
const bundleInstall = () =>
  indexOf((step) => (step.run ?? '').includes('$RUNNER_TEMP/storybook-ci" install'));
const consumerPnpm = () => indexOf((step) => step.name === 'Set up pnpm for the consumer');
const consumerInstall = () => indexOf((step) => step.name === 'Install consumer dependencies');

describe('storybook-screenshots.yml consumer store cache', () => {
  it('caches the consumer package manager, keyed like storybook-tests.yml', () => {
    expect(steps[cacheStep()]?.with?.cache).toBe('${{ inputs.package-manager }}');
  });

  it('leaves the first setup-node uncached — no pnpm exists that early', () => {
    const first = indexOf(isSetupNode);
    expect(first).not.toBe(cacheStep());
    expect(steps[first]?.with?.cache).toBeUndefined();
  });

  it('restores only after the capture bundle and the consumer pnpm are set up', () => {
    expect(cacheStep()).toBeGreaterThan(bundleInstall());
    expect(cacheStep()).toBeGreaterThan(consumerPnpm());
    expect(cacheStep()).toBeLessThan(consumerInstall());
  });

  it('is gated exactly like the install it serves', () => {
    expect(steps[cacheStep()]?.if).toBe(steps[consumerInstall()]?.if);
  });
});
