/**
 * Pure gallery composition: how a captured story becomes an attachable PNG, how
 * the head and base renders pair up, and what the PR comment body looks like.
 *
 * Kept free of I/O so the Before/After logic — the part with real edge cases
 * (asymmetric sets, a failed base render) — is unit-tested rather than only
 * exercised in CI.
 */
import type { StoryIndexEntry } from './types.js';

/** Which render a PNG came from. The base render is the "before" side. */
export type GallerySide = 'before' | 'after';

/**
 * Whether the gallery has a base render to show.
 *
 * - `none`: `capture-base` is off — the classic single-column gallery.
 * - `ok`: the base render produced a manifest; show Before/After.
 * - `unavailable`: a base render was requested but did not survive. The head
 *   screenshots are still posted (best-effort base), with a note saying why.
 */
export type BaseRenderStatus = 'none' | 'ok' | 'unavailable';

/** One captured story, resolved to the filename the comment body references. */
export interface RenderedStory {
  id: string;
  title: string;
  name: string;
  /** Bare filename inside the output dir; `gh --attach` rewrites it to a URL. */
  file: string;
  alt: string;
}

/** One gallery line: a story with either side, or both. */
export interface GalleryRow {
  id: string;
  title: string;
  name: string;
  before: RenderedStory | null;
  after: RenderedStory | null;
}

export interface GalleryBodyOptions {
  marker: string;
  headSha: string;
  baseStatus: BaseRenderStatus;
  /**
   * Whether each render captured everything it selected. An empty cell only means
   * "added"/"removed in this PR" when the *other* render is known complete —
   * otherwise the story may simply have failed to screenshot, and saying it was
   * added would be a lie a reviewer acts on.
   */
  baseComplete?: boolean;
  headComplete?: boolean;
  /**
   * Optional one-line PAT-expiry warning from the preflight, rendered as a
   * footer. Empty in the ordinary case — a token with no expiration date, or one
   * expiring beyond the warning threshold.
   */
  expiryNote?: string;
}

const BEFORE_PREFIX = 'before-';
const NOT_CAPTURED = '_not captured_';

/**
 * Filename + alt text for one captured story. Both sides land in the same output
 * dir (so `gh --attach` can run once, from one cwd), so the base side carries a
 * prefix to keep the two PNGs of a story distinct.
 */
export function renderedStory(story: StoryIndexEntry, side: GallerySide): RenderedStory {
  const safeId = story.id.replace(/[^a-zA-Z0-9-]/g, '-');
  const suffix = side === 'before' ? ' (before)' : '';
  return {
    id: story.id,
    title: story.title,
    name: story.name,
    file: `${side === 'before' ? BEFORE_PREFIX : ''}${safeId}.png`,
    alt: `${story.title} — ${story.name}${suffix}`.replace(/[#\n\r]/g, ' ').trim(),
  };
}

/**
 * Join the two renders by story id. Asymmetry is normal, not an error: a story
 * added in the PR has no base render, and one deleted in the PR has no head
 * render — both still earn a row, so a reviewer sees what appeared and what left.
 */
export function pairRenders(after: RenderedStory[], before: RenderedStory[]): GalleryRow[] {
  const beforeById = new Map(before.map((story) => [story.id, story]));
  const rows: GalleryRow[] = after.map((story) => ({
    id: story.id,
    title: story.title,
    name: story.name,
    before: beforeById.get(story.id) ?? null,
    after: story,
  }));

  const afterIds = new Set(after.map((story) => story.id));
  for (const story of before) {
    if (afterIds.has(story.id)) continue;
    rows.push({ id: story.id, title: story.title, name: story.name, before: story, after: null });
  }
  return rows;
}

/**
 * Would the gallery show any image at all? Head screenshots always count; base
 * ones only when the body shows the Before column (`ok`). When every head capture
 * failed and no base render is usable, posting would publish an empty table — and
 * edit-in-place would overwrite the last good gallery with it — so the caller
 * skips the comment. The job still fails on the incomplete capture.
 */
export function hasGalleryImages(
  afterCount: number,
  beforeCount: number,
  baseStatus: BaseRenderStatus,
): boolean {
  return afterCount > 0 || (baseStatus === 'ok' && beforeCount > 0);
}

/** The PR comment body: one update-in-place gallery, marker first. */
export function buildGalleryBody(rows: GalleryRow[], options: GalleryBodyOptions): string {
  const shortSha = options.headSha.slice(0, 7);
  const note =
    options.baseStatus === 'unavailable'
      ? '\n> ⚠️ The base-branch render was unavailable for this run — showing the PR render only.\n'
      : '';
  const footer =
    options.baseStatus === 'ok'
      ? `<sub>Generated from commit ${shortSha} — **Before** is the PR base.</sub>`
      : `<sub>Generated from commit ${shortSha}</sub>`;
  // Blank lines on both sides, or the blockquote absorbs its neighbours.
  const expiry = options.expiryNote ? `${options.expiryNote}\n\n` : '';

  return `${options.marker}
## 📸 Storybook Screenshots
${note}
${options.baseStatus === 'ok' ? pairedTable(rows, options) : singleTable(rows)}

${expiry}${footer}`;
}

function singleTable(rows: GalleryRow[]): string {
  const body = rows
    .filter((row) => row.after !== null)
    .map((row) => `| ${label(row)} | ${cell(row.after)} |`)
    .join('\n');
  return `| Story | Preview |\n|---|---|\n${body}`;
}

function pairedTable(rows: GalleryRow[], options: GalleryBodyOptions): string {
  const missingBefore = options.baseComplete === false ? NOT_CAPTURED : '_new in this PR_';
  const missingAfter = options.headComplete === false ? NOT_CAPTURED : '_removed in this PR_';
  const body = rows
    .map(
      (row) =>
        `| ${label(row)} | ${cell(row.before, missingBefore)} | ${cell(row.after, missingAfter)} |`,
    )
    .join('\n');
  return `| Story | Before | After |\n|---|---|---|\n${body}`;
}

function label(row: GalleryRow): string {
  return `**${row.title}** — ${row.name}`;
}

function cell(story: RenderedStory | null, missing = ''): string {
  return story === null ? missing : `![${story.alt}](${story.file})`;
}
