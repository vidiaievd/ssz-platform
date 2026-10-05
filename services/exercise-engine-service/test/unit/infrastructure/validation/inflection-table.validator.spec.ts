import { InflectionTableValidator } from '../../../../src/infrastructure/validation/validators/inflection-table.validator.js';
import {
  ALL_RIGHT,
  GRADING_FIXTURE,
  sampleContent,
  toContent,
  toExpectedAnswers,
  updateInput,
  updateSettings,
} from '@ssz/shared-kernel/inflection-table';
import type { InflectionTableContent, RevealKey } from '@ssz/shared-kernel/inflection-table';

// The grading is the kernel's and is tested there. What is tested here is that the server runs
// the same verdict over the persisted columns (the shared fixture, IT-X6), and what this file
// decides on its own: the shape of a submission, the facts carried between checks, and what a
// check may carry of the key.

const validate = (submittedAnswer: unknown, table: InflectionTableContent = sampleContent()) =>
  new InflectionTableValidator().validate({
    submittedAnswer,
    content: toContent(table),
    expectedAnswers: toExpectedAnswers(table),
    checkSettings: {},
    targetLanguage: 'nb',
  });

interface Cell {
  itemId: string;
  rowId: string;
  slotId: string;
  value: string;
  correct: boolean;
  firstCorrect: boolean;
  firstAnswer: string;
  near?: string;
  why?: string;
  correctForm?: string;
}

interface Details {
  totalItems: number;
  passedItems: number;
  correctNow: number;
  falsePositives: number;
  pct: number;
  passed: boolean;
  attempt: number;
  checksLeft: number;
  closed: boolean;
  locked: string[];
  rows: Array<{ rowId: string; asked: number; ok: number; firstOk: number }>;
  items: Cell[];
}

const detailsOf = (result: ReturnType<typeof validate>) => result.value.details as Details;
const cellOf = (details: Details, key: string) => details.items.find((c) => c.itemId === key)!;

describe('InflectionTableValidator — the shared fixture, from the persisted columns (IT-X6)', () => {
  for (const c of GRADING_FIXTURE) {
    it(c.name, () => {
      const result = validate({ cells: c.answers }, updateInput(sampleContent(), { mode: c.input }));

      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(c.expect.pct);
      expect(result.value.passed).toBe(c.expect.passed);
      const details = detailsOf(result);
      expect(details).toMatchObject({
        passedItems: c.expect.correct,
        falsePositives: c.expect.falsePositives,
        totalItems: 12,
      });
      for (const [key, want] of Object.entries(c.expect.cells)) {
        expect(cellOf(details, key).correct).toBe(want.ok);
        expect(cellOf(details, key).near).toBe(want.near);
      }
    });
  }
});

describe('InflectionTableValidator — the submission', () => {
  it('grades a full table and never routes it to a teacher', () => {
    const result = validate({ cells: ALL_RIGHT });
    expect(result.isOk).toBe(true);
    expect(result.value).toMatchObject({ correct: true, score: 100, passed: true, requiresReview: false });
  });

  it.each([
    ['no object', 'boka'],
    ['no cells', {}],
    ['cells as a list', { cells: ['boka'] }],
    ['a value that is not text', { cells: { 'r2:defSg': 3 } }],
    ['a key that is not a cell key', { cells: { 'r2 defSg': 'boka' } }],
    ['a value longer than any form', { cells: { 'r2:defSg': 'b'.repeat(121) } }],
  ])('refuses %s as a schema mismatch', (_label, submitted) => {
    const result = validate(submitted);
    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('SCHEMA_MISMATCH');
  });

  it('ignores a well-formed key the table does not ask — a prefilled cell, a removed row', () => {
    const result = validate({ cells: { ...ALL_RIGHT, 'r1:indefSg': 'feil', 'gone:defSg': 'x' } });
    expect(result.isOk).toBe(true);
    expect(result.value.score).toBe(100);
    expect(detailsOf(result).items.map((c) => c.itemId)).not.toContain('r1:indefSg');
  });

  it('refuses a table with nothing to grade', () => {
    const table = sampleContent();
    const result = validate({ cells: {} }, { ...table, rows: table.rows.map((r) => ({ ...r, lemma: '' })) });
    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('INVALID_EXERCISE');
  });
});

describe('InflectionTableValidator — between checks (IT-R3, IT-R4, IT-R5)', () => {
  const firstCheck = { ...ALL_RIGHT, 'r1:defSg': '', 'r2:indefPl': 'boker' };

  it('scores the first check over every asked cell, an empty one wrong, and carries it forward', () => {
    const details = detailsOf(validate({ cells: firstCheck }));
    expect(details).toMatchObject({ attempt: 1, checksLeft: 1, closed: false, passedItems: 10 });
    expect(details.locked).toHaveLength(10);
    expect(details.locked).not.toContain('r1:defSg');
    expect(cellOf(details, 'r1:defSg')).toMatchObject({ value: '', correct: false, firstAnswer: '' });
    expect(cellOf(details, 'r2:indefPl')).toMatchObject({ firstAnswer: 'boker', near: 'diacritic' });
  });

  it('keeps the first check as the score when the re-check fixes the table', () => {
    const first = detailsOf(validate({ cells: firstCheck }));
    const result = validate({
      cells: ALL_RIGHT,
      attempt: 2,
      locked: first.locked,
      firstAnswers: Object.fromEntries(first.items.map((c) => [c.itemId, c.firstAnswer])),
    });

    const details = detailsOf(result);
    expect(details).toMatchObject({ attempt: 2, correctNow: 12, closed: true, passedItems: 10 });
    expect(result.value.score).toBe(83);
    expect(result.value.correct).toBe(true);
    expect(cellOf(details, 'r2:indefPl')).toMatchObject({ correct: true, firstCorrect: false, firstAnswer: 'boker' });
  });

  it('keeps a locked cell right, whatever is resent', () => {
    const result = validate({
      cells: { ...ALL_RIGHT, 'r2:defSg': 'feil' },
      attempt: 2,
      locked: ['r2:defSg'],
      firstAnswers: { ...ALL_RIGHT },
    });
    expect(cellOf(detailsOf(result), 'r2:defSg')).toMatchObject({ value: 'boka', correct: true });
  });

  it('counts the rows on every check, whether the chip is drawn or not (IT-M7)', () => {
    const table = updateSettings(sampleContent(), { rowVerdict: false });
    const details = detailsOf(validate({ cells: firstCheck }, table));
    expect(details.rows.find((r) => r.rowId === 'r1')).toEqual({ rowId: 'r1', asked: 3, ok: 2, firstOk: 2 });
    expect(details.rows.find((r) => r.rowId === 'r3')).toEqual({ rowId: 'r3', asked: 3, ok: 3, firstOk: 3 });
  });
});

describe('InflectionTableValidator — how much of the key a check carries (IT-R6, IT-R7)', () => {
  const wrong = { ...ALL_RIGHT, 'r2:defSg': 'boker' };
  const run = (revealKey: RevealKey, attempt: number, over: Record<string, unknown> = {}) =>
    detailsOf(
      validate(
        { cells: wrong, attempt, firstAnswers: attempt > 1 ? wrong : undefined, ...over },
        updateSettings(sampleContent(), { revealKey, attempts: 2 }),
      ),
    );

  it('gives the reason for a wrong cell on every check, and never for a right one', () => {
    const details = run('never', 1);
    expect(cellOf(details, 'r2:defSg').why).toBe('Hunkjønn i bokmål: ei bok → boka.');
    expect(details.items.filter((c) => c.correct).every((c) => c.why === undefined)).toBe(true);
  });

  it('afterFirst: the correct form after any check', () => {
    expect(cellOf(run('afterFirst', 1), 'r2:defSg').correctForm).toBe('boka');
  });

  it('afterLast: only once the budget is spent', () => {
    expect(cellOf(run('afterLast', 1), 'r2:defSg')).not.toHaveProperty('correctForm');
    expect(cellOf(run('afterLast', 2), 'r2:defSg').correctForm).toBe('boka');
  });

  it('never: not even on a closed table', () => {
    const details = run('never', 2);
    expect(details.closed).toBe(true);
    expect(cellOf(details, 'r2:defSg')).not.toHaveProperty('correctForm');
  });

  it('a graded check closes the table and keeps the key back, whatever the settings', () => {
    const details = run('afterFirst', 1, { graded: true });
    expect(details).toMatchObject({ closed: true, checksLeft: 0 });
    expect(cellOf(details, 'r2:defSg')).not.toHaveProperty('correctForm');
  });

  it('never carries a variant the cell would also accept', () => {
    const details = run('afterFirst', 1);
    expect(JSON.stringify(details)).not.toContain('boken');
  });
});
