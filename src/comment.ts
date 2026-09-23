import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { buildGalleryBody, pairRenders } from './gallery.js';
import { writeRenders } from './renders.js';
import type { CapturedStory } from './capture.js';
import type { BaseRenderStatus, RenderedStory } from './gallery.js';

export interface PostOptions {
  repo: string;
  prNumber: string;
  headSha: string;
  /** Directory the PNGs are written to; `gh` runs here so `--attach` paths are bare. */
  outputDir: string;
  /** HTML marker that tags the single update-in-place comment. */
  marker: string;
  /**
   * Base-render entries to pair against, already written to `outputDir` by the
   * `capture-base` step. Empty unless `capture-base` is enabled.
   */
  before?: RenderedStory[];
  /** Whether a base render was asked for, and whether it survived. */
  baseStatus?: BaseRenderStatus;
  /** Did each render capture everything it selected? Drives the empty-cell label. */
  baseComplete?: boolean;
  headComplete?: boolean;
}

/**
 * Write the captured PNGs to `outputDir`, then post (or update) one marker-tagged
 * PR comment whose images are GitHub **user-attachments**, uploaded by
 * `gh pr comment --attach`. `--attach` uploads each file and rewrites the local
 * path referenced in the body to a permanent `github.com/user-attachments/…` URL
 * (gh ≥ 2.99), which is what lets the shared action drop the old orphan-branch
 * hosting entirely. Update-in-place uses `--edit-last --create-if-none`, so a
 * re-run edits the bot's existing comment instead of stacking a new one.
 *
 * When a base render is present its PNGs are already in `outputDir`, so they are
 * attached alongside the head ones and the gallery gains a Before column.
 *
 * `gh` must be authenticated with a **classic PAT** (the user-attachments upload
 * endpoint rejects the Actions `GITHUB_TOKEN` — see docs/authentication.md); the
 * caller provides it via `GH_TOKEN` in the environment.
 */
export function postScreenshotComment(captured: CapturedStory[], options: PostOptions): void {
  const after = writeRenders(captured, options.outputDir, 'after');
  const rows = pairRenders(after, options.before ?? []);
  const baseStatus = options.baseStatus ?? 'none';

  const bodyPath = `${options.outputDir}/comment-body.md`;
  writeFileSync(
    bodyPath,
    buildGalleryBody(rows, {
      marker: options.marker,
      headSha: options.headSha,
      baseStatus,
      baseComplete: options.baseComplete,
      headComplete: options.headComplete,
    }),
    'utf8',
  );

  const args = [
    'pr',
    'comment',
    options.prNumber,
    '--repo',
    options.repo,
    '--edit-last',
    '--create-if-none',
    '--body-file',
    bodyPath,
  ];
  // Only attach what the body references: a base render the body is not showing
  // (status `unavailable`) would otherwise upload PNGs nothing links to.
  for (const row of rows) {
    const shown = baseStatus === 'ok' ? [row.before, row.after] : [row.after];
    for (const story of shown) {
      if (story !== null && story !== undefined)
        args.push('--attach', `${story.file}#${story.alt}`);
    }
  }

  // Run gh from outputDir so the `--attach` and body paths are bare filenames.
  execFileSync('gh', args, { cwd: options.outputDir, stdio: 'inherit' });
}
