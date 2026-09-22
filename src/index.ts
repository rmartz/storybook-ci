/**
 * Public surface of the storybook-ci capture logic. The repo is CI-only and
 * unpublished (no npm package), so this exists to give the modules one import
 * root and to keep the resolver — the tested core — easy to consume from tests.
 */
export { resolveStories } from './resolve-stories.js';
export { captureStories } from './capture.js';
export { postScreenshotComment } from './comment.js';
export { readStoryEntries, storyFilesFromEntries, normalizeImportPath } from './story-index.js';
export { findFiles } from './lib/find-files.js';
export { SCREENSHOT_RESOLVERS } from './types.js';
export type {
  ResolveInput,
  ResolveResult,
  ScreenshotResolver,
  StoryIndex,
  StoryIndexEntry,
} from './types.js';
