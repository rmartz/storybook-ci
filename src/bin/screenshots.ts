#!/usr/bin/env node
/**
 * Entry point for the screenshots reusable workflow. Three subcommands:
 *
 *   screenshots gate      Enumerate the repo's story files from the working tree
 *                         (no build needed), resolve which stories a PR's changes
 *                         touch, and emit `run` + the resolved set to
 *                         $GITHUB_OUTPUT. Lets the workflow skip the expensive
 *                         Storybook build + Playwright capture when nothing
 *                         UI-relevant changed.
 *
 *   screenshots preflight Check the screenshot PAT (present + able to auth) before
 *                         the expensive build. Emits `pat_status` to $GITHUB_OUTPUT.
 *                         When the PAT is missing/invalid/rate-limited it posts a
 *                         non-blocking advisory comment (via the Actions token) so a
 *                         reviewer learns the gallery is configured but can't post;
 *                         when it is valid it clears any prior advisory.
 *
 *   screenshots capture-base
 *                         Screenshot the same stories from a build of the PR's
 *                         BASE commit and stash them (PNGs + a manifest) in the
 *                         shared output dir for `capture` to pair against. Runs
 *                         only when `capture-base` is enabled, and is best-effort
 *                         by construction: every failure path exits 0, so a base
 *                         render that cannot be produced costs the PR nothing but
 *                         its Before column.
 *
 *   screenshots capture   Read the built `index.json`, resolve the changed
 *                         stories, screenshot them, and post/update the PR
 *                         gallery comment via `gh --attach`. When a base render
 *                         is present the gallery shows Before/After side by side.
 *
 * All configuration arrives as environment variables (set by the workflow from
 * its inputs), so nothing here is project-specific.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { clearAdvisory, isRateLimitError, postAdvisory } from '../advisory.js';
import { buildExpiryNotice, parseTokenExpiration } from '../pat-expiry.js';
import { captureStories } from '../capture.js';
import { postScreenshotComment } from '../comment.js';
import { errorMessage } from '../lib/error-message.js';
import { findFiles } from '../lib/find-files.js';
import { resolveStories } from '../resolve-stories.js';
import { readBaseRender, writeBaseManifest, writeRenders } from '../renders.js';
import { normalizeImportPath, readStoryEntries, storyFilesFromEntries } from '../story-index.js';
import type { AdvisoryOptions, PatStatus } from '../advisory.js';
import type { CaptureOptions, CaptureOutcome } from '../capture.js';
import type { BaseRenderStatus } from '../gallery.js';
import type { ResolveInput, ScreenshotResolver, StoryIndexEntry } from '../types.js';

const ADVISORY_MARKER = '<!-- storybook-screenshots-advisory -->';
const DEFAULT_DOCS_URL = 'https://github.com/rmartz/storybook-ci/blob/main/docs/authentication.md';

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

function advisoryOptions(): AdvisoryOptions {
  return {
    repo: env('REPO'),
    prNumber: env('PR_NUMBER'),
    token: env('ACTIONS_TOKEN'),
    marker: ADVISORY_MARKER,
    docsUrl: env('DOCS_URL', DEFAULT_DOCS_URL),
  };
}

/**
 * Does the PAT authenticate? A missing/expired/revoked token fails `gh api user`;
 * an exhausted rate limit fails it too, but says so, and is not the token's fault.
 * `-i` includes the response headers, which carry the token's expiration date —
 * the same request either way, so the expiry warning costs no extra API call.
 */
function patProbe(pat: string): { status: PatStatus; response: string } {
  try {
    const response = execFileSync('gh', ['api', '-i', 'user'], {
      env: { ...process.env, GH_TOKEN: pat },
      encoding: 'utf8',
    });
    return { status: 'ok', response };
  } catch (error) {
    return {
      status: isRateLimitError(errorMessage(error)) ? 'rate-limited' : 'invalid',
      response: '',
    };
  }
}

/**
 * The PAT cannot post the gallery. That is a configuration problem no code change
 * fixes, so the job must not go red over it (a failure is routed to fix-review):
 * post the advisory for the reviewer, annotate the run, and let the step succeed.
 */
function reportUnpostable(status: Exclude<PatStatus, 'ok'>): void {
  console.log(
    `::warning title=Storybook screenshots not posted::STORYBOOK_SCREENSHOT_PAT is ${status} — see the advisory comment on the PR.`,
  );
  postAdvisory(status, advisoryOptions());
}

function runPreflight(): void {
  const pat = env('SCREENSHOT_PAT');
  const probe = pat ? patProbe(pat) : null;
  const status: PatStatus = probe?.status ?? 'missing';
  console.log(`preflight: pat_status=${status}`);

  const options = advisoryOptions();
  if (status === 'ok') {
    clearAdvisory(options);
  } else {
    reportUnpostable(status);
  }

  // A valid-but-expiring token is NOT a failure: the status stays `ok` and the
  // gallery still posts. The notice rides along on that comment rather than
  // becoming a second one, which would fight clearAdvisory()'s delete-on-ok.
  const notice =
    status === 'ok'
      ? buildExpiryNotice(
          parseTokenExpiration(probe?.response ?? ''),
          new Date(),
          warningDays(),
          options.docsUrl,
        )
      : null;
  if (notice) console.log(`preflight: ${notice}`);

  const output = env('GITHUB_OUTPUT');
  if (output) {
    appendFileSync(output, `pat_status=${status}\n`);
    appendFileSync(output, `pat_expiry_note=${notice ?? ''}\n`);
  }
}

/** Days before expiry that the warning starts; a non-numeric input falls back. */
function warningDays(): number {
  const parsed = Number(env('PAT_EXPIRY_WARNING_DAYS', ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

function outputDirectory(): string {
  const dir = env('OUTPUT_DIR', join(process.cwd(), 'storybook-screenshots-out'));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function captureOptions(staticDir: string): CaptureOptions {
  return {
    staticDir,
    port: Number(env('STORYBOOK_PORT', '6006')),
    viewport: parseViewport(env('VIEWPORT', '1280x720')),
    // Each render gets the full deadline; the job timeout covers both (see the
    // base-timeout-minutes input) so the capture still FAILS rather than cancels.
    deadlineMs: Number(env('CAPTURE_DEADLINE_MS', '240000')),
  };
}

/** Resolve the stories a render should screenshot from its own built index. */
function selectStories(staticDir: string, changedFiles: string[]): StoryIndexEntry[] {
  const entries = readStoryEntries(join(staticDir, 'index.json'));
  const storyFiles = storyFilesFromEntries(entries);
  const result = resolveStories({ ...resolverInput(changedFiles, storyFiles), storyFiles });
  console.log(result.reason);
  return selectEntries(entries, result.captureAll, new Set(result.storyFiles));
}

function isComplete(outcome: CaptureOutcome): boolean {
  return outcome.failed === 0 && !outcome.deadlineHit;
}

/**
 * Render the PR base. Best-effort: this never exits non-zero and never throws,
 * because the head screenshots are the thing that must survive — a base render
 * that fails degrades the comment to After-only and nothing more.
 *
 * The changed-file list here is the BASE side of the diff, so a renamed story
 * arrives under its pre-rename path (the base `index.json` knows no other) and
 * keeps its Before.
 */
async function runCaptureBase(): Promise<void> {
  const outputDir = outputDirectory();
  try {
    const staticDir = env('BASE_STATIC_DIR', env('STATIC_DIR', 'storybook-static'));
    const selected = selectStories(staticDir, splitList(env('BASE_CHANGED_FILES')));
    if (selected.length === 0) {
      console.log('Base render: no matching stories — every captured story is new in this PR.');
      writeBaseManifest({ complete: true, entries: [] }, outputDir);
      return;
    }

    console.log(`Base render: capturing ${selected.length} stor${plural(selected.length)}.`);
    const outcome = await captureStories(selected, captureOptions(staticDir));
    writeBaseManifest(
      {
        complete: isComplete(outcome),
        entries: writeRenders(outcome.captured, outputDir, 'before'),
      },
      outputDir,
    );
    if (!isComplete(outcome)) {
      console.error(
        `Base render incomplete (${outcome.failed} failed, deadline ${outcome.deadlineHit ? 'hit' : 'not hit'}) — those stories post without a Before.`,
      );
    }
  } catch (error) {
    // No manifest written: the head capture reads this as "unavailable" and posts
    // the After-only gallery with a note.
    console.error(`Base render skipped: ${errorMessage(error)}`);
  }
}

async function runCapture(): Promise<void> {
  const staticDir = env('STATIC_DIR', 'storybook-static');
  const outputDir = outputDirectory();
  const base = readBaseRender(outputDir);
  const selected = selectStories(staticDir, splitList(env('CHANGED_FILES')));

  // A PR that only deletes stories resolves to nothing on the head side, but its
  // base render still has Before-only rows worth posting.
  if (selected.length === 0 && base.entries.length === 0) {
    console.log('No matching stories to capture — skipping.');
    return;
  }
  if (selected.length > 0) {
    console.log(`Capturing ${selected.length} stor${plural(selected.length)}.`);
  }

  const outcome =
    selected.length > 0
      ? await captureStories(selected, captureOptions(staticDir))
      : { captured: [], failed: 0, deadlineHit: false };
  const baseStatus: BaseRenderStatus =
    env('CAPTURE_BASE') !== 'true' ? 'none' : base.available ? 'ok' : 'unavailable';
  if (baseStatus === 'unavailable') {
    console.error('Base render unavailable — posting the PR render only.');
  }

  try {
    postScreenshotComment(outcome.captured, {
      repo: env('REPO'),
      prNumber: env('PR_NUMBER'),
      headSha: env('PR_HEAD_SHA'),
      outputDir,
      marker: env('COMMENT_MARKER', '<!-- storybook-screenshots-bot -->'),
      before: base.entries,
      baseStatus,
      baseComplete: base.complete,
      headComplete: isComplete(outcome),
      expiryNote: env('PAT_EXPIRY_NOTE'),
    });
    console.log(`Published ${outcome.captured.length} screenshot(s).`);
  } catch (error) {
    // The PAT authenticated in preflight but the upload was still rejected —
    // a missing scope, or the account's rate limit running out mid-job. Neither
    // is a code problem, so alert the reviewer and do NOT fail the job.
    const message = errorMessage(error);
    console.error(`Screenshot upload failed: ${message}`);
    reportUnpostable(isRateLimitError(message) ? 'rate-limited' : 'invalid');
  }

  // Fail (fix-review), do not run to timeout (cancellation): see capture.ts.
  if (!isComplete(outcome)) {
    console.error(
      `Screenshot capture incomplete: ${outcome.failed} failed, deadline ${outcome.deadlineHit ? 'hit' : 'not hit'}.`,
    );
    process.exit(1);
  }
}

function plural(count: number): string {
  return count === 1 ? 'y' : 'ies';
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
} else if (mode === 'preflight') {
  runPreflight();
} else if (mode === 'capture-base') {
  await runCaptureBase();
} else if (mode === 'capture') {
  await runCapture();
} else {
  console.error(
    `Unknown mode "${mode ?? ''}" — expected "gate", "preflight", "capture-base", or "capture".`,
  );
  process.exit(2);
}
