import { defineConfig } from 'vitest/config';

// Single-package repo: vitest globs the whole test tree, so there is no manual
// discovery list to fall out of sync with the files on disk.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The capture/comment/advisory stages drive Playwright and the GitHub CLI
      // (I/O with no pure return), and bin/index are wiring; the resolver and the
      // pure comment-body builders are the tested logic.
      exclude: ['**/bin/**', '**/index.ts', 'src/capture.ts', 'src/comment.ts', 'src/advisory.ts'],
    },
  },
});
