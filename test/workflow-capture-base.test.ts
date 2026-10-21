import { readFileSync } from 'node:fs';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Guards the screenshots workflow's Before/After defaults. `capture-base` is on
 * by default, so the two-render budget is the one every untouched consumer gets:
 * the job timeout must leave room for both capture deadlines, or a slow render is
 * CANCELLED (escalated to a human) instead of FAILING (routed to fix-review).
 */

type Input = { default?: unknown };
type Workflow = { on: { workflow_call: { inputs: Record<string, Input> } } };

const workflow = parse(
  readFileSync(new URL('../.github/workflows/storybook-screenshots.yml', import.meta.url), 'utf8'),
) as Workflow;
const inputs = workflow.on.workflow_call.inputs;

describe('storybook-screenshots.yml capture-base defaults', () => {
  it('renders the PR base by default', () => {
    expect(inputs['capture-base']?.default).toBe(true);
  });

  it('defaults base-timeout-minutes above twice the capture deadline', () => {
    const deadlineMinutes = Number(inputs['capture-deadline-ms']?.default) / 60_000;
    expect(Number(inputs['base-timeout-minutes']?.default)).toBeGreaterThan(2 * deadlineMinutes);
  });
});
