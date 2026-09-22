import { describe, expect, it } from 'vitest';

import { resolveStaticPath } from '../src/lib/static-path.js';

const ROOT = '/srv/storybook-static';

describe('resolveStaticPath', () => {
  it('serves a normal nested asset within the root', () => {
    expect(resolveStaticPath(ROOT, '/assets/main.js')).toBe(`${ROOT}/assets/main.js`);
  });

  it('maps / to index.html', () => {
    expect(resolveStaticPath(ROOT, '/')).toBe(`${ROOT}/index.html`);
  });

  it('rejects a parent-directory traversal', () => {
    expect(resolveStaticPath(ROOT, '/../../etc/passwd')).toBeNull();
  });

  it('rejects a percent-encoded traversal', () => {
    expect(resolveStaticPath(ROOT, '/..%2F..%2Fetc%2Fpasswd')).toBeNull();
  });

  it('rejects malformed percent-encoding', () => {
    expect(resolveStaticPath(ROOT, '/%')).toBeNull();
  });

  it('contains an absolute-looking path inside the root (leading slashes stripped)', () => {
    // `/etc/passwd` becomes `etc/passwd` under the root — contained, not the real /etc.
    expect(resolveStaticPath(ROOT, '/etc/passwd')).toBe(`${ROOT}/etc/passwd`);
  });

  it('does not allow escaping to a sibling directory', () => {
    expect(resolveStaticPath(ROOT, '/../storybook-static-evil/secret')).toBeNull();
  });
});
