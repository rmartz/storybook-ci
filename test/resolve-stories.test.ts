import { describe, expect, it } from 'vitest';

import { resolveStories } from '../src/resolve-stories.js';
import type { ResolveInput, ScreenshotResolver } from '../src/types.js';

const STORY_FILES = [
  'src/components/Button/Button.stories.tsx',
  'src/components/Card/Card.stories.tsx',
  'src/components/Card/CardHeader.stories.tsx',
  'src/pages/Home/Home.stories.ts',
];

function input(overrides: Partial<ResolveInput>): ResolveInput {
  return {
    changedFiles: [],
    storyFiles: STORY_FILES,
    storyGlobs: ['src/**/*.stories.@(ts|tsx)'],
    componentGlobs: ['src/**/*.@(ts|tsx)'],
    storybookConfigGlobs: ['.storybook/**'],
    resolver: 'colocation',
    ...overrides,
  };
}

describe('resolveStories', () => {
  it('captures a directly changed story file (every resolver)', () => {
    const resolvers: ScreenshotResolver[] = ['colocation', 'changed-stories-only'];
    for (const resolver of resolvers) {
      const result = resolveStories(
        input({ resolver, changedFiles: ['src/components/Button/Button.stories.tsx'] }),
      );
      expect(result.captureAll).toBe(false);
      expect(result.storyFiles).toEqual(['src/components/Button/Button.stories.tsx']);
    }
  });

  it('colocation adds stories in the same directory as a changed component', () => {
    const result = resolveStories(
      input({ resolver: 'colocation', changedFiles: ['src/components/Card/Card.tsx'] }),
    );
    expect(result.captureAll).toBe(false);
    expect(new Set(result.storyFiles)).toEqual(
      new Set([
        'src/components/Card/Card.stories.tsx',
        'src/components/Card/CardHeader.stories.tsx',
      ]),
    );
  });

  it('changed-stories-only ignores a component edit with no story change', () => {
    const result = resolveStories(
      input({ resolver: 'changed-stories-only', changedFiles: ['src/components/Card/Card.tsx'] }),
    );
    expect(result.storyFiles).toEqual([]);
  });

  it('captures all stories when a .storybook config file changes', () => {
    const result = resolveStories(
      input({ resolver: 'colocation', changedFiles: ['.storybook/preview.ts'] }),
    );
    expect(result.captureAll).toBe(true);
    expect(result.reason).toContain('config');
  });

  it('captures all stories when resolver is "all"', () => {
    const result = resolveStories(input({ resolver: 'all', changedFiles: [] }));
    expect(result.captureAll).toBe(true);
  });

  it('captures nothing for an unrelated non-UI change', () => {
    const result = resolveStories(
      input({ resolver: 'colocation', changedFiles: ['README.md', 'package.json'] }),
    );
    expect(result.captureAll).toBe(false);
    expect(result.storyFiles).toEqual([]);
  });

  it('excludes a changed story file that is no longer in the built index (deleted)', () => {
    const result = resolveStories(
      input({
        resolver: 'colocation',
        changedFiles: ['src/components/Gone/Gone.stories.tsx'],
      }),
    );
    expect(result.storyFiles).toEqual([]);
  });

  it('normalizes a leading ./ on changed files', () => {
    const result = resolveStories(
      input({
        resolver: 'colocation',
        changedFiles: ['./src/components/Button/Button.stories.tsx'],
      }),
    );
    expect(result.storyFiles).toEqual(['src/components/Button/Button.stories.tsx']);
  });

  it('import-graph falls back to colocation and says so', () => {
    const result = resolveStories(
      input({ resolver: 'import-graph', changedFiles: ['src/components/Card/Card.tsx'] }),
    );
    expect(new Set(result.storyFiles)).toEqual(
      new Set([
        'src/components/Card/Card.stories.tsx',
        'src/components/Card/CardHeader.stories.tsx',
      ]),
    );
    expect(result.reason).toContain('import-graph is not yet implemented');
  });

  it('does not treat a story file as its own component (no self-duplication)', () => {
    const result = resolveStories(
      input({ resolver: 'colocation', changedFiles: ['src/pages/Home/Home.stories.ts'] }),
    );
    expect(result.storyFiles).toEqual(['src/pages/Home/Home.stories.ts']);
  });
});
