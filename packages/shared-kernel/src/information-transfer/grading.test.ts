// Per-cell verdicts (DECISIONS §2) and the whole blank per check (plan 73 §3.6).

import { describe, expect, it } from 'vitest';

import { setAnswering, setExpected, setField, setGrading, setScoring } from './edits.js';
import { SAMPLE_ANSWERS, SAMPLE_FIELD_IDS, sampleContent } from './fixture.js';
import { check, gradeCell, keyPasses } from './grading.js';
import { DEFAULT_GRADING } from './model.js';
import { packFor } from './packs/index.js';

const nb = packFor('nb');
const [DATO, KLOKKE, ROM, PRIS, TLF, NAVN] = SAMPLE_FIELD_IDS;
const fieldOf = (id: string) => {
  const f = sampleContent().fields.find((x) => x.id === id);
  if (!f) throw new Error(id);
  return f;
};

describe('gradeCell — six verdicts (INF-M7)', () => {
  it('matches the prototype on the sample answers', () => {
    const ex = sampleContent();
    const got = ex.fields.map((f) => gradeCell(f, SAMPLE_ANSWERS[f.id] ?? '', ex.grading, nb));
    expect(got).toEqual([
      { verdict: 'format', canonical: '3. mars' },
      { verdict: 'format', canonical: '17:30' },
      { verdict: 'wrong', canonical: '204' },
      // The prototype said `unread` here: its currency strip cut «kroner» (plan 73 §4.2).
      { verdict: 'format', canonical: '450' },
      { verdict: 'format', canonical: '22 45 67 89' },
      { verdict: 'ok' },
    ]);
  });

  it('ok is an author wording, format another notation of the same fact', () => {
    expect(gradeCell(fieldOf(KLOKKE), '17:30', DEFAULT_GRADING, nb).verdict).toBe('ok');
    expect(gradeCell(fieldOf(KLOKKE), 'halv seks', DEFAULT_GRADING, nb).verdict).toBe('format');
  });

  it('unread when a format cell is not a fact at all', () => {
    expect(gradeCell(fieldOf(KLOKKE), 'hei på deg', DEFAULT_GRADING, nb)).toEqual({
      verdict: 'unread',
      canonical: '17:30',
    });
  });

  it('empty carries the key like a wrong cell (DECISIONS §2: «as wrong»)', () => {
    expect(gradeCell(fieldOf(ROM), '  ', DEFAULT_GRADING, nb)).toEqual({ verdict: 'empty', canonical: '204' });
  });

  it('typo only on lexical cells, only when allowed, only on keys over three letters', () => {
    const typos = { ...DEFAULT_GRADING, typos: true };
    const navn = fieldOf(NAVN);
    expect(['Anne Lise Berg', 'anne lise', 'Ane Lise', 'Anne Lise Bergg', 'x'].map((v) => gradeCell(navn, v, typos, nb).verdict)).toEqual(
      ['ok', 'ok', 'typo', 'typo', 'wrong'],
    );
    expect(gradeCell(navn, 'Ane Lise', DEFAULT_GRADING, nb).verdict).toBe('wrong');
    const short = { ...navn, expected: ['Bo'] };
    expect(gradeCell(short, 'Bå', typos, nb).verdict).toBe('wrong');
  });

  it('never forgives a number: 405 is the wrong fact', () => {
    expect(gradeCell(fieldOf(PRIS), '405', { ...DEFAULT_GRADING, typos: true }, nb).verdict).toBe('wrong');
  });

  it('is case-sensitive only when asked', () => {
    const strict = { ...DEFAULT_GRADING, strictCase: true };
    expect(gradeCell(fieldOf(NAVN), 'anne lise berg', strict, nb).verdict).toBe('wrong');
    expect(gradeCell(fieldOf(NAVN), 'Anne Lise Berg', strict, nb).verdict).toBe('ok');
  });

  it('a phone number in any grouping', () => {
    expect(gradeCell(fieldOf(TLF), '+47 22456789', DEFAULT_GRADING, nb).verdict).toBe('format');
    expect(gradeCell(fieldOf(TLF), '22 45 67 89', DEFAULT_GRADING, nb).verdict).toBe('ok');
  });
});

describe('keyPasses (INF-M10)', () => {
  it('holds on the sample', () => expect(keyPasses(sampleContent())).toBe(true));
  it('fails on an expected value its own type cannot read', () => {
    const ex = setExpected(sampleContent(), ROM, 0, 'halv fire');
    expect(keyPasses(ex)).toBe(false);
  });
  it('fails on spelled-out keys once spelled-out numerals are switched off', () => {
    const ex = setGrading(setExpected(sampleContent(), KLOKKE, 0, 'halv seks'), { spelledNumbers: false });
    expect(keyPasses(ex)).toBe(false);
  });
});

describe('check — the blank (INF-M8, INF-S2…S9)', () => {
  it('scores the first check over every ready cell; empty is wrong', () => {
    const ex = sampleContent();
    const r = check({ ex, answers: { [DATO]: '3. mars' }, attempt: 1 });
    expect(r.total).toBe(6);
    expect(r.correct).toBe(1);
    expect(r.pct).toBe(17);
    expect(r.passed).toBe(false);
    expect(r.cells.filter((c) => c.verdict === 'empty')).toHaveLength(5);
  });

  it('records the sample answers as 5 of 6, passed at 75 %', () => {
    const r = check({ ex: sampleContent(), answers: SAMPLE_ANSWERS, attempt: 1 });
    expect([r.correct, r.total, r.pct, r.passed]).toEqual([5, 6, 83, true]);
    // Passing closes the blank — the prototype offers «Ny runde» on `result.pass`.
    expect(r.closed).toBe(true);
  });

  it('a retry locks the right cells and never moves the score', () => {
    const ex = setScoring(sampleContent(), { passPct: 100 });
    const first = check({ ex, answers: SAMPLE_ANSWERS, attempt: 1 });
    expect(first.closed).toBe(false);
    expect(first.locked).toEqual(SAMPLE_FIELD_IDS.filter((id) => id !== ROM));
    const second = check({
      ex,
      answers: { ...SAMPLE_ANSWERS, [ROM]: '204', [DATO]: 'tull' },
      attempt: 2,
      locked: first.locked,
      firstValues: first.firstValues,
    });
    expect(second.correctNow).toBe(6);
    expect(second.correct).toBe(5);
    expect(second.pct).toBe(83);
    expect(second.passed).toBe(false);
    expect(second.closed).toBe(true);
    // A locked cell the client tried to change keeps the author's wording.
    expect(second.cells.find((c) => c.id === DATO)?.value).toBe('3. mars');
  });

  it('the budget: 1, 2, 3 and unlimited', () => {
    const wrong = { [ROM]: '2' };
    for (const attempts of [1, 2, 3] as const) {
      const ex = setAnswering(sampleContent(), { attempts });
      expect(check({ ex, answers: wrong, attempt: attempts }).checksLeft).toBe(0);
      expect(check({ ex, answers: wrong, attempt: attempts }).closed).toBe(true);
    }
    const ex = setAnswering(sampleContent(), { attempts: 0 });
    const r = check({ ex, answers: wrong, attempt: 40 });
    expect(r.checksLeft).toBeNull();
    expect(r.closed).toBe(false);
  });

  it('why on every check for every cell not counted; never on a right one (INF-S5)', () => {
    const r = check({ ex: setScoring(sampleContent(), { passPct: 100 }), answers: SAMPLE_ANSWERS, attempt: 1 });
    expect(r.cells.find((c) => c.id === ROM)?.why).toMatch(/etasjen/);
    expect(r.cells.find((c) => c.id === NAVN)?.why).toBeUndefined();
  });

  it('the key by revealKey (INF-S6)', () => {
    const base = setScoring(sampleContent(), { passPct: 100 });
    const key = (revealKey: 'immediately' | 'afterLastAttempt' | 'never', attempt: number) =>
      check({ ex: setAnswering(base, { revealKey }), answers: SAMPLE_ANSWERS, attempt }).cells.find(
        (c) => c.id === ROM,
      )?.canonical;
    expect(key('immediately', 1)).toBe('204');
    expect(key('afterLastAttempt', 1)).toBeUndefined();
    expect(key('afterLastAttempt', 2)).toBe('204');
    expect(key('never', 2)).toBeUndefined();
  });

  it('the standard form of a right cell is always shown', () => {
    const r = check({ ex: setAnswering(sampleContent(), { revealKey: 'never' }), answers: SAMPLE_ANSWERS, attempt: 1 });
    expect(r.cells.find((c) => c.id === KLOKKE)?.canonical).toBe('17:30');
  });

  it('hints from the first check under «after one attempt», never under «never» (INF-S7)', () => {
    const one = check({ ex: sampleContent(), answers: {}, attempt: 1 });
    expect(one.cells.find((c) => c.id === DATO)?.hint).toBe('Dag og måned');
    const never = check({ ex: setAnswering(sampleContent(), { hintsAfter: 9 }), answers: {}, attempt: 1 });
    expect(never.cells.some((c) => c.hint !== undefined)).toBe(false);
  });

  it('every required cell on top of the percentage', () => {
    const ex = setGrading(setScoring(sampleContent(), { passPct: 50 }), { requiredAll: true });
    const r = check({ ex, answers: SAMPLE_ANSWERS, attempt: 1 });
    expect(r.missedRequired).toBe(1);
    expect(r.passed).toBe(false);
    const optional = setField(ex, ROM, { required: false });
    expect(check({ ex: optional, answers: SAMPLE_ANSWERS, attempt: 1 }).passed).toBe(true);
  });

  it('a graded delivery: one check, no key (INF-S13)', () => {
    const ex = setAnswering(sampleContent(), { revealKey: 'immediately', attempts: 3 });
    const r = check({ ex, answers: { [ROM]: '2' }, attempt: 1, graded: true });
    expect(r.checksLeft).toBe(0);
    expect(r.closed).toBe(true);
    expect(r.revealed).toBe(false);
    expect(r.cells.find((c) => c.id === ROM)?.canonical).toBeUndefined();
    expect(r.cells.some((c) => c.hint !== undefined)).toBe(false);
  });
});
