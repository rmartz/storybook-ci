import { describe, expect, it } from 'vitest';

import { buildAdvisoryBody, isRateLimitError } from '../src/advisory.js';

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

  it('names the rate-limited case without blaming the token', () => {
    const body = buildAdvisoryBody('rate-limited', MARKER, DOCS);
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain('rate limit');
    expect(body).toContain('does **not** block');
    expect(body).not.toContain('invalid or expired');
  });
});

describe('isRateLimitError', () => {
  it('recognizes the GraphQL and REST rate-limit messages', () => {
    expect(isRateLimitError('GraphQL: API rate limit already exceeded for user ID 1032849.')).toBe(
      true,
    );
    expect(isRateLimitError('HTTP 403: API rate limit exceeded for user ID 1.')).toBe(true);
    expect(isRateLimitError('HTTP 403: You have exceeded a secondary rate limit.')).toBe(true);
  });

  it('does not mistake an auth failure for a rate limit', () => {
    expect(isRateLimitError('HTTP 401: Bad credentials (https://api.github.com/user)')).toBe(false);
    expect(isRateLimitError('HTTP 403: Resource not accessible by personal access token')).toBe(
      false,
    );
  });
});
