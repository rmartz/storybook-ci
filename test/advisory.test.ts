import { describe, expect, it } from 'vitest';

import { buildAdvisoryBody } from '../src/advisory.js';

const MARKER = '<!-- storybook-screenshots-advisory -->';
const DOCS = 'https://example.test/authentication.md';

describe('buildAdvisoryBody', () => {
  it('leads with the marker so the comment updates in place', () => {
    expect(buildAdvisoryBody('missing', MARKER, DOCS).startsWith(MARKER)).toBe(true);
  });

  it('names the missing case and stays non-blocking', () => {
    const body = buildAdvisoryBody('missing', MARKER, DOCS);
    expect(body).toContain('not set');
    expect(body).toContain('does **not** block');
    expect(body).toContain('STORYBOOK_SCREENSHOT_PAT');
    expect(body).toContain(DOCS);
  });

  it('names the invalid case distinctly', () => {
    const body = buildAdvisoryBody('invalid', MARKER, DOCS);
    expect(body).toContain('invalid or expired');
    expect(body).not.toContain('not set');
  });
});
