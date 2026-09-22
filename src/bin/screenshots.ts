#!/usr/bin/env node
/**
 * Entry point for the screenshots reusable workflow. Two subcommands:
 *
 *   screenshots gate      Enumerate the repo's story files from the working tree
 *                         (no build needed), resolve which stories a PR's changes
 *                         touch, and emit `run` + the resolved set to
 *                         $GITHUB_OUTPUT. Lets the workflow skip the expensive
 *                         Storybook build + Playwright capture when nothing
 *                         UI-relevant changed.
 *
 *   screenshots capture   Read the built `index.json`, resolve the changed
 *                         stories, screenshot them, and post/update the PR
 *                         gallery comment via `gh --attach`.
 *
 * All configuration arrives as environment variables (set by the workflow from
 * its inputs), so nothing here is project-specific.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { captureStories } from '../capture.js';
import { postScreenshotComment } from '../comment.js';
import { findFiles } from '../lib/find-files.js';
import { resolveStories } from '../resolve-stories.js';
import { normalizeImportPath, readStoryEntries, storyFilesFromEntries } from '../story-index.js';
import type { ResolveInput, ScreenshotResolver, StoryIndexEntry } from '../types.js';

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolverInput(changedFiles: string[], storyFiles: string[]): ResolveInput {
  return {
    changedFiles,
    storyFiles,
    storyGlobs: splitList(env('STORY_GLOBS', 'src/**/*.stories.@(ts|tsx)')),
    componentGlobs: splitList(env('COMPONENT_GLOBS', 'src/**/*.@(ts|tsx)')),
    storybookConfigGlobs: splitList(env('STORYBOOK_CONFIG_GLOBS', '.storybook/**')),
    resolver: env('RESOLVER', 'colocation') as ScreenshotResolver,
  };
}

function parseViewport(value: string): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (!match) return { width: 1280, height: 720 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function runGate(): void {
  const workspace = env('WORKSPACE', process.cwd());
  const changedFiles = splitList(env('CHANGED_FILES'));
  const input = resolverInput(changedFiles, []);
  const storyFiles = findFiles(workspace, input.storyGlobs);
  const result = resolveStories({ ...input, storyFiles });
  const run = result.captureAll || result.storyFiles.length > 0;

  console.log(result.reason);
  console.log(`gate: run=${run} captureAll=${result.captureAll}`);

  const output = env('GITHUB_OUTPUT');
  if (output) {
    appendFileSync(output, `run=${run}\n`);
    appendFileSync(output, `capture_all=${result.captureAll}\n`);
  }
}

async function runCapture(): Promise<void> {
  const staticDir = env('STATIC_DIR', 'storybook-static');
  const changedFiles = splitList(env('CHANGED_FILES'));
  const entries = readStoryEntries(join(staticDir, 'index.json'));
  const storyFiles = storyFilesFromEntries(entries);
  const result = resolveStories({ ...resolverInput(changedFiles, storyFiles), storyFiles });
  console.log(result.reason);

  const selected = selectEntries(entries, result.captureAll, new Set(result.storyFiles));
  if (selected.length === 0) {
    console.log('No matching stories to capture — skipping.');
    return;
  }
  console.log(`Capturing ${selected.length} stor${selected.length === 1 ? 'y' : 'ies'}.`);

  const outputDir = env('OUTPUT_DIR', join(process.cwd(), 'storybook-screenshots-out'));
  mkdirSync(outputDir, { recursive: true });

  const outcome = await captureStories(selected, {
    staticDir,
    port: Number(env('STORYBOOK_PORT', '6006')),
    viewport: parseViewport(env('VIEWPORT', '1280x720')),
    deadlineMs: Number(env('CAPTURE_DEADLINE_MS', '240000')),
  });

  if (outcome.captured.length > 0) {
    postScreenshotComment(outcome.captured, {
      repo: env('REPO'),
      prNumber: env('PR_NUMBER'),
      headSha: env('PR_HEAD_SHA'),
      outputDir,
      marker: env('COMMENT_MARKER', '<!-- storybook-screenshots-bot -->'),
    });
    console.log(`Published ${outcome.captured.length} screenshot(s).`);
  } else {
    console.log('No screenshots captured.');
  }

  // Fail (fix-review), do not run to timeout (cancellation): see capture.ts.
  if (outcome.deadlineHit || outcome.failed > 0) {
    console.error(
      `Screenshot capture incomplete: ${outcome.failed} failed, deadline ${outcome.deadlineHit ? 'hit' : 'not hit'}.`,
    );
    process.exit(1);
  }
}

function selectEntries(
  entries: StoryIndexEntry[],
  captureAll: boolean,
  resolved: Set<string>,
): StoryIndexEntry[] {
  if (captureAll) return entries;
  return entries.filter((entry) => resolved.has(normalizeImportPath(entry.importPath)));
}

const mode = process.argv[2];
if (mode === 'gate') {
  runGate();
} else if (mode === 'capture') {
  await runCapture();
} else {
  console.error(`Unknown mode "${mode ?? ''}" — expected "gate" or "capture".`);
  process.exit(2);
}
