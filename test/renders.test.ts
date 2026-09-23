import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BASE_MANIFEST_FILE,
  parseBaseManifest,
  readBaseRender,
  writeBaseManifest,
} from '../src/renders.js';

const ENTRY = {
  id: 'components-button--default',
  title: 'Components/Button',
  name: 'Default',
  file: 'before-components-button--default.png',
  alt: 'Components/Button — Default (before)',
};

function outputDir(): string {
  return mkdtempSync(join(tmpdir(), 'sb-renders-'));
}

const MANIFEST = { complete: true, entries: [ENTRY] };

describe('parseBaseManifest', () => {
  it('reads a well-formed manifest', () => {
    expect(parseBaseManifest(JSON.stringify(MANIFEST))).toEqual(MANIFEST);
  });

  it('returns null for unparseable JSON rather than throwing', () => {
    expect(parseBaseManifest('{not json')).toBeNull();
  });

  it('returns null when the payload has no entries array', () => {
    expect(parseBaseManifest(JSON.stringify({ complete: true }))).toBeNull();
  });

  it('drops entries missing a required field', () => {
    const raw = JSON.stringify({ complete: true, entries: [ENTRY, { id: 'x' }, null] });
    expect(parseBaseManifest(raw)).toEqual(MANIFEST);
  });

  it('accepts a legitimately empty base render', () => {
    expect(parseBaseManifest('{"complete":true,"entries":[]}')).toEqual({
      complete: true,
      entries: [],
    });
  });

  it('treats a manifest that never claimed completeness as incomplete', () => {
    expect(parseBaseManifest(JSON.stringify({ entries: [ENTRY] }))?.complete).toBe(false);
  });
});

describe('readBaseRender', () => {
  it('reports unavailable when no manifest was written', () => {
    expect(readBaseRender(outputDir())).toEqual({ available: false, complete: false, entries: [] });
  });

  it('reports unavailable when the manifest is corrupt', () => {
    const dir = outputDir();
    writeFileSync(join(dir, BASE_MANIFEST_FILE), '{not json', 'utf8');
    expect(readBaseRender(dir)).toEqual({ available: false, complete: false, entries: [] });
  });

  it('reports the entries a successful base render wrote', () => {
    const dir = outputDir();
    writeFileSync(join(dir, BASE_MANIFEST_FILE), JSON.stringify(MANIFEST), 'utf8');
    expect(readBaseRender(dir)).toEqual({ available: true, complete: true, entries: [ENTRY] });
  });

  it('treats an empty base render as available, not failed', () => {
    const dir = outputDir();
    writeFileSync(join(dir, BASE_MANIFEST_FILE), '{"complete":true,"entries":[]}', 'utf8');
    expect(readBaseRender(dir)).toEqual({ available: true, complete: true, entries: [] });
  });

  it('round-trips what writeBaseManifest wrote', () => {
    const dir = outputDir();
    writeBaseManifest({ complete: false, entries: [ENTRY] }, dir);
    expect(readBaseRender(dir)).toEqual({ available: true, complete: false, entries: [ENTRY] });
  });
});
