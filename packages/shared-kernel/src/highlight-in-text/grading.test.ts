// SPEC_data_model §6, SPEC_api_contract §3–4, DECISIONS §4 and §6; the attempt by question —
// decision Q1-A of plan 67.

import { describe, expect, it } from 'vitest';

import type { CharRange } from './coordinates.js';
import { ceilingCause } from './derive.js';
import { counted, exercise, markAt, PRETERITE, TIME } from './fixtures.test-support.js';
import type { CheckInput, CheckResult, QuestionState } from './grading.js';
import { check } from './grading.js';
import type { HighlightInTextContent, Settings } from './model.js';

const words = (ex: HighlightInTextContent, ...ws: string[]): CharRange[] => ws.map((w) => markAt(ex.text, w));
const ks = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `w${from + i}`);

function ok(input: CheckInput): CheckResult {
  const r = check(input);
  if (!r.ok) throw new Error(`refused: ${r.code}`);
  return r.result;
}

describe('the score of one check', () => {
  it('AC-G1: 9 keys, 7 exact, nothing extra, half → 78%', () => {
    const ex = counted(30, 9);
    const r = ok({ ex, questionId: 'q', marks: words(ex, ...ks(1, 7)) });
    expect(r).toMatchObject({ exact: 7, near: 0, miss: 2, fp: 0, total: 9, pct: 78, passed: true });
  });

  it('AC-G2: 9 keys, 7 exact, 4 extra, half → 56%', () => {
    const ex = counted(30, 9);
    const r = ok({ ex, questionId: 'q', marks: words(ex, ...ks(1, 7), ...ks(20, 23)) });
    expect(r).toMatchObject({ exact: 7, fp: 4, pct: 56, passed: false });
  });

  it('AC-G3: the same with the penalty off → 78%, and the ceiling is lowered', () => {
    const ex = counted(30, 9, { penalty: 'off' });
    const r = ok({ ex, questionId: 'q', marks: words(ex, ...ks(1, 7), ...ks(20, 23)) });
    expect(r.pct).toBe(78);
    expect(ceilingCause(ex)).toBe('penalty');
  });

  it('a full penalty costs a whole mark per extra', () => {
    const ex = counted(30, 9, { penalty: 'full' });
    expect(ok({ ex, questionId: 'q', marks: words(ex, ...ks(1, 7), ...ks(20, 23)) }).pct).toBe(33);
  });

  it('AC-G4: marking every word scores 0 and fails', () => {
    const ex = counted(30, 9);
    const r = ok({ ex, questionId: 'q', marks: words(ex, ...ks(1, 30)) });
    expect(r).toMatchObject({ exact: 9, fp: 21, pct: 0, passed: false });
  });

  it('AC-G4: one mark over the whole passage is no better', () => {
    const ex = counted(30, 9);
    const r = ok({ ex, questionId: 'q', marks: [{ start: 0, end: ex.text.length }] });
    expect(r).toMatchObject({ exact: 0, near: 1, miss: 8, fp: 0, pct: 0, passed: false });
  });

  it('AC-G5: a mark over the key with other boundaries is neither right nor extra, and carries the key edge', () => {
    const ex = exercise();
    const mark = markAt(ex.text, 'siste dagen');
    const r = ok({ ex, questionId: 'q2', marks: [mark] });
    expect(r).toMatchObject({ exact: 0, near: 1, fp: 0, miss: 5 });
    const key = markAt(ex.text, 'den siste dagen');
    expect(r.cells).toEqual([{ ...mark, state: 'near', keyStart: key.start, keyEnd: key.end }]);
  });

  it('AC-G6: overlapping student marks are merged before grading', () => {
    const ex = exercise();
    const r = ok({ ex, questionId: 'q2', marks: [markAt(ex.text, 'hele'), markAt(ex.text, 'hele uka')] });
    expect(r).toMatchObject({ exact: 1, fp: 0 });
  });

  it('AC-G7: a mark covering no token refuses the submission', () => {
    const ex = exercise();
    const comma = ex.text.indexOf(',');
    expect(check({ ex, questionId: 'q1', marks: [{ start: comma, end: comma + 1 }] })).toEqual({
      ok: false,
      code: 'HT_MARK_UNSNAPPABLE',
    });
  });

  it('passes exactly on the threshold', () => {
    const ex = counted(30, 10, { threshold: 70 });
    expect(ok({ ex, questionId: 'q', marks: words(ex, ...ks(1, 7)) }).passed).toBe(true);
    expect(ok({ ex, questionId: 'q', marks: words(ex, ...ks(1, 6)) }).passed).toBe(false);
  });
});

describe('what a check returns', () => {
  const ex = exercise();
  const half = PRETERITE.slice(0, 4);

  it('AC-S5: a failed check holds no position of a missed span', () => {
    const marks = words(ex, ...half, 'bor');
    const r = ok({ ex, questionId: 'q1', marks });
    expect(r.miss).toBe(4);
    const sent = new Set(marks.map((m) => `${m.start}:${m.end}`));
    for (const c of r.cells) expect(sent.has(`${c.start}:${c.end}`)).toBe(true);
    expect(r.key).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('why');
  });

  it('hints come only for the failure that happened, only when failed and on', () => {
    const missed = ok({ ex, questionId: 'q1', marks: words(ex, ...half) });
    expect(missed.missHint).toBe('q1 miss');
    expect(missed.fpHint).toBeUndefined();

    const extra = ok({ ex, questionId: 'q1', marks: words(ex, ...PRETERITE, 'bor') });
    expect(extra.passed).toBe(true);
    expect(extra.fpHint).toBeUndefined();

    const both = ok({ ex, questionId: 'q1', marks: words(ex, ...half, 'bor', 'kommer') });
    expect(both).toMatchObject({ missHint: 'q1 miss', fpHint: 'q1 fp' });

    const off = { ...ex, settings: { ...ex.settings, hints: false } };
    const silent = ok({ ex: off, questionId: 'q1', marks: words(ex, ...half, 'bor') });
    expect(silent.missHint).toBeUndefined();
    expect(silent.fpHint).toBeUndefined();
  });

  it('refuses a question that is not ready or not there', () => {
    const noPrompt = { ...ex, questions: ex.questions.map((q) => (q.id === 'q2' ? { ...q, prompt: '' } : q)) };
    expect(check({ ex: noPrompt, questionId: 'q2', marks: [] })).toEqual({ ok: false, code: 'HT_QUESTION_UNKNOWN' });
    expect(check({ ex, questionId: 'zz', marks: [] })).toEqual({ ok: false, code: 'HT_QUESTION_UNKNOWN' });
  });
});

describe('the attempt, question by question', () => {
  const run = (settings: Partial<Settings> = {}) => {
    const ex = { ...exercise(), settings: { ...exercise().settings, ...settings } };
    let questions: QuestionState[] | undefined;
    return {
      ex,
      submit(questionId: string, marks: CharRange[], reveal = false) {
        const r = check({ ex, questionId, marks, reveal, ...(questions ? { questions } : {}) });
        if (r.ok) questions = r.result.questions;
        return r;
      },
    };
  };
  const allVerbs = (ex: HighlightInTextContent) => words(ex, ...PRETERITE);
  const allTimes = (ex: HighlightInTextContent) => words(ex, ...TIME);

  it('a pass closes the question; it refuses everything after (AC-S9)', () => {
    const a = run();
    const first = a.submit('q1', allVerbs(a.ex));
    expect(first.ok && first.result).toMatchObject({ passed: true, closed: true, complete: false, completedNow: false });
    expect(a.submit('q1', allVerbs(a.ex))).toEqual({ ok: false, code: 'HT_QUESTION_CLOSED' });
    expect(a.submit('q1', [], true)).toEqual({ ok: false, code: 'HT_QUESTION_CLOSED' });
  });

  it('the first check is what counts; a later pass does not raise it', () => {
    const a = run();
    a.submit('q1', words(a.ex, 'reiste', 'tok'));
    const second = a.submit('q1', allVerbs(a.ex));
    expect(second.ok && second.result.questions[0]).toMatchObject({ checks: 2, firstScore: 0.25, passed: true });
  });

  it('the budget is per question; out of checks closes it but still allows the key', () => {
    const a = run({ attempts: 2 });
    const one = a.submit('q1', words(a.ex, 'reiste'));
    expect(one.ok && one.result).toMatchObject({ attempt: 1, checksLeft: 1, closed: false });
    const two = a.submit('q1', words(a.ex, 'reiste'));
    expect(two.ok && two.result).toMatchObject({ attempt: 2, checksLeft: 0, closed: true });
    expect(a.submit('q1', words(a.ex, 'reiste'))).toEqual({ ok: false, code: 'HT_QUESTION_CLOSED' });
    const key = a.submit('q1', [], true);
    expect(key.ok && key.result.revealed).toBe(true);
    // Question 2 has its own budget.
    const other = a.submit('q2', words(a.ex, 'hele uka'));
    expect(other.ok && other.result).toMatchObject({ attempt: 1, checksLeft: 1 });
  });

  it('a reveal needs a failed check and revealKey, and spends no check', () => {
    expect(run().submit('q1', [], true)).toEqual({ ok: false, code: 'HT_REVEAL_NOT_ALLOWED' });

    const closed = run({ revealKey: false });
    closed.submit('q1', words(closed.ex, 'reiste'));
    expect(closed.submit('q1', [], true)).toEqual({ ok: false, code: 'HT_REVEAL_NOT_ALLOWED' });

    const a = run({ attempts: 3 });
    a.submit('q1', words(a.ex, 'reiste'));
    const r = a.submit('q1', [], true);
    expect(r.ok && r.result).toMatchObject({ revealed: true, closed: true, passed: false, attempt: 1, checksLeft: 2, cells: [] });
  });

  it('AC-S9: the reveal returns every key span, numbered in text order, with its reason', () => {
    const a = run();
    a.submit('q1', words(a.ex, 'reiste'));
    const r = a.submit('q1', [], true);
    if (!r.ok) throw new Error(r.code);
    expect(r.result.key?.map((k) => a.ex.text.slice(k.start, k.end))).toEqual(PRETERITE);
    expect(r.result.key?.map((k) => k.n)).toEqual(PRETERITE.map((_, i) => i + 1));
    expect(r.result.key?.[0]?.why).toBe('reiste — why');
    expect(a.submit('q1', words(a.ex, 'reiste'))).toEqual({ ok: false, code: 'HT_QUESTION_CLOSED' });
  });

  it('the attempt completes on the submit that closes its last question, once', () => {
    const a = run();
    a.submit('q1', words(a.ex, ...PRETERITE.slice(0, 4)));
    const q2 = a.submit('q2', allTimes(a.ex));
    expect(q2.ok && q2.result).toMatchObject({ complete: false, completedNow: false });
    const q1 = a.submit('q1', allVerbs(a.ex));
    expect(q1.ok && q1.result).toMatchObject({ complete: true, completedNow: true });
    // Mean of the first checks: q1 4/8 = 50%, q2 6/6 = 100%.
    expect(q1.ok && q1.result).toMatchObject({ attemptPct: 75, attemptPassed: true });
  });

  it('a reveal after completion does not complete the attempt again', () => {
    const a = run({ attempts: 1 });
    a.submit('q2', allTimes(a.ex));
    const last = a.submit('q1', words(a.ex, 'reiste'));
    expect(last.ok && last.result.completedNow).toBe(true);
    const key = a.submit('q1', [], true);
    expect(key.ok && key.result).toMatchObject({ complete: true, completedNow: false });
  });
});
