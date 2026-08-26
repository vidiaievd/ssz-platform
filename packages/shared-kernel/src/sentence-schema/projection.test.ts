// What reaches the browser, and what the runner starts from.

import { describe, expect, it } from 'vitest';

import { chunk, content, MAIN_FIELDS, row } from './fixtures.test-support.js';
import { grade } from './grading.js';
import { bankOf, keyIsDue, revealRow, toStudentProjection, toStudentResult } from './projection.js';

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

describe('toStudentResult', () => {
  const settings = content().settings;
  const solved = { F: ['c1'], v: ['c2'], n: ['c3'], a: ['c4'], V: ['c5'], N: ['c6'] };
  const wrong = { F: ['c2'], v: ['c1'], n: ['c3'], a: ['c4'], V: ['c5'], N: ['c6'] };

  const check = (placement: Record<string, string[]>, attempt = 1, revealed = false) => {
    const r = row();
    return toStudentResult({
      row: r,
      fields: MAIN_FIELDS,
      marks: grade(r, MAIN_FIELDS, placement, settings),
      settings,
      attempt,
      revealed,
    });
  };

  it('holds the sentence and the rule back while the row is still open', () => {
    // `Rett opp` only means something while the answer is unknown, and `row.text` is the
    // word order written out.
    const result = check(wrong);

    expect(result.text).toBeNull();
    expect(result.why).toBeNull();
    expect(result.solution).toBeNull();
    expect(result.solved).toBe(false);
  });

  it('hands the sentence and the rule over once the row is solved', () => {
    const result = check(solved);

    expect(result.solved).toBe(true);
    expect(result.score).toBe(100);
    expect(result.text).toBe('I morgen skal jeg ikke lese boka');
    expect(result.banner?.text).toBe('Det finitte verbet står på plass to.');
  });

  it('resolves the banner server-side, because the chain runs over the key', () => {
    // `row.fb[chunkId]` → a default for the kind of mistake → `row.why`. The first and
    // the last of those never reach a browser, so the resolved note is what travels.
    // On `c1`, not `c2`: the banner speaks about the mistake nearest the start of the
    // sentence, and in this board both pieces are misplaced.
    const r = row({ fb: { c1: 'Adverbialet hører ikke hjemme på verbets plass.' } });
    const marks = grade(r, MAIN_FIELDS, wrong, settings);
    const result = toStudentResult({
      row: r,
      fields: MAIN_FIELDS,
      marks,
      settings,
      attempt: 1,
      revealed: false,
    });

    expect(result.banner).toEqual({
      source: 'override',
      text: 'Adverbialet hører ikke hjemme på verbets plass.',
      code: null,
      hint: '',
    });
  });

  it('escalates to the rule from the second attempt', () => {
    expect(check(wrong, 1).banner?.hint).toBe('');
    expect(check(wrong, 2).banner?.hint).toBe('Det finitte verbet står på plass to.');
  });

  it('drops the per-field marks when the author turned them off, and keeps the verdict', () => {
    // §6.8: hiding where the mistake is must not hide that there is one.
    const r = row();
    const bare = { ...settings, perField: false };
    const result = toStudentResult({
      row: r,
      fields: MAIN_FIELDS,
      marks: grade(r, MAIN_FIELDS, wrong, bare),
      settings: bare,
      attempt: 1,
      revealed: false,
    });

    expect(result.byField).toBeNull();
    expect(result.byItem['c2']).toBe('field');
    expect(result.banner).not.toBeNull();
  });
});

describe('revealRow', () => {
  const settings = content().settings;

  it('fills the board in and still counts the sentence as not solved', () => {
    // The marks come out perfect because the answer was put there. `Vis riktig skjema`
    // ends the sentence; it does not win it (plan 52 §3.4).
    const r = row();
    const { placement, result } = revealRow(r, MAIN_FIELDS, settings, 2);

    expect(placement).toEqual({ F: ['c1'], v: ['c2'], n: ['c3'], a: ['c4'], V: ['c5'], N: ['c6'] });
    expect(result.solved).toBe(false);
    expect(result.score).toBe(0);
    expect(result.solution).toEqual(placement);
    expect(result.text).toBe('I morgen skal jeg ikke lese boka');
    expect(result.banner?.text).toBe('Det finitte verbet står på plass to.');
  });
});
