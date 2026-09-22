/**
 * Shared types for the screenshot pipeline. Kept dependency-free so the resolver
 * (the tested core) and the Playwright capture stage share one vocabulary.
 */

/**
 * How changed files are mapped to the stories that get screenshotted. Structural
 * union (not an enum) so a raw workflow-input string assigns without a cast.
 *
 * - `colocation` (default): changed story files, plus stories co-located in the
 *   same directory as a changed component file. Closes the most common false
 *   negative (a component edited without touching its story).
 * - `changed-stories-only`: only directly changed `*.stories.*` files (the
 *   original bespoke behavior).
 * - `all`: every story, regardless of what changed.
 * - `import-graph`: reserved — currently falls back to `colocation` with a
 *   warning (see docs/change-filtering.md). Kept in the union so a consumer can
 *   opt in ahead of the implementation without a breaking input change.
 */
export type ScreenshotResolver = 'colocation' | 'changed-stories-only' | 'all' | 'import-graph';

export const SCREENSHOT_RESOLVERS: readonly ScreenshotResolver[] = [
  'colocation',
  'changed-stories-only',
  'all',
  'import-graph',
];

/** A single entry from Storybook's built `index.json`. */
export interface StoryIndexEntry {
  id: string;
  name: string;
  title: string;
  importPath: string;
  type: 'story' | 'docs';
}

/** The subset of `index.json` we read. */
export interface StoryIndex {
  entries: Record<string, StoryIndexEntry>;
}

/** Inputs to the pure story-resolution step. */
export interface ResolveInput {
  /** Repo-relative paths changed in the PR (any leading `./` is tolerated). */
  changedFiles: string[];
  /** Every known story file (from a filesystem glob or from `index.json`). */
  storyFiles: string[];
  /** Globs identifying story files, e.g. `src/**\/*.stories.@(ts|tsx)`. */
  storyGlobs: string[];
  /** Globs identifying UI component files that resolve to co-located stories. */
  componentGlobs: string[];
  /** Globs whose change forces a full capture, e.g. `.storybook/**`. */
  storybookConfigGlobs: string[];
  resolver: ScreenshotResolver;
}

/** Result of the pure story-resolution step. */
export interface ResolveResult {
  /** When true, capture every story (a broad change that can't be localized). */
  captureAll: boolean;
  /** Resolved story files to capture (normalized, deduped; empty if captureAll). */
  storyFiles: string[];
  /** Human-readable explanation of the decision, surfaced in logs. */
  reason: string;
}
