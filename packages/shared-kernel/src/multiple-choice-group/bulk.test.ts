// README §"Bulk paste" and BEHAVIOR S2.11.

import { describe, expect, it } from 'vitest';

import { appendRows, parseBulk } from './bulk.js';
import { col, exercise, row } from './fixtures.test-support.js';

const columns = [col('Riktig', 'R'), col('Galt', 'G'), col('Står ikke i teksten', '?')];

describe('parseBulk', () => {
  it('resolves a short code', () => {
    const [parsed] = parseBulk(columns, 'Han kom for sent. | R');
    expect(parsed).toMatchObject({ text: 'Han kom for sent.', answer: columns[0]!.id });
  });

  it('resolves a full label, case-insensitively', () => {
    const [parsed] = parseBulk(columns, 'Han kom. | galt');
    expect(parsed!.answer).toBe(columns[1]!.id);
  });

  it('resolves a 1-based column number', () => {
    expect(parseBulk(columns, 'Han kom. | 3')[0]!.answer).toBe(columns[2]!.id);
    expect(parseBulk(columns, 'Han kom. | 4')[0]!.answer).toBeNull();
  });

  it('leaves an unmarked line unanswered rather than guessing', () => {
    const [parsed] = parseBulk(columns, 'Han kom for sent.');
    expect(parsed).toMatchObject({ text: 'Han kom for sent.', answer: null });
  });

  it('leaves an unrecognised marker unanswered, keeping it out of the statement', () => {
    const [parsed] = parseBulk(columns, 'Han kom. | maybe');
    expect(parsed).toMatchObject({ text: 'Han kom.', answer: null });
  });

  it('keeps a pipe inside the statement', () => {
    const [parsed] = parseBulk(columns, 'Velg A | B | R');
    expect(parsed).toMatchObject({ text: 'Velg A | B', answer: columns[0]!.id });
  });

  it('drops blank lines and trims', () => {
    const parsed = parseBulk(columns, '  a | R \n\n\n  b | G  \n');
    expect(parsed.map((r) => r.text)).toEqual(['a', 'b']);
  });

  it('gives every parsed row its own id', () => {
    const parsed = parseBulk(columns, 'a | R\nb | G');
    expect(parsed[0]!.id).not.toBe(parsed[1]!.id);
  });
});

describe('appendRows', () => {
  it('replaces the empty rows rather than appending after them — S2.11', () => {
    const ex = exercise({ rows: [row('kept', 'c1'), row(''), row('   ')] });
    const next = appendRows(ex, parseBulk(columns, 'a | R\nb | G'));
    expect(next.rows.map((r) => r.text)).toEqual(['kept', 'a', 'b']);
  });
});
