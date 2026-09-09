// IMPLEMENTATION.md §"Storage": "Applying a column preset **does** regenerate column ids.
// Remap `rows[].answer` in the same transaction or answers are silently lost."

import { describe, expect, it } from 'vitest';

import { addColumn, applyPreset, matchesPreset, removeColumn } from './presets.js';
import { PRESETS } from './model.js';
import { col, exercise, row } from './fixtures.test-support.js';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;

describe('applyPreset', () => {
  it('rebuilds the columns with fresh ids', () => {
    const ex = exercise();
    const next = applyPreset(ex, preset('rg'));
    expect(next.columns.map((c) => c.label)).toEqual(['Riktig', 'Galt']);
    expect(next.columns[0]!.id).not.toBe(ex.columns[0]!.id);
  });

  it('keeps answers whose label survives and nulls the rest', () => {
    // Riktig/Galt → Ja/Nei: no label survives, so every answer is dropped rather than
    // silently re-pointed at whatever column sits at the same index.
    const ex = exercise();
    const jaNei = applyPreset(ex, preset('jn'));
    expect(jaNei.rows.every((r) => r.answer === null)).toBe(true);

    // Riktig/Galt → Riktig/Galt/Står ikke: both labels survive, both answers move.
    const wider = applyPreset(ex, preset('rgs'));
    expect(wider.rows[0]!.answer).toBe(wider.columns[0]!.id);
    expect(wider.rows[1]!.answer).toBe(wider.columns[1]!.id);
  });

  it('matches labels case-insensitively', () => {
    const ex = exercise({ columns: [col('riktig'), col('GALT')] });
    const remapped = applyPreset(
      { ...ex, rows: [row('a', ex.columns[0]!.id)] },
      preset('rg'),
    );
    expect(remapped.rows[0]!.answer).toBe(remapped.columns[0]!.id);
  });

  it('survives every preset in turn', () => {
    let ex = exercise();
    for (const p of PRESETS) ex = applyPreset(ex, p);
    expect(ex.columns.map((c) => c.label)).toEqual(['Sant', 'Usant']);
    expect(ex.rows.every((r) => r.answer === null)).toBe(true);
  });
});

describe('matchesPreset', () => {
  it('is true when the labels match in order — BEHAVIOR S1.7', () => {
    const ex = exercise();
    expect(matchesPreset(ex, preset('rg'))).toBe(true);
    expect(matchesPreset(ex, preset('rgs'))).toBe(false);
  });

  it('is false when the order differs', () => {
    const ex = exercise({ columns: [col('Galt'), col('Riktig')] });
    expect(matchesPreset(ex, preset('rg'))).toBe(false);
  });
});

describe('removeColumn', () => {
  it('nulls the answers that pointed at it', () => {
    const ex = applyPreset(exercise(), preset('rgs'));
    const marked = {
      ...ex,
      rows: [row('a', ex.columns[2]!.id), row('b', ex.columns[0]!.id)],
    };

    const next = removeColumn(marked, ex.columns[2]!.id);
    expect(next.columns).toHaveLength(2);
    expect(next.rows[0]!.answer).toBeNull();
    expect(next.rows[1]!.answer).toBe(ex.columns[0]!.id);
  });

  it('refuses to go below two columns — BEHAVIOR S1.10', () => {
    const ex = exercise();
    expect(removeColumn(ex, ex.columns[0]!.id)).toBe(ex);
  });

  it('ignores an unknown column', () => {
    const ex = applyPreset(exercise(), preset('rgs'));
    expect(removeColumn(ex, 'nope')).toBe(ex);
  });
});

describe('addColumn', () => {
  it('appends an empty column', () => {
    const next = addColumn(exercise());
    expect(next.columns).toHaveLength(3);
    expect(next.columns[2]!.label).toBe('');
  });

  it('stops at four — BEHAVIOR S1.11', () => {
    const four = addColumn(addColumn(applyPreset(exercise(), PRESETS[1]!)));
    expect(four.columns).toHaveLength(4);
    expect(addColumn(four)).toBe(four);
  });
});
