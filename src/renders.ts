/**
 * On-disk side of the gallery: writing captured PNGs, and the manifest that
 * carries the base render from the `capture-base` step to the `capture` step.
 *
 * The two steps are separate processes (they screenshot two different Storybook
 * builds), so the base side hands over a small JSON manifest beside its PNGs
 * rather than an in-memory value. Reading it is deliberately forgiving: a base
 * render that did not survive must degrade the comment to After-only, never fail
 * the run that already holds the head screenshots.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderedStory } from './gallery.js';
import type { CapturedStory } from './capture.js';
import type { GallerySide, RenderedStory } from './gallery.js';

/** Manifest written by `capture-base`, read by `capture`, beside the PNGs. */
export const BASE_MANIFEST_FILE = 'before-manifest.json';

/** What `capture-base` leaves on disk for the head capture to pick up. */
export interface BaseManifest {
  /**
   * Whether the base render screenshotted everything it selected. A partial base
   * render still shows its Before column, but stops the gallery claiming the
   * stories it is missing were added in the PR.
   */
  complete: boolean;
  entries: RenderedStory[];
}

export interface BaseRender extends BaseManifest {
  /** False when no usable manifest was found — show the After-only gallery. */
  available: boolean;
}

/** Write each captured PNG under its gallery filename; return the manifest rows. */
export function writeRenders(
  captured: CapturedStory[],
  outputDir: string,
  side: GallerySide,
): RenderedStory[] {
  return captured.map(({ story, buffer }) => {
    const rendered = renderedStory(story, side);
    writeFileSync(join(outputDir, rendered.file), buffer);
    return rendered;
  });
}

/** Record the base render so the head capture can pair against it. */
export function writeBaseManifest(manifest: BaseManifest, outputDir: string): void {
  writeFileSync(join(outputDir, BASE_MANIFEST_FILE), JSON.stringify(manifest), 'utf8');
}

/**
 * Parse a manifest, tolerating anything a half-written base render could leave
 * behind. `null` means "no usable base render"; `[]` means the base legitimately
 * had no matching stories (every story in the PR is new).
 */
export function parseBaseManifest(raw: string): BaseManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { complete, entries } = parsed as Record<string, unknown>;
  if (!Array.isArray(entries)) return null;
  return { complete: complete === true, entries: entries.filter(isRenderedStory) };
}

/** Read the base render from the shared output dir. Never throws. */
export function readBaseRender(outputDir: string): BaseRender {
  const path = join(outputDir, BASE_MANIFEST_FILE);
  const missing = { available: false, complete: false, entries: [] };
  if (!existsSync(path)) return missing;
  let manifest: BaseManifest | null = null;
  try {
    manifest = parseBaseManifest(readFileSync(path, 'utf8'));
  } catch {
    manifest = null;
  }
  return manifest === null ? missing : { available: true, ...manifest };
}

function isRenderedStory(value: unknown): value is RenderedStory {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return ['id', 'title', 'name', 'file', 'alt'].every(
    (field) => typeof candidate[field] === 'string',
  );
}
