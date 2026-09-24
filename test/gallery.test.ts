import { describe, expect, it } from 'vitest';

import { buildGalleryBody, hasGalleryImages, pairRenders, renderedStory } from '../src/gallery.js';
import type { GallerySide, RenderedStory } from '../src/gallery.js';
import type { StoryIndexEntry } from '../src/types.js';

const MARKER = '<!-- storybook-screenshots-bot -->';
const SHA = 'abcdef1234567890';

function entry(id: string, overrides: Partial<StoryIndexEntry> = {}): StoryIndexEntry {
  return {
    id,
    name: 'Default',
    title: 'Components/Button',
    importPath: `./src/${id}.stories.tsx`,
    type: 'story',
    ...overrides,
  };
}

function rendered(
  id: string,
  side: GallerySide,
  overrides: Partial<StoryIndexEntry> = {},
): RenderedStory {
  return renderedStory(entry(id, overrides), side);
}

describe('renderedStory', () => {
  it('names the head render after the story id', () => {
    const story = rendered('components-button--default', 'after');
    expect(story.file).toBe('components-button--default.png');
    expect(story.alt).toBe('Components/Button — Default');
  });

  it('prefixes the base render so both sides coexist in one output dir', () => {
    const story = rendered('components-button--default', 'before');
    expect(story.file).toBe('before-components-button--default.png');
    expect(story.alt).toContain('(before)');
  });

  it('sanitizes an id that is not filename-safe', () => {
    expect(rendered('a/b:c', 'after').file).toBe('a-b-c.png');
  });

  it('strips characters that would break the alt text out of its markdown', () => {
    const story = rendered('x', 'after', { title: 'A#B', name: 'C\nD' });
    expect(story.alt).not.toContain('#');
    expect(story.alt).not.toContain('\n');
  });
});

describe('pairRenders', () => {
  it('pairs the two sides of a story present in both renders', () => {
    const rows = pairRenders([rendered('a', 'after')], [rendered('a', 'before')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.before?.file).toBe('before-a.png');
    expect(rows[0]?.after?.file).toBe('a.png');
  });

  it('leaves a story new in the PR with no before side', () => {
    const rows = pairRenders([rendered('new', 'after')], [rendered('old', 'before')]);
    const newRow = rows.find((row) => row.id === 'new');
    expect(newRow?.before).toBeNull();
    expect(newRow?.after).not.toBeNull();
  });

  it('keeps a story deleted in the PR as a before-only row', () => {
    const rows = pairRenders([rendered('kept', 'after')], [rendered('gone', 'before')]);
    const goneRow = rows.find((row) => row.id === 'gone');
    expect(goneRow?.after).toBeNull();
    expect(goneRow?.before?.file).toBe('before-gone.png');
  });

  it('orders head stories first and appends the before-only ones', () => {
    const rows = pairRenders(
      [rendered('a', 'after'), rendered('b', 'after')],
      [rendered('b', 'before'), rendered('z', 'before')],
    );
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'z']);
  });

  it('returns after-only rows when there is no base render at all', () => {
    const rows = pairRenders([rendered('a', 'after')], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.before).toBeNull();
  });
});

describe('buildGalleryBody', () => {
  const pair = pairRenders([rendered('a', 'after')], [rendered('a', 'before')]);
  const single = pairRenders([rendered('a', 'after')], []);

  it('leads with the marker so the comment updates in place', () => {
    const body = buildGalleryBody(single, { marker: MARKER, headSha: SHA, baseStatus: 'none' });
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain('abcdef1');
  });

  it('keeps the single-column gallery when the base render was not requested', () => {
    const body = buildGalleryBody(single, { marker: MARKER, headSha: SHA, baseStatus: 'none' });
    expect(body).toContain('| Story | Preview |');
    expect(body).not.toContain('Before');
  });

  it('shows Before and After side by side once the base render is available', () => {
    const body = buildGalleryBody(pair, { marker: MARKER, headSha: SHA, baseStatus: 'ok' });
    expect(body).toContain('| Story | Before | After |');
    expect(body).toContain('![Components/Button — Default (before)](before-a.png)');
    expect(body).toContain('![Components/Button — Default](a.png)');
  });

  it('labels the missing side of an asymmetric pair', () => {
    const rows = pairRenders([rendered('new', 'after')], [rendered('gone', 'before')]);
    const body = buildGalleryBody(rows, { marker: MARKER, headSha: SHA, baseStatus: 'ok' });
    expect(body).toContain('new in this PR');
    expect(body).toContain('removed in this PR');
  });

  it('does not claim a story was added when the base render was incomplete', () => {
    const rows = pairRenders([rendered('new', 'after')], [rendered('other', 'before')]);
    const body = buildGalleryBody(rows, {
      marker: MARKER,
      headSha: SHA,
      baseStatus: 'ok',
      baseComplete: false,
    });
    expect(body).not.toContain('new in this PR');
    expect(body).toContain('not captured');
  });

  it('does not claim a story was removed when the head render was incomplete', () => {
    const rows = pairRenders([], [rendered('gone', 'before')]);
    const body = buildGalleryBody(rows, {
      marker: MARKER,
      headSha: SHA,
      baseStatus: 'ok',
      headComplete: false,
    });
    expect(body).not.toContain('removed in this PR');
    expect(body).toContain('not captured');
  });

  it('degrades to the single-column gallery and says so when the base render failed', () => {
    const body = buildGalleryBody(single, {
      marker: MARKER,
      headSha: SHA,
      baseStatus: 'unavailable',
    });
    expect(body).toContain('| Story | Preview |');
    expect(body).toMatch(/base.*unavailable/i);
  });
});

describe('buildGalleryBody PAT-expiry footer', () => {
  const single = pairRenders([rendered('a', 'after')], []);
  const notice = '> ⚠️ The `STORYBOOK_SCREENSHOT_PAT` secret expires in **9 days** (2026-10-01).';

  // The ordinary case: a token with no expiration, or expiry beyond the window.
  it('adds no footer when there is no expiry notice', () => {
    const body = buildGalleryBody(single, { marker: MARKER, headSha: SHA, baseStatus: 'none' });
    expect(body).not.toContain('⚠️');
    expect(body).toContain('|\n\n<sub>Generated');
  });

  it('appends the expiry notice as a blockquote footer above the commit line', () => {
    const body = buildGalleryBody(single, {
      marker: MARKER,
      headSha: SHA,
      baseStatus: 'none',
      expiryNote: notice,
    });
    expect(body.indexOf(notice)).toBeGreaterThan(body.indexOf('a.png'));
    expect(body.indexOf(notice)).toBeLessThan(body.indexOf('<sub>Generated'));
    // Blank lines on both sides, or the blockquote absorbs its neighbours.
    expect(body).toContain(`\n\n${notice}\n\n`);
  });

  it('keeps the notice in the Before/After gallery too', () => {
    const pair = pairRenders([rendered('a', 'after')], [rendered('a', 'before')]);
    const body = buildGalleryBody(pair, {
      marker: MARKER,
      headSha: SHA,
      baseStatus: 'ok',
      expiryNote: notice,
    });
    expect(body).toContain(`\n\n${notice}\n\n<sub>Generated`);
  });

  it('treats an empty notice as no notice', () => {
    const options = { marker: MARKER, headSha: SHA, baseStatus: 'none' as const };
    expect(buildGalleryBody(single, { ...options, expiryNote: '' })).toBe(
      buildGalleryBody(single, options),
    );
  });
});

describe('hasGalleryImages', () => {
  it('is false when every head capture failed and there is no base render', () => {
    expect(hasGalleryImages(0, 0, 'none')).toBe(false);
    expect(hasGalleryImages(0, 0, 'ok')).toBe(false);
  });

  it('ignores base PNGs the body would not show', () => {
    // An unavailable base render is not shown, so it cannot rescue an empty head.
    expect(hasGalleryImages(0, 3, 'unavailable')).toBe(false);
    expect(hasGalleryImages(0, 3, 'none')).toBe(false);
  });

  it('is true with any head screenshot', () => {
    expect(hasGalleryImages(1, 0, 'none')).toBe(true);
    expect(hasGalleryImages(2, 0, 'unavailable')).toBe(true);
  });

  it('is true with a usable base render alone (e.g. a PR that deletes stories)', () => {
    expect(hasGalleryImages(0, 2, 'ok')).toBe(true);
  });
});
