import { readFileSync } from 'node:fs';

import type { StoryIndex, StoryIndexEntry } from './types.js';

/**
 * Read Storybook's own `index.json` and return its story entries. Reading from
 * Storybook's build output (rather than re-deriving titles from file paths) is
 * deliberate: the entry `id`/`title`/`name` come from Storybook's auto-title
 * algorithm, so they never drift from what the sidebar shows.
 */
export function readStoryEntries(indexJsonPath: string): StoryIndexEntry[] {
  const raw = readFileSync(indexJsonPath, 'utf8');
  const index = JSON.parse(raw) as StoryIndex;
  return Object.values(index.entries ?? {}).filter((entry) => entry.type === 'story');
}

/** The importPath in `index.json` is like `./src/Foo/Foo.stories.tsx`. */
export function normalizeImportPath(importPath: string): string {
  return importPath.replace(/^\.\//, '').replace(/\\/g, '/');
}

/** The story files (normalized importPaths) present in the built index. */
export function storyFilesFromEntries(entries: StoryIndexEntry[]): string[] {
  return [...new Set(entries.map((entry) => normalizeImportPath(entry.importPath)))];
}
