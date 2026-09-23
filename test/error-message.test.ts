import { describe, expect, it } from 'vitest';

import { stderrOf } from '../src/lib/error-message.js';

describe('stderrOf', () => {
  it('prefers captured stderr, as a string or a Buffer', () => {
    const fromString = Object.assign(new Error('Command failed: gh api user'), {
      stderr: 'HTTP 401: Bad credentials\n',
    });
    const fromBuffer = Object.assign(new Error('Command failed: gh pr comment'), {
      stderr: Buffer.from('GraphQL: API rate limit already exceeded\n'),
    });
    expect(stderrOf(fromString)).toBe('HTTP 401: Bad credentials');
    expect(stderrOf(fromBuffer)).toBe('GraphQL: API rate limit already exceeded');
  });

  it('falls back to the message when stderr is empty or absent', () => {
    expect(stderrOf(Object.assign(new Error('boom'), { stderr: '' }))).toBe('boom');
    expect(stderrOf(new Error('boom'))).toBe('boom');
    expect(stderrOf('plain')).toBe('plain');
  });
});
