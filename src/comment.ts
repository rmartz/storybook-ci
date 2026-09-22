import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import type { CapturedStory } from './capture.js';

export interface PostOptions {
  repo: string;
  prNumber: string;
  headSha: string;
  /** Directory the PNGs are written to; `gh` runs here so `--attach` paths are bare. */
  outputDir: string;
  /** HTML marker that tags the single update-in-place comment. */
  marker: string;
  /**
   * Optional one-line PAT-expiry warning from the preflight, rendered as a
   * footer. Empty in the ordinary case — a token with no expiration date, or one
   * expiring beyond the warning threshold.
   */
  expiryNote?: string;
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
 * `gh` must be authenticated with `STORYBOOK_SCREENSHOT_PAT` (the user-attachments
 * upload endpoint rejects the Actions `GITHUB_TOKEN` — see docs/authentication.md);
 * the caller provides it via `GH_TOKEN` in the environment.
 */
export function postScreenshotComment(captured: CapturedStory[], options: PostOptions): void {
  const files = captured.map(({ story, buffer }) => {
    const fileName = `${safeName(story.id)}.png`;
    writeFileSync(`${options.outputDir}/${fileName}`, buffer);
    const alt = `${story.title} — ${story.name}`.replace(/[#\n\r]/g, ' ').trim();
    return { story, fileName, alt };
  });

  const bodyPath = `${options.outputDir}/comment-body.md`;
  writeFileSync(bodyPath, buildCommentBody(files, options), 'utf8');

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
  for (const file of files) {
    args.push('--attach', `${file.fileName}#${file.alt}`);
  }

  // Run gh from outputDir so the `--attach` and body paths are bare filenames.
  execFileSync('gh', args, { cwd: options.outputDir, stdio: 'inherit' });
}

export interface GalleryFile {
  story: CapturedStory['story'];
  fileName: string;
  alt: string;
}

/** Exported so the rendered body — table, expiry footer, commit line — is unit-tested. */
export function buildCommentBody(files: GalleryFile[], options: PostOptions): string {
  const shortSha = options.headSha.slice(0, 7);
  const rows = files
    .map(
      (file) =>
        `| **${file.story.title}** — ${file.story.name} | ![${file.alt}](${file.fileName}) |`,
    )
    .join('\n');

  const footer = options.expiryNote ? `\n${options.expiryNote}\n` : '';

  return `${options.marker}
## 📸 Storybook Screenshots

| Story | Preview |
|---|---|
${rows}
${footer}
<sub>Generated from commit ${shortSha}</sub>`;
}

function safeName(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, '-');
}
