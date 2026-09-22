import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import picomatch from 'picomatch';

/** Directories never worth walking when enumerating story files. */
const PRUNE = new Set(['node_modules', '.git', 'dist', 'storybook-static', '.next', 'coverage']);

/**
 * Recursively enumerate files under `root` that match any of `globs`, returned as
 * paths relative to `root` with `/` separators. Used by the pre-build gate to
 * list a repo's story files from the working tree (before `index.json` exists),
 * so the resolver can decide whether any story needs capturing without paying
 * for a Storybook build.
 */
export function findFiles(root: string, globs: string[]): string[] {
  const isMatch = picomatch(globs);
  const results: string[] = [];
  walk(root, '', isMatch, results);
  return results.sort();
}

function walk(root: string, rel: string, isMatch: (p: string) => boolean, out: string[]): void {
  const dir = rel ? join(root, rel) : root;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (PRUNE.has(entry.name)) continue;
      walk(root, rel ? `${rel}/${entry.name}` : entry.name, isMatch, out);
    } else if (entry.isFile()) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (isMatch(path)) out.push(path);
    }
  }
}
