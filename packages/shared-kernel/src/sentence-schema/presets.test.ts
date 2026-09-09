import { describe, expect, it } from 'vitest';

import { packsFor, PRESETS } from './presets.js';

const ids = (packs: readonly { id: string }[]) => packs.map((p) => p.id);

describe('packsFor', () => {
  it('offers the packs of the course language plus the language-agnostic one', () => {
    expect(ids(packsFor('nb'))).toEqual(['nb-full', 'nb-simple', 'blank']);
    expect(ids(packsFor('de'))).toEqual(['de-topo', 'blank']);
  });

  it('treats nynorsk as Norwegian — the chart is the same and a nn course exists', () => {
    expect(ids(packsFor('nn'))).toEqual(['nb-full', 'nb-simple', 'blank']);
  });

  it('falls back to the language-agnostic packs when nothing matches', () => {
    // A Ukrainian course: the platform has no field chart for it, and saying so is the
    // point — the builder pairs this with the sequence-only mode.
    expect(ids(packsFor('uk'))).toEqual(['blank']);
  });

  it('keeps the pack the exercise already sits on, however foreign', () => {
    expect(ids(packsFor('nb', 'de-topo'))).toEqual(['nb-full', 'nb-simple', 'de-topo', 'blank']);
  });

  it('reads the subtag and ignores case', () => {
    expect(ids(packsFor('NB-NO'))).toEqual(ids(packsFor('nb')));
  });

  it('never returns nothing, whatever it is handed', () => {
    expect(packsFor('')).toHaveLength(1);
    expect(packsFor('   ')).toHaveLength(1);
  });

  it('gives every pack a language list', () => {
    for (const pack of PRESETS) expect(Array.isArray(pack.langs)).toBe(true);
  });
});
