import { describe, expect, it } from 'vitest';

import { buildCommentBody } from '../src/comment.js';
import type { GalleryFile, PostOptions } from '../src/comment.js';

const MARKER = '<!-- storybook-screenshots-bot -->';

const FILES: GalleryFile[] = [
  {
    story: {
      id: 'components-homelink--default',
      name: 'Default',
      title: 'components/HomeLink',
      importPath: './src/components/HomeLink.stories.tsx',
      type: 'story',
    },
    fileName: 'components-homelink--default.png',
    alt: 'components/HomeLink — Default',
  },
];

function options(overrides: Partial<PostOptions> = {}): PostOptions {
  return {
    repo: 'rmartz/example',
    prNumber: '1',
    headSha: 'b4e2ba5fedcba9876543210',
    outputDir: '/tmp/out',
    marker: MARKER,
    ...overrides,
  };
}

describe('buildCommentBody', () => {
  it('leads with the marker so the comment updates in place', () => {
    expect(buildCommentBody(FILES, options()).startsWith(MARKER)).toBe(true);
  });

  it('renders one table row per story and the short commit sha', () => {
    const body = buildCommentBody(FILES, options());
    expect(body).toContain('| **components/HomeLink** — Default |');
    expect(body).toContain('![components/HomeLink — Default](components-homelink--default.png)');
    expect(body).toContain('<sub>Generated from commit b4e2ba5</sub>');
  });

  // The ordinary case: a token with no expiration, or expiry beyond the window.
  it('adds no footer when there is no expiry notice', () => {
    const body = buildCommentBody(FILES, options());
    expect(body).not.toContain('⚠️');
    expect(body).toContain('|\n\n<sub>Generated');
  });

  it('appends the expiry notice as a blockquote footer above the commit line', () => {
    const notice = '> ⚠️ The `STORYBOOK_SCREENSHOT_PAT` secret expires in **9 days** (2026-10-01).';
    const body = buildCommentBody(FILES, options({ expiryNote: notice }));
    expect(body).toContain(notice);
    expect(body.indexOf(notice)).toBeGreaterThan(body.indexOf('components-homelink--default.png'));
    expect(body.indexOf(notice)).toBeLessThan(body.indexOf('<sub>Generated'));
    // Blank lines on both sides, or the blockquote absorbs its neighbours.
    expect(body).toContain(`\n\n${notice}\n\n`);
  });

  it('treats an empty notice as no notice', () => {
    expect(buildCommentBody(FILES, options({ expiryNote: '' }))).toBe(
      buildCommentBody(FILES, options()),
    );
  });
});
