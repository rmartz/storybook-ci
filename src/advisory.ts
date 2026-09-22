import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Whether the screenshot PAT can post the gallery. `missing` (no secret) and
 * `invalid` (set but rejected) both mean the gallery cannot be posted; the
 * screenshots job then posts a non-blocking advisory comment instead.
 */
export type PatStatus = 'ok' | 'missing' | 'invalid';

export interface AdvisoryOptions {
  repo: string;
  prNumber: string;
  /** The Actions GITHUB_TOKEN — posts a normal comment (no `--attach` needed). */
  token: string;
  /** Marker tagging the single advisory comment, kept distinct from the gallery's. */
  marker: string;
  docsUrl: string;
}

/**
 * Body of the advisory comment: states that screenshots are configured but the
 * PAT is missing/invalid, that this does not block the PR, and how to fix it.
 * Pure, so it is unit-tested.
 */
export function buildAdvisoryBody(
  status: Exclude<PatStatus, 'ok'>,
  marker: string,
  docsUrl: string,
): string {
  const reason =
    status === 'missing'
      ? 'the `STORYBOOK_SCREENSHOT_PAT` secret is **not set**'
      : 'the `STORYBOOK_SCREENSHOT_PAT` secret is **invalid or expired**';
  return `${marker}
## 📸 Storybook Screenshots — not posted

Storybook screenshots are configured for this PR, but the gallery could not be posted because ${reason}.

This is **advisory only** — it does **not** block the PR. To restore the gallery, set a classic PAT (\`repo\` scope) as the \`STORYBOOK_SCREENSHOT_PAT\` secret, then re-run the job. See ${docsUrl}.

<sub>storybook-ci</sub>`;
}

interface ExistingComment {
  id: number;
  body: string;
}

/** Post or update-in-place the advisory comment, matched by its marker. */
export function postAdvisory(status: Exclude<PatStatus, 'ok'>, options: AdvisoryOptions): void {
  const existingId = findMarkerCommentId(options);
  const body = buildAdvisoryBody(status, options.marker, options.docsUrl);
  const dir = mkdtempSync(join(tmpdir(), 'sb-advisory-'));
  const file = join(dir, 'body.json');
  writeFileSync(file, JSON.stringify({ body }), 'utf8');
  const path =
    existingId !== null
      ? `repos/${options.repo}/issues/comments/${existingId}`
      : `repos/${options.repo}/issues/${options.prNumber}/comments`;
  gh(options.token, ['api', '-X', existingId !== null ? 'PATCH' : 'POST', path, '--input', file]);
}

/** Remove the advisory comment if present — called once the PAT is valid again. */
export function clearAdvisory(options: AdvisoryOptions): void {
  const existingId = findMarkerCommentId(options);
  if (existingId === null) return;
  gh(options.token, ['api', '-X', 'DELETE', `repos/${options.repo}/issues/comments/${existingId}`]);
}

function findMarkerCommentId(options: AdvisoryOptions): number | null {
  // gh --paginate concatenates array pages into a single JSON array.
  const raw = execFileSync(
    'gh',
    ['api', '--paginate', `repos/${options.repo}/issues/${options.prNumber}/comments`],
    { env: { ...process.env, GH_TOKEN: options.token }, encoding: 'utf8' },
  );
  const comments = JSON.parse(raw) as ExistingComment[];
  const match = comments.find((comment) => comment.body?.includes(options.marker));
  return match ? match.id : null;
}

function gh(token: string, args: string[]): void {
  execFileSync('gh', args, { env: { ...process.env, GH_TOKEN: token }, stdio: 'inherit' });
}
