import picomatch from 'picomatch';

import type { ResolveInput, ResolveResult } from './types.js';

/**
 * Resolve which stories to screenshot from the set of changed files.
 *
 * This is the design-critical decision the shared action centralizes (PRD §7):
 * "screenshot only what changed" needs a changed-component → owning-story
 * mapping, and the strategy trades accuracy against cost. The function is pure —
 * it takes the changed files, the known story files, and the globs, and returns
 * the story files to capture (or a signal to capture everything). It never
 * touches the filesystem or the network, so its behavior is fully unit-tested.
 *
 * Precedence:
 *   1. A Storybook config/addon/preview change (`storybookConfigGlobs`) can't be
 *      localized to specific stories → capture all.
 *   2. `resolver: all` → capture all.
 *   3. Otherwise resolve the changed stories per the selected resolver.
 */
export function resolveStories(input: ResolveInput): ResolveResult {
  const changedFiles = input.changedFiles.map(normalize).filter(Boolean);
  const storyFiles = unique(input.storyFiles.map(normalize).filter(Boolean));

  const matchesConfig = picomatch(input.storybookConfigGlobs);
  if (changedFiles.some((file) => matchesConfig(file))) {
    return {
      captureAll: true,
      storyFiles: [],
      reason: 'Storybook config/addon/preview changed — capturing all stories.',
    };
  }

  if (input.resolver === 'all') {
    return { captureAll: true, storyFiles: [], reason: 'resolver=all — capturing all stories.' };
  }

  const isStory = picomatch(input.storyGlobs);
  const isComponent = picomatch(input.componentGlobs);
  const knownStories = new Set(storyFiles);

  // 1. Directly changed story files that still exist in the built index.
  const directStories = changedFiles.filter((file) => isStory(file) && knownStories.has(file));
  const resolved = new Set(directStories);

  // 2. Colocation: a changed component pulls in the stories in its own directory.
  const useColocation = input.resolver === 'colocation' || input.resolver === 'import-graph';
  if (useColocation) {
    const changedComponentDirs = new Set(
      changedFiles
        .filter((file) => isComponent(file) && !isStory(file))
        .map((file) => dirname(file)),
    );
    for (const story of storyFiles) {
      if (changedComponentDirs.has(dirname(story))) resolved.add(story);
    }
  }

  const reason = describe(input.resolver, directStories.length, resolved.size);
  return { captureAll: false, storyFiles: [...resolved], reason };
}

function describe(resolver: string, direct: number, total: number): string {
  const base = `resolver=${resolver}: ${direct} changed story file(s), ${total} story file(s) to capture`;
  if (resolver === 'import-graph') {
    return `${base}. NOTE: import-graph is not yet implemented — falling back to colocation (docs/change-filtering.md).`;
  }
  return `${base}.`;
}

/** Strip a leading `./` and normalize separators so inputs compare cleanly. */
function normalize(file: string): string {
  return file.trim().replace(/^\.\//, '').replace(/\\/g, '/');
}

function dirname(file: string): string {
  const slash = file.lastIndexOf('/');
  return slash === -1 ? '' : file.slice(0, slash);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
