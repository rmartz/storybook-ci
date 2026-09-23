import { describe, expect, it } from 'vitest';

import { buildExpiryNotice, daysUntil, parseTokenExpiration } from '../src/pat-expiry.js';

const DOCS = 'https://example.test/authentication.md';
const NOW = new Date('2026-09-22T12:00:00Z');

function response(headers: string, body = '{"login":"octocat"}'): string {
  return `HTTP/2.0 200 OK\n${headers}\n\n${body}`;
}

describe('parseTokenExpiration', () => {
  it('reads the expiration header', () => {
    const raw = response('github-authentication-token-expiration: 2026-12-31 15:59:59 UTC');
    expect(parseTokenExpiration(raw)?.toISOString()).toBe('2026-12-31T15:59:59.000Z');
  });

  it('matches the header name case-insensitively', () => {
    const raw = response('GitHub-Authentication-Token-Expiration: 2026-12-31 15:59:59 UTC');
    expect(parseTokenExpiration(raw)).not.toBeNull();
  });

  it('accepts the offset and ISO 8601 formats too', () => {
    const offset = response('github-authentication-token-expiration: 2026-12-31 15:59:59 -0800');
    expect(parseTokenExpiration(offset)?.toISOString()).toBe('2026-12-31T23:59:59.000Z');
    const iso = response('github-authentication-token-expiration: 2026-12-31T15:59:59Z');
    expect(parseTokenExpiration(iso)?.toISOString()).toBe('2026-12-31T15:59:59.000Z');
  });

  // A token created with no expiration date sends no header at all. That is the
  // common case today and must be silence, not a warning.
  it('returns null when the header is absent', () => {
    expect(parseTokenExpiration(response('x-oauth-scopes: repo'))).toBeNull();
  });

  it('returns null when the value is unparseable, rather than throwing', () => {
    const raw = response('github-authentication-token-expiration: not-a-date');
    expect(parseTokenExpiration(raw)).toBeNull();
  });

  // The body is JSON containing user-controlled profile fields; only the header
  // block is authoritative.
  it('ignores a header-shaped line in the response body', () => {
    const raw = response(
      'x-oauth-scopes: repo',
      '{"bio":"github-authentication-token-expiration: 2020-01-01 00:00:00 UTC"}',
    );
    expect(parseTokenExpiration(raw)).toBeNull();
  });
});

describe('daysUntil', () => {
  it('rounds partial days up', () => {
    expect(daysUntil(new Date('2026-09-23T13:00:00Z'), NOW)).toBe(2);
  });

  it('goes negative once past', () => {
    expect(daysUntil(new Date('2026-09-20T12:00:00Z'), NOW)).toBe(-2);
  });
});

describe('buildExpiryNotice', () => {
  it('says nothing when there is no expiration date', () => {
    expect(buildExpiryNotice(null, NOW, 14, DOCS)).toBeNull();
  });

  it('says nothing while expiry is beyond the threshold', () => {
    expect(buildExpiryNotice(new Date('2026-10-07T12:00:01Z'), NOW, 14, DOCS)).toBeNull();
  });

  it('warns at exactly the threshold', () => {
    const notice = buildExpiryNotice(new Date('2026-10-06T12:00:00Z'), NOW, 14, DOCS);
    expect(notice).toContain('expires in **14 days**');
    expect(notice).toContain('STORYBOOK_SCREENSHOT_PAT');
    expect(notice).toContain(DOCS);
  });

  it('singularizes the last day', () => {
    const notice = buildExpiryNotice(new Date('2026-09-23T12:00:00Z'), NOW, 14, DOCS);
    expect(notice).toContain('expires **tomorrow**');
  });

  it('reports an already-past date as expired', () => {
    const notice = buildExpiryNotice(new Date('2026-09-20T12:00:00Z'), NOW, 14, DOCS);
    expect(notice).toContain('has **expired**');
  });

  it('renders the date itself rather than echoing the header text', () => {
    const notice = buildExpiryNotice(new Date('2026-09-25T15:59:59Z'), NOW, 14, DOCS);
    expect(notice).toContain('2026-09-25');
    expect(notice).not.toContain('15:59:59');
  });

  it('stays a single line so it is safe to write to $GITHUB_OUTPUT', () => {
    const notice = buildExpiryNotice(new Date('2026-09-25T12:00:00Z'), NOW, 14, DOCS);
    expect(notice).not.toContain('\n');
  });
});
