// README §"Derived values" — the functions every other surface asks instead of
// re-deriving.

import { describe, expect, it } from 'vitest';

import { balance, column, coverage, isAnswered, quoteFound, readyRows, setAnswer, writtenRows } from './derive.js';
import { col, exercise, row } from './fixtures.test-support.js';

describe('column', () => {
  it('finds a live column and answers null for a dead one', () => {
    const ex = exercise();
    expect(column(ex, ex.columns[0]!.id)?.label).toBe('Riktig');
    expect(column(ex, 'gone')).toBeNull();
    expect(column(ex, null)).toBeNull();
  });
});

describe('isAnswered', () => {
  it('is false for a key pointing at a deleted column', () => {
    const ex = exercise();
    expect(isAnswered(ex, ex.rows[0]!)).toBe(true);
    expect(isAnswered(ex, row('Orphan.', 'deleted-column'))).toBe(false);
  });
});

describe('readyRows', () => {
  it('drops rows with no text and rows with no key', () => {
    const right = col('Riktig');
    const ex = exercise({
      columns: [right, col('Galt')],
      rows: [
        row('Written and answered.', right.id),
        row('Written, unanswered.'),
        row('   ', right.id),
      ],
    });

    expect(readyRows(ex).map((r) => r.text)).toEqual(['Written and answered.']);
    expect(writtenRows(ex)).toHaveLength(2);
  });
});

describe('balance', () => {
  it('counts the answers per column and names the biggest share', () => {
    const right = col('Riktig');
    const wrong = col('Galt');
    const ex = exercise({
      columns: [right, wrong],
      rows: [row('a', right.id), row('b', right.id), row('c', right.id), row('d', wrong.id)],
    });

    const b = balance(ex);
    expect(b.total).toBe(4);
    expect(b.counts.map((c) => c.n)).toEqual([3, 1]);
    expect(b.top?.label).toBe('Riktig');
    expect(b.topShare).toBeCloseTo(0.75);
    expect(b.unused).toEqual([]);
  });

  it('reports an unused column', () => {
    const right = col('Riktig');
    const wrong = col('Galt');
    const ex = exercise({ columns: [right, wrong], rows: [row('a', right.id), row('b', right.id)] });
    expect(balance(ex).unused.map((c) => c.label)).toEqual(['Galt']);
  });

  it('has no top column when nothing is ready', () => {
    const ex = exercise({ rows: [row('unanswered')] });
    const b = balance(ex);
    expect(b.total).toBe(0);
    expect(b.top).toBeNull();
    expect(b.topShare).toBe(0);
  });
});

describe('coverage', () => {
  it('counts explanations and quotes over ready rows only', () => {
    const right = col('Riktig');
    const ex = exercise({
      columns: [right, col('Galt')],
      rows: [
        row('a', right.id, { why: 'because' }),
        row('b', right.id, { quote: 'line' }),
        row('c', right.id),
        row('unanswered but explained', null, { why: 'ignored' }),
      ],
    });

    expect(coverage(ex)).toEqual({ total: 3, written: 1, quoted: 1, missing: 2 });
  });
});

describe('quoteFound', () => {
  const passage = 'Fra 1. januar må alle som sykler\ni mørket ha lys både foran og bak.';

  it('matches across a line break, because a pasted quote carries one', () => {
    expect(quoteFound(passage, 'som sykler i mørket ha lys')).toBe(true);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(quoteFound(passage, '  MÅ ALLE  ')).toBe(true);
  });

  it('is false for wording that is not there', () => {
    expect(quoteFound(passage, 'sykler uten lys')).toBe(false);
  });

  it('treats an empty quote as nothing to check', () => {
    expect(quoteFound(passage, '   ')).toBe(true);
  });
});

describe('setAnswer', () => {
  it('marks a column', () => {
    expect(setAnswer(row('a'), 'c1').answer).toBe('c1');
  });

  it('clears when the same column is set again — BEHAVIOR S2.4', () => {
    expect(setAnswer(row('a', 'c1'), 'c1').answer).toBeNull();
  });

  it('replaces rather than accumulates — one answer per row', () => {
    expect(setAnswer(row('a', 'c1'), 'c2').answer).toBe('c2');
  });
});
