// BEHAVIOR §6 (the runner state machine) and §7 (the scoring contract).

import { describe, expect, it } from 'vitest';

import { allAnswered, carryOver, check, remaining } from './grading.js';
import type { Answers } from './grading.js';
import { col, exercise, row, settings } from './fixtures.test-support.js';

const right = col('Riktig');
const wrong = col('Galt');

/** Four statements: two Riktig, two Galt, each explained and quoted. */
const table = (over = {}) =>
  exercise({
    columns: [right, wrong],
    rows: [
      row('a', right.id, { why: 'because a', quote: 'line a' }),
      row('b', wrong.id, { why: 'because b' }),
      row('c', right.id, { why: 'because c' }),
      row('d', wrong.id),
    ],
    ...over,
  });

const allRight = (): Answers => ({ r: right.id });

function answersFor(ex: ReturnType<typeof table>, correctCount: number): Answers {
  const out: Record<string, string> = {};
  ex.rows.forEach((r, i) => {
    out[r.id] = i < correctCount ? r.answer! : r.answer === right.id ? wrong.id : right.id;
  });
  return out;
}

describe('scoring contract', () => {
  it('scores the share of correct rows, rounded', () => {
    const ex = table();
    const result = check({ ex, answers: answersFor(ex, 3), attempt: 1 });
    expect(result).toMatchObject({ correct: 3, total: 4, pct: 75 });
  });

  it('passes at exactly the threshold — `>=`, never `>`', () => {
    const ex = table({ settings: settings({ passThreshold: 75 }) });
    expect(check({ ex, answers: answersFor(ex, 3), attempt: 1 }).passed).toBe(true);

    const higher = table({ settings: settings({ passThreshold: 76 }) });
    expect(check({ ex: higher, answers: answersFor(higher, 3), attempt: 1 }).passed).toBe(false);
  });

  it('counts an unanswered row as wrong', () => {
    const ex = table();
    const answers = answersFor(ex, 4);
    delete (answers as Record<string, string>)[ex.rows[0]!.id];
    const result = check({ ex, answers, attempt: 1 });
    expect(result.correct).toBe(3);
    expect(result.rows[0]).toMatchObject({ answer: null, correct: false });
  });

  it('never counts a row that readyRows drops', () => {
    const ex = table({ rows: [row('a', right.id), row('unanswered'), row('', right.id)] });
    expect(check({ ex, answers: {}, attempt: 1 }).total).toBe(1);
  });

  it('scores zero on an empty table rather than dividing by zero', () => {
    const ex = table({ rows: [] });
    expect(check({ ex, answers: {}, attempt: 1 })).toMatchObject({ pct: 0, total: 0 });
  });
});

describe('closing the table', () => {
  it('closes when every row is right — R11', () => {
    const ex = table();
    expect(check({ ex, answers: answersFor(ex, 4), attempt: 1 }).closed).toBe(true);
  });

  it('stays open with wrong rows and an attempt left — R12', () => {
    const ex = table();
    const result = check({ ex, answers: answersFor(ex, 2), attempt: 1 });
    expect(result).toMatchObject({ closed: false, attemptsLeft: 1 });
  });

  it('closes when the budget is spent — R13', () => {
    const ex = table();
    const result = check({ ex, answers: answersFor(ex, 2), attempt: 2 });
    expect(result).toMatchObject({ closed: true, attemptsLeft: 0 });
  });

  it('closes on «Vis fasit» without spending an attempt — R14', () => {
    const ex = table();
    const result = check({ ex, answers: answersFor(ex, 2), attempt: 1, reveal: true });
    expect(result).toMatchObject({ closed: true, attemptsLeft: 1 });
  });

  it('gives one attempt under retry:none', () => {
    const ex = table({ settings: settings({ retry: 'none' }) });
    expect(check({ ex, answers: answersFor(ex, 2), attempt: 1 }).closed).toBe(true);
  });
});

describe('the key', () => {
  it('is withheld while the table is open, however wrong the row is', () => {
    const ex = table();
    const result = check({ ex, answers: answersFor(ex, 2), attempt: 1 });
    expect(result.closed).toBe(false);
    expect(result.rows.every((r) => r.keyColumnId === undefined)).toBe(true);
  });

  it('arrives once the table closes', () => {
    const ex = table();
    const result = check({ ex, answers: answersFor(ex, 2), attempt: 2 });
    expect(result.rows[3]!.keyColumnId).toBe(wrong.id);
  });

  it('stays withheld when revealKey is off, even spent', () => {
    const ex = table({ settings: settings({ revealKey: false }) });
    const result = check({ ex, answers: answersFor(ex, 2), attempt: 2 });
    expect(result.closed).toBe(true);
    expect(result.rows.every((r) => r.keyColumnId === undefined)).toBe(true);
  });
});

describe('explanations', () => {
  it('shows them on wrong rows only under showWhy:wrong', () => {
    const ex = table();
    const result = check({ ex, answers: answersFor(ex, 2), attempt: 1 });
    expect(result.rows[0]!.why).toBeUndefined();
    expect(result.rows[2]!.why).toBe('because c');
  });

  it('shows them everywhere under showWhy:always', () => {
    const ex = table({ settings: settings({ showWhy: 'always' }) });
    const result = check({ ex, answers: answersFor(ex, 4), attempt: 1 });
    expect(result.rows[0]!.why).toBe('because a');
  });

  it('shows none under showWhy:never', () => {
    const ex = table({ settings: settings({ showWhy: 'never' }) });
    const result = check({ ex, answers: answersFor(ex, 0), attempt: 2 });
    expect(result.rows.every((r) => r.why === undefined && r.quote === undefined)).toBe(true);
  });

  it('sends nothing for a row with neither a why nor a quote', () => {
    // IMPLEMENTATION.md checklist: "A row whose `why` and `quote` are both empty renders no
    // explanation block even when `showWhy: 'always'`."
    const ex = table({ settings: settings({ showWhy: 'always' }) });
    const result = check({ ex, answers: answersFor(ex, 4), attempt: 1 });
    expect(result.rows[3]).not.toHaveProperty('why');
    expect(result.rows[3]).not.toHaveProperty('quote');
  });

  it('carries the quote alongside the why', () => {
    const ex = table({ settings: settings({ showWhy: 'always' }) });
    const result = check({ ex, answers: answersFor(ex, 4), attempt: 1 });
    expect(result.rows[0]!.quote).toBe('line a');
  });
});

describe('locking', () => {
  it('freezes the correct rows on a check — R8', () => {
    const ex = table();
    const result = check({ ex, answers: answersFor(ex, 2), attempt: 1 });
    expect(result.locked).toEqual([ex.rows[0]!.id, ex.rows[1]!.id]);
  });

  it('accumulates across checks', () => {
    const ex = table({ settings: settings({ retry: 'unlimited' }) });
    const first = check({ ex, answers: answersFor(ex, 2), attempt: 1 });
    const second = check({ ex, answers: answersFor(ex, 3), attempt: 2, locked: first.locked });
    expect(second.locked).toHaveLength(3);
  });

  it('freezes nothing when lockCorrect is off', () => {
    const ex = table({ settings: settings({ lockCorrect: false }) });
    expect(check({ ex, answers: answersFor(ex, 2), attempt: 1 }).locked).toEqual([]);
  });
});

describe('carryOver', () => {
  it('keeps the correct answers and clears the wrong ones — R15', () => {
    const ex = table();
    const kept = carryOver(ex, answersFor(ex, 2));
    expect(Object.keys(kept)).toEqual([ex.rows[0]!.id, ex.rows[1]!.id]);
  });

  it('clears everything when lockCorrect is off', () => {
    const ex = table({ settings: settings({ lockCorrect: false }) });
    expect(carryOver(ex, answersFor(ex, 4))).toEqual({});
  });

  it('never keeps an answer that merely claims to be right', () => {
    // The client sends the picks; the key is the server's. A payload marking every row as
    // correct carries nothing across.
    const ex = table();
    const lies: Answers = Object.fromEntries(ex.rows.map((r) => [r.id, right.id]));
    expect(Object.keys(carryOver(ex, lies))).toEqual([ex.rows[0]!.id, ex.rows[2]!.id]);
  });
});

describe('the check button', () => {
  it('is enabled only when every ready row is answered — R4/R5', () => {
    const ex = table();
    expect(allAnswered(ex, {})).toBe(false);
    expect(remaining(ex, {})).toBe(4);

    const partial = answersFor(ex, 4);
    delete (partial as Record<string, string>)[ex.rows[0]!.id];
    expect(allAnswered(ex, partial)).toBe(false);
    expect(remaining(ex, partial)).toBe(1);

    expect(allAnswered(ex, answersFor(ex, 4))).toBe(true);
    expect(remaining(ex, answersFor(ex, 4))).toBe(0);
  });

  it('is disabled on a table with nothing to answer — R1', () => {
    expect(allAnswered(table({ rows: [] }), allRight())).toBe(false);
  });
});
