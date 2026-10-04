// The whole table at once (plan 69 §3.4–3.6): first-check score, the bank's false-positive
// penalty, locks, the budget and the key by `revealKey`.

import { describe, expect, it } from 'vitest';

import { setCellMode, updateInput, updateSettings } from './edits.js';
import { ALL_RIGHT, GRADING_FIXTURE, sampleContent } from './fixture.js';
import { check } from './grading.js';

describe('the shared fixture (IT-M2…M6, IT-X6)', () => {
  for (const c of GRADING_FIXTURE) {
    it(c.name, () => {
      const ex = updateInput(sampleContent(), { mode: c.input });
      const r = check({ ex, answers: c.answers, attempt: 1 });
      expect({
        correct: r.correct,
        falsePositives: r.falsePositives,
        pct: r.pct,
        passed: r.passed,
      }).toEqual({
        correct: c.expect.correct,
        falsePositives: c.expect.falsePositives,
        pct: c.expect.pct,
        passed: c.expect.passed,
      });
      for (const [key, want] of Object.entries(c.expect.cells)) {
        const got = r.cells.find((cell) => cell.key === key);
        expect(got?.ok, key).toBe(want.ok);
        expect(got?.near, key).toBe(want.near);
      }
    });
  }
});

describe('a check', () => {
  it('IT-R3: the first check counts every graded cell, an unanswered one as wrong', () => {
    const r = check({ ex: sampleContent(), answers: { 'r1:defSg': 'jobben' }, attempt: 1 });
    expect(r).toMatchObject({ total: 12, correct: 1, pct: 8, passed: false });
  });

  it('IT-M7: a row verdict is recorded at every check', () => {
    const r = check({
      ex: sampleContent(),
      answers: { ...ALL_RIGHT, 'r2:defSg': '', 'r2:defPl': 'x' },
      attempt: 1,
    });
    expect(r.rows).toEqual([
      { rowId: 'r1', asked: 3, ok: 3, firstOk: 3 },
      { rowId: 'r2', asked: 3, ok: 1, firstOk: 1 },
      { rowId: 'r3', asked: 3, ok: 3, firstOk: 3 },
      { rowId: 'r4', asked: 3, ok: 3, firstOk: 3 },
    ]);
  });

  it('IT-R7: a wrong cell carries the author’s reason, a right one does not', () => {
    const r = check({
      ex: sampleContent(),
      answers: { ...ALL_RIGHT, 'r2:indefPl': 'boker' },
      attempt: 1,
    });
    const wrong = r.cells.find((c) => c.key === 'r2:indefPl');
    expect(wrong).toMatchObject({ ok: false, near: 'diacritic', why: 'Omlyd i flertall: o → ø.' });
    expect(r.cells.find((c) => c.key === 'r1:defSg')?.why).toBeUndefined();
  });

  it('closes when every cell is right', () => {
    const r = check({ ex: sampleContent(), answers: ALL_RIGHT, attempt: 1 });
    expect(r).toMatchObject({ closed: true, checksLeft: 1, correctNow: 12 });
  });

  it('a bank form not in the bank reads as empty', () => {
    const ex = updateInput(sampleContent(), { mode: 'bank' });
    const r = check({ ex, answers: { ...ALL_RIGHT, 'r1:defSg': 'katten' }, attempt: 1 });
    expect(r.cells.find((c) => c.key === 'r1:defSg')).toMatchObject({ value: '', ok: false });
    expect(r.falsePositives).toBe(0);
  });

  it('a cell switched to given is no longer graded', () => {
    const ex = setCellMode(sampleContent(), 'r1', 'defSg', 'prefill');
    expect(check({ ex, answers: ALL_RIGHT, attempt: 1 }).total).toBe(11);
  });
});

describe('the retry', () => {
  const first = check({
    ex: sampleContent(),
    answers: { ...ALL_RIGHT, 'r2:indefPl': 'boker', 'r4:defPl': '' },
    attempt: 1,
  });

  it('IT-R4: right cells lock, wrong ones come back', () => {
    expect(first.closed).toBe(false);
    expect(first.locked).toHaveLength(10);
    expect(first.locked).not.toContain('r2:indefPl');
  });

  it('IT-R5: a second check changes what is shown, never the score', () => {
    const second = check({
      ex: sampleContent(),
      answers: ALL_RIGHT,
      attempt: 2,
      locked: first.locked,
      firstValues: first.firstValues,
    });
    expect(second).toMatchObject({ correct: 10, correctNow: 12, pct: 83, closed: true });
    expect(second.cells.find((c) => c.key === 'r2:indefPl')).toMatchObject({
      ok: true,
      firstOk: false,
    });
  });

  it('a locked cell cannot be broken by the client', () => {
    const second = check({
      ex: sampleContent(),
      answers: { ...ALL_RIGHT, 'r1:defSg': 'tull' },
      attempt: 2,
      locked: first.locked,
      firstValues: first.firstValues,
    });
    expect(second.cells.find((c) => c.key === 'r1:defSg')).toMatchObject({
      ok: true,
      value: 'jobben',
    });
  });

  it('the budget closes the table', () => {
    const second = check({
      ex: sampleContent(),
      answers: { ...ALL_RIGHT, 'r2:indefPl': 'boker' },
      attempt: 2,
      locked: first.locked,
      firstValues: first.firstValues,
    });
    expect(second).toMatchObject({ closed: true, checksLeft: 0 });
  });
});

describe('IT-R6: the key by revealKey', () => {
  const wrong = { ...ALL_RIGHT, 'r2:indefPl': 'boker' };
  const keyOf = (r: ReturnType<typeof check>) =>
    r.cells.find((c) => c.key === 'r2:indefPl')?.correct;

  it('afterLast: only once the budget is spent', () => {
    const ex = sampleContent();
    expect(keyOf(check({ ex, answers: wrong, attempt: 1 }))).toBeUndefined();
    expect(keyOf(check({ ex, answers: wrong, attempt: 2 }))).toBe('bøker');
  });

  it('afterFirst: after any check', () => {
    const ex = updateSettings(sampleContent(), { revealKey: 'afterFirst' });
    expect(keyOf(check({ ex, answers: wrong, attempt: 1 }))).toBe('bøker');
  });

  it('never: never', () => {
    const ex = updateSettings(sampleContent(), { revealKey: 'never' });
    expect(keyOf(check({ ex, answers: wrong, attempt: 2 }))).toBeUndefined();
  });

  it('a right cell never carries its key', () => {
    const ex = updateSettings(sampleContent(), { revealKey: 'afterFirst' });
    expect(
      check({ ex, answers: wrong, attempt: 1 }).cells.find((c) => c.key === 'r1:defSg')?.correct,
    ).toBeUndefined();
  });
});

describe('a graded delivery (Q8-A of plan 67)', () => {
  it('one check, and no key', () => {
    const ex = updateSettings(sampleContent(), { revealKey: 'afterFirst', attempts: 4 });
    const r = check({
      ex,
      answers: { ...ALL_RIGHT, 'r2:indefPl': 'boker' },
      attempt: 1,
      graded: true,
    });
    expect(r).toMatchObject({ closed: true, checksLeft: 0 });
    expect(r.cells.find((c) => c.key === 'r2:indefPl')?.correct).toBeUndefined();
  });
});
