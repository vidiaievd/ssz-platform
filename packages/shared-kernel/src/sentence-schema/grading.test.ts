// BEHAVIOR.md, "Student · checking" — the case table, one test per row, plus the field
// marks and the two derived helpers the runner leans on.

import { describe, expect, it } from 'vitest';

import { chunk, MAIN_FIELDS, row } from './fixtures.test-support.js';
import {
  expectedIn,
  grade,
  initialPlacement,
  keepCorrect,
  scoreRow,
  solution,
  type Placement,
} from './grading.js';
import { DEFAULT_SETTINGS, type Settings } from './model.js';

const strict: Settings = { ...DEFAULT_SETTINGS, order: 'strict' };
const loose: Settings = { ...DEFAULT_SETTINGS, order: 'loose' };

/** Every chunk where the key says it goes. */
const correct: Placement = { F: ['c1'], v: ['c2'], n: ['c3'], a: ['c4'], V: ['c5'], N: ['c6'] };

describe('grade — item marks', () => {
  it('marks a chunk in its own field ok', () => {
    const marks = grade(row(), MAIN_FIELDS, correct, strict);

    expect(Object.values(marks.byItem).every((m) => m === 'ok')).toBe(true);
    expect(marks.solved).toBe(true);
    expect(marks.wrong).toBe(0);
  });

  it('accepts an alternative field named on the chunk', () => {
    const adverbial = { id: 'A', short: 'A', label: 'Adverbial', hint: '', optional: true };
    const fronted = row({
      chunks: [
        chunk('c1', 'I morgen', 'F', ['A']),
        chunk('c2', 'skal', 'v'),
        chunk('c3', 'jeg', 'n'),
        chunk('c4', 'ikke', 'a'),
        chunk('c5', 'lese', 'V'),
        chunk('c6', 'boka', 'N'),
      ],
    });
    const marks = grade(fronted, [...MAIN_FIELDS, adverbial], { ...correct, F: [], A: ['c1'] }, strict);

    expect(marks.byItem['c1']).toBe('ok');
    expect(marks.solved).toBe(true);
  });

  it('marks a chunk in a field the key does not accept', () => {
    const marks = grade(row(), MAIN_FIELDS, { ...correct, F: [], N: ['c6', 'c1'] }, strict);

    expect(marks.byItem['c1']).toBe('field');
    expect(marks.solved).toBe(false);
  });

  it('marks a distractor extra, whichever field it lands in', () => {
    const withExtra = row({ extras: [{ id: 'x1', text: 'blir' }] });
    const marks = grade(withExtra, MAIN_FIELDS, { ...correct, v: ['c2', 'x1'] }, strict);

    expect(marks.byItem['x1']).toBe('extra');
    expect(marks.byField['v']).toBe('bad');
  });

  it('marks an id belonging to no chunk at all extra', () => {
    const marks = grade(row(), MAIN_FIELDS, { ...correct, N: ['c6', 'ghost'] }, strict);

    expect(marks.byItem['ghost']).toBe('extra');
  });
});

describe('grade — order inside a field', () => {
  // Two chunks that share one field, in sentence order c5 then c6.
  const shared = row({
    chunks: [
      chunk('c1', 'I morgen', 'F'),
      chunk('c2', 'skal', 'v'),
      chunk('c3', 'jeg', 'n'),
      chunk('c4', 'ikke', 'a'),
      chunk('c5', 'lese', 'N'),
      chunk('c6', 'boka', 'N'),
    ],
  });
  const stacked: Placement = { F: ['c1'], v: ['c2'], n: ['c3'], a: ['c4'], N: ['c6', 'c5'] };

  it('marks the later chunk stacked first as out of order under strict', () => {
    const marks = grade(shared, MAIN_FIELDS, stacked, strict);

    expect(marks.byItem['c6']).toBe('ok');
    expect(marks.byItem['c5']).toBe('order');
    expect(marks.byField['N']).toBe('bad');
  });

  it('accepts the same board under loose', () => {
    const marks = grade(shared, MAIN_FIELDS, stacked, loose);

    expect(marks.byItem['c5']).toBe('ok');
    expect(marks.solved).toBe(true);
  });

  it('judges order by the sentence index, not by the field list', () => {
    const inOrder: Placement = { F: ['c1'], v: ['c2'], n: ['c3'], a: ['c4'], N: ['c5', 'c6'] };

    expect(grade(shared, MAIN_FIELDS, inOrder, strict).solved).toBe(true);
  });
});

describe('grade — field marks', () => {
  it('marks a required field left empty bad', () => {
    // `v` is the only non-optional field of the fixture.
    const marks = grade(row(), MAIN_FIELDS, { ...correct, v: [] }, strict);

    expect(marks.byField['v']).toBe('bad');
    expect(marks.wrong).toBe(1);
    expect(marks.solved).toBe(false);
  });

  it('leaves an optional field that should be empty unmarked', () => {
    const short = row({
      text: 'Jeg leser',
      chunks: [chunk('c1', 'Jeg', 'n'), chunk('c2', 'leser', 'v')],
    });
    const marks = grade(short, MAIN_FIELDS, { n: ['c1'], v: ['c2'] }, strict);

    expect(marks.byField['F']).toBe('empty');
    expect(marks.byField['N']).toBe('empty');
    expect(marks.solved).toBe(true);
  });

  it('marks an optional field bad when the key puts a chunk there and the student did not', () => {
    const marks = grade(row(), MAIN_FIELDS, { ...correct, N: [] }, strict);

    expect(marks.byField['N']).toBe('bad');
  });

  it('does not call a half-filled board solved', () => {
    const marks = grade(row(), MAIN_FIELDS, { F: ['c1'], v: ['c2'] }, strict);

    expect(marks.solved).toBe(false);
    expect(marks.placed).toBe(2);
    expect(marks.total).toBe(6);
  });
});

describe('solution, initialPlacement, keepCorrect', () => {
  it('reads the board the key describes', () => {
    expect(solution(row())).toEqual(correct);
  });

  it('skips unplaced chunks rather than inventing a field for them', () => {
    const half = row({ chunks: [chunk('c1', 'Jeg', 'n'), chunk('c2', 'leser', null)] });

    expect(solution(half)).toEqual({ n: ['c1'] });
  });

  it('places the first chunk under prefill: first, and nothing under none', () => {
    expect(initialPlacement(row(), 'first')).toEqual({ F: ['c1'] });
    expect(initialPlacement(row(), 'none')).toEqual({});
  });

  it('keeps only the correct items on a retry', () => {
    const placement: Placement = { ...correct, F: [], N: ['c6', 'c1'] };
    const marks = grade(row(), MAIN_FIELDS, placement, strict);

    expect(keepCorrect(placement, marks)).toEqual({ v: ['c2'], n: ['c3'], a: ['c4'], V: ['c5'], N: ['c6'] });
  });
});

describe('expectedIn and scoreRow', () => {
  it('counts only the chunks whose own field this is, never the alternatives', () => {
    const fronted = row({ chunks: [chunk('c1', 'I morgen', 'F', ['A'])] });

    expect(expectedIn(fronted, 'F')).toBe(1);
    expect(expectedIn(fronted, 'A')).toBe(0);
  });

  it('scores a solved row 100 and an empty board 0', () => {
    expect(scoreRow(row(), MAIN_FIELDS, grade(row(), MAIN_FIELDS, correct, strict))).toBe(100);
    expect(scoreRow(row(), MAIN_FIELDS, grade(row(), MAIN_FIELDS, {}, strict))).toBe(0);
  });

  it('ignores fields the key has no opinion about', () => {
    const short = row({ text: 'Jeg leser', chunks: [chunk('c1', 'Jeg', 'n'), chunk('c2', 'leser', 'v')] });
    const marks = grade(short, MAIN_FIELDS, { n: ['c1'], v: ['c2'] }, strict);

    // Four fields stay empty and uncounted; two are right, so this is 100, not 33.
    expect(scoreRow(short, MAIN_FIELDS, marks)).toBe(100);
  });

  it('gives partial credit per field', () => {
    const marks = grade(row(), MAIN_FIELDS, { ...correct, F: [], N: ['c6', 'c1'] }, strict);

    // Six judged fields, four of them right.
    expect(scoreRow(row(), MAIN_FIELDS, marks)).toBe(67);
  });
});
