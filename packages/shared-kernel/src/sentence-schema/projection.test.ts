// What reaches the browser, and what the runner starts from.

import { describe, expect, it } from 'vitest';

import { chunk, content, row } from './fixtures.test-support.js';
import { bankOf, keyIsDue, toStudentProjection } from './projection.js';

const reversed = <T,>(items: T[]): T[] => [...items].reverse();

describe('toStudentProjection', () => {
  it('sends only deliverable rows', () => {
    const ex = content({
      rows: [row(), row({ id: 'r2', text: 'Jeg leser', chunks: [chunk('d1', 'Jeg', null)] })],
    });

    expect(toStudentProjection(ex).rows.map((r) => r.id)).toEqual(['r1']);
  });

  it('builds the bank from the chunks and the extras', () => {
    const ex = content({ rows: [row({ extras: [{ id: 'x1', text: 'blir' }] })] });

    expect(toStudentProjection(ex).rows[0]!.bank.map((i) => i.text)).toContain('blir');
  });

  it('leaves the extras out when the setting is off — hidden, not deleted', () => {
    const ex = content({
      rows: [row({ extras: [{ id: 'x1', text: 'blir' }] })],
      settings: { ...content().settings, extras: false },
    });

    expect(toStudentProjection(ex).rows[0]!.bank.map((i) => i.id)).not.toContain('x1');
    expect(ex.rows[0]!.extras).toHaveLength(1);
  });

  it('shuffles the bank when asked, and leaves it alone when not', () => {
    const ex = content();
    const shuffled = toStudentProjection(ex, reversed).rows[0]!.bank.map((i) => i.id);
    expect(shuffled).toEqual(['c6', 'c5', 'c4', 'c3', 'c2', 'c1']);

    const still = content({ settings: { ...ex.settings, shuffle: false } });
    expect(toStudentProjection(still, reversed).rows[0]!.bank.map((i) => i.id)).toEqual([
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
      'c6',
    ]);
  });

  it('withholds the counts unless the author turned them on', () => {
    const ex = content();
    expect(toStudentProjection(ex).rows[0]!.counts).toBeNull();

    const shown = content({ settings: { ...ex.settings, counts: true } });
    expect(toStudentProjection(shown).rows[0]!.counts).toEqual({ F: 1, v: 1, n: 1, a: 1, V: 1, N: 1 });
  });

  it('starts the board per the prefill setting', () => {
    const ex = content();
    expect(toStudentProjection(ex).rows[0]!.start).toEqual({});

    const prefilled = content({ settings: { ...ex.settings, prefill: 'first' } });
    expect(toStudentProjection(prefilled).rows[0]!.start).toEqual({ F: ['c1'] });
  });

  it('carries the source sentence and never the target', () => {
    const ex = content({ rows: [row({ source: 'Jeg skal lese boka i morgen' })] });
    const projected = toStudentProjection(ex);

    expect(projected.rows[0]!.source).toBe('Jeg skal lese boka i morgen');
    expect(JSON.stringify(projected)).not.toContain('I morgen skal jeg ikke lese boka');
  });

  it('never derives a chunk from the source sentence', () => {
    const ex = content({ rows: [row({ source: 'Jeg skal lese boka i morgen' })] });
    const bank = toStudentProjection(ex).rows[0]!.bank;

    expect(bank).toHaveLength(6);
    expect(bank.map((i) => i.text)).not.toContain('Jeg');
  });

  it('carries no field, no alt, no why and no fb', () => {
    const ex = content({ rows: [row({ fb: { c1: 'Fronted adverbial.' } })] });
    const serialised = JSON.stringify(toStudentProjection(ex));

    expect(serialised).not.toContain('Fronted adverbial');
    expect(serialised).not.toContain('Det finitte verbet');
    expect(serialised).not.toContain('"alt"');
  });

  it('shows an empty set rather than throwing when nothing is deliverable', () => {
    const ex = content({ rows: [row({ chunks: [chunk('c1', 'Jeg', null)] })] });

    expect(toStudentProjection(ex).rows).toEqual([]);
  });
});

describe('keyIsDue', () => {
  it('holds the key back while the row is still open', () => {
    expect(keyIsDue(false, false)).toBe(false);
    expect(keyIsDue(true, false)).toBe(true);
    expect(keyIsDue(false, true)).toBe(true);
  });
});

describe('bankOf', () => {
  it('answers for one row without projecting the document', () => {
    const settings = content().settings;
    const r = row({ extras: [{ id: 'x1', text: 'blir' }] });

    expect(bankOf(r, settings)).toHaveLength(7);
    expect(bankOf(r, { ...settings, extras: false })).toHaveLength(6);
  });
});
