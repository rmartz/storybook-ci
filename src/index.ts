/**
 * Public surface of the storybook-ci capture logic. The repo is CI-only and
 * unpublished (no npm package), so this exists to give the modules one import
 * root and to keep the resolver — the tested core — easy to consume from tests.
 */
export { resolveStories } from './resolve-stories.js';
export { captureStories } from './capture.js';
export { postScreenshotComment } from './comment.js';
export { buildGalleryBody, pairRenders, renderedStory } from './gallery.js';
export type {
  BaseRenderStatus,
  GalleryBodyOptions,
  GalleryRow,
  GallerySide,
  RenderedStory,
} from './gallery.js';
export {
  BASE_MANIFEST_FILE,
  parseBaseManifest,
  readBaseRender,
  writeBaseManifest,
  writeRenders,
} from './renders.js';
export type { BaseManifest, BaseRender } from './renders.js';
export { buildAdvisoryBody, postAdvisory, clearAdvisory } from './advisory.js';
export type { PatStatus, AdvisoryOptions } from './advisory.js';
export { readStoryEntries, storyFilesFromEntries, normalizeImportPath } from './story-index.js';
export { errorMessage } from './lib/error-message.js';
export { findFiles } from './lib/find-files.js';
export { resolveStaticPath } from './lib/static-path.js';
export { SCREENSHOT_RESOLVERS } from './types.js';
export type {
  ResolveInput,
  ResolveResult,
  ScreenshotResolver,
  StoryIndex,
  StoryIndexEntry,
} from './types.js';
