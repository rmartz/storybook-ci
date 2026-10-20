import { describe, expect, it } from 'vitest';

import { selectStaleGalleries } from '../src/stale-galleries.js';
import type { PrComment } from '../src/stale-galleries.js';

const MARKER = '<!-- storybook-screenshots-bot -->';

function makeComment(overrides: Partial<PrComment> & Pick<PrComment, 'id'>): PrComment {
  return {
    body: `${MARKER}\n## 📸 Storybook Screenshots`,
    viewerDidAuthor: true,
    isMinimized: false,
    ...overrides,
  };
}

describe('selectStaleGalleries', () => {
  it('hides every earlier gallery and keeps the newest', () => {
    const comments = [
      makeComment({ id: 'old-1' }),
      makeComment({ id: 'old-2' }),
      makeComment({ id: 'new' }),
    ];
    expect(selectStaleGalleries(comments, MARKER)).toEqual(['old-1', 'old-2']);
  });

  it('hides nothing when the PR has only the one gallery', () => {
    expect(selectStaleGalleries([makeComment({ id: 'only' })], MARKER)).toEqual([]);
  });

  it('keeps the newest gallery even when other comments follow it', () => {
    const comments = [
      makeComment({ id: 'old' }),
      makeComment({ id: 'new' }),
      makeComment({ id: 'human', body: 'Looks good to me' }),
    ];
    expect(selectStaleGalleries(comments, MARKER)).toEqual(['old']);
  });

  it('skips galleries already hidden', () => {
    const comments = [
      makeComment({ id: 'hidden', isMinimized: true }),
      makeComment({ id: 'visible' }),
      makeComment({ id: 'new' }),
    ];
    expect(selectStaleGalleries(comments, MARKER)).toEqual(['visible']);
  });

  it("never hides another account's comment, even one carrying the marker", () => {
    const comments = [
      makeComment({ id: 'someone-else', viewerDidAuthor: false }),
      makeComment({ id: 'new' }),
    ];
    expect(selectStaleGalleries(comments, MARKER)).toEqual([]);
  });

  it('never hides a comment of its own that only quotes the marker', () => {
    const comments = [
      makeComment({ id: 'quote', body: `The gallery starts with ${MARKER}` }),
      makeComment({ id: 'new' }),
    ];
    expect(selectStaleGalleries(comments, MARKER)).toEqual([]);
  });

  it('ignores comments tagged with a different marker', () => {
    const comments = [
      makeComment({ id: 'advisory', body: '<!-- storybook-screenshots-advisory -->\nadvice' }),
      makeComment({ id: 'new' }),
    ];
    expect(selectStaleGalleries(comments, MARKER)).toEqual([]);
  });
});
