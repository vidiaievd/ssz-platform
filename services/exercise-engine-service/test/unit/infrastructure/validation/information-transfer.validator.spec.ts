import { InformationTransferValidator } from '../../../../src/infrastructure/validation/validators/information-transfer.validator.js';
import {
  SAMPLE_ANSWERS,
  SAMPLE_FIELD_IDS,
  sampleContent,
  toContent,
  toExpectedAnswers,
} from '@ssz/shared-kernel/information-transfer';
import type {
  Answering,
  InformationTransferContent,
} from '@ssz/shared-kernel/information-transfer';

// The grading is the kernel's and is tested there. What is tested here is that the server runs
// the same verdict over the persisted columns (the shared fixture), and what this file decides
// on its own: the shape of a submission, the facts carried between checks, and the record.

const [DATO, KLOKKE, ROM, PRIS, TLF, NAVN] = SAMPLE_FIELD_IDS;

const validate = (submittedAnswer: unknown, blank: InformationTransferContent = sampleContent()) =>
  new InformationTransferValidator().validate({
    submittedAnswer,
    content: toContent(blank),
    expectedAnswers: toExpectedAnswers(blank),
    checkSettings: {},
    targetLanguage: 'nb',
  });

const withAnswering = (patch: Partial<Answering>): InformationTransferContent => {
  const blank = sampleContent();
  return { ...blank, answering: { ...blank.answering, ...patch } };
};

interface Cell {
  itemId: string;
  value: string;
  verdict: string;
  correct: boolean;
  firstVerdict: string;
  firstCorrect: boolean;
  firstAnswer: string;
  canonical?: string;
  why?: string;
  hint?: string;
}

interface Details {
  totalItems: number;
  passedItems: number;
  correctNow: number;
  pct: number;
  passed: boolean;
  passPct: number;
  missedRequired: number;
  unread: number;
  attempt: number;
  checksLeft: number | null;
  closed: boolean;
  revealed: boolean;
  locked: string[];
  items: Cell[];
}

const detailsOf = (result: ReturnType<typeof validate>) => result.value.details as Details;
const cellOf = (details: Details, id: string) => details.items.find((c) => c.itemId === id)!;

/** Three of six on the first go: a wrong room, the half-hour trap, a price that is no number. */
const FIRST_GO: Record<string, string> = {
  ...SAMPLE_ANSWERS,
  [KLOKKE]: '18:30',
  [ROM]: '2',
  [PRIS]: 'billig',
};

describe('InformationTransferValidator — the shared fixture, from the persisted columns', () => {
  it('grades the sample answers as the kernel does: five counted, the room wrong', () => {
    const result = validate({ cells: SAMPLE_ANSWERS });
    expect(result.isOk).toBe(true);
    const details = detailsOf(result);

    expect(details.items.map((c) => [c.itemId, c.verdict])).toEqual([
      [DATO, 'format'],
      [KLOKKE, 'format'],
      [ROM, 'wrong'],
      [PRIS, 'format'],
      [TLF, 'format'],
      [NAVN, 'ok'],
    ]);
    // 5 of 6 → 83, over the sample's 75 % mark — the blank closes on the pass, so the key shows.
    expect(result.value).toMatchObject({
      score: 83,
      passed: true,
      correct: false,
      requiresReview: false,
    });
    expect(details).toMatchObject({ closed: true, revealed: true, passPct: 75, missedRequired: 1 });
    expect(cellOf(details, ROM).canonical).toBe('204');
    // The standard form beside a right answer in another notation.
    expect(cellOf(details, KLOKKE)).toMatchObject({ correct: true, canonical: '17:30' });
  });
});

describe('InformationTransferValidator — the shape of a submission', () => {
  it.each([
    ['not an object', 'kl 17.30'],
    ['no cells', { answers: {} }],
    ['cells as a list', { cells: ['17:30'] }],
    ['a key that is no field id', { cells: { 'f1:x y': '17:30' } }],
    ['a value that is not a string', { cells: { [KLOKKE]: 1730 } }],
    ['a value too long to be a fact', { cells: { [KLOKKE]: 'x'.repeat(121) } }],
  ])('refuses %s', (_name, submitted) => {
    const result = validate(submitted);
    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('SCHEMA_MISMATCH');
  });

  it('ignores a field the blank does not have — the author may have removed it since', () => {
    const result = validate({ cells: { ...SAMPLE_ANSWERS, gone00: 'x' } });
    expect(result.isOk).toBe(true);
    expect(detailsOf(result).items.map((c) => c.itemId)).not.toContain('gone00');
  });

  it('counts a cell left out as empty, on the first check, over every ready field (INF-S2)', () => {
    const result = validate({ cells: { [NAVN]: 'Anne Lise' } });
    const details = detailsOf(result);
    expect(details.totalItems).toBe(6);
    expect(cellOf(details, KLOKKE)).toMatchObject({ verdict: 'empty', correct: false });
    expect(result.value.score).toBe(17);
  });

  it('refuses a blank with no ready field', () => {
    const blank = sampleContent();
    const empty = { ...blank, fields: blank.fields.map((f) => ({ ...f, why: '' })) };
    const result = validate({ cells: SAMPLE_ANSWERS }, empty);
    expect(result.isFail).toBe(true);
    expect(result.error.code).toBe('INVALID_EXERCISE');
  });
});

describe('InformationTransferValidator — checks of the whole blank', () => {
  it('scores the first check and leaves the blank open with a check left (INF-S4)', () => {
    const details = detailsOf(validate({ cells: FIRST_GO }));
    expect(details).toMatchObject({
      attempt: 1,
      checksLeft: 1,
      closed: false,
      revealed: false,
      passedItems: 3,
      pct: 50,
      passed: false,
    });
    expect(details.locked.sort()).toEqual([DATO, NAVN, TLF].sort());
  });

  it('records the first verdict of every cell, `unread` included, and counts the unread (INF-S10)', () => {
    const details = detailsOf(validate({ cells: FIRST_GO }));
    expect(cellOf(details, PRIS)).toMatchObject({
      verdict: 'unread',
      firstVerdict: 'unread',
      firstAnswer: 'billig',
    });
    expect(details.unread).toBe(1);
  });

  it('gives the reason of every cell not counted, and none to a counted one (INF-S5)', () => {
    const details = detailsOf(validate({ cells: FIRST_GO }));
    expect(cellOf(details, KLOKKE).why).toContain('Halv seks');
    expect(cellOf(details, NAVN)).not.toHaveProperty('why');
  });

  it('keeps the key back on an open blank under afterLastAttempt (INF-S6)', () => {
    const details = detailsOf(validate({ cells: FIRST_GO }));
    expect(cellOf(details, ROM)).not.toHaveProperty('canonical');
    expect(cellOf(details, PRIS)).not.toHaveProperty('canonical');
    expect(JSON.stringify(details)).not.toContain('204');
  });

  it('shows the key with the verdict under immediately, and never under never (INF-S6)', () => {
    const now = detailsOf(
      validate({ cells: FIRST_GO }, withAnswering({ revealKey: 'immediately' })),
    );
    expect(cellOf(now, ROM).canonical).toBe('204');

    const never = detailsOf(
      validate(
        { cells: FIRST_GO, attempt: 2, firstAnswers: FIRST_GO },
        withAnswering({ revealKey: 'never' }),
      ),
    );
    expect(never.closed).toBe(true);
    expect(cellOf(never, ROM)).not.toHaveProperty('canonical');
  });

  it('carries the hints from the first check under hintsAfter: 1, and never under 9 (INF-S7)', () => {
    const one = detailsOf(validate({ cells: FIRST_GO }));
    expect(cellOf(one, KLOKKE).hint).toBe('kl.');

    const never = detailsOf(validate({ cells: FIRST_GO }, withAnswering({ hintsAfter: 9 })));
    expect(never.items.some((c) => c.hint !== undefined)).toBe(false);
  });

  it('a second check keeps the first as the score, holds the locked cells, and closes the budget (INF-S3, INF-S9)', () => {
    const first = detailsOf(validate({ cells: FIRST_GO }));
    const second = validate({
      cells: { ...SAMPLE_ANSWERS, [ROM]: '204', [TLF]: 'feil' },
      attempt: 2,
      locked: first.locked,
      firstAnswers: Object.fromEntries(first.items.map((c) => [c.itemId, c.firstAnswer])),
    });
    const details = detailsOf(second);

    expect(second.value.score).toBe(50);
    expect(second.value.passed).toBe(false);
    expect(details).toMatchObject({
      attempt: 2,
      checksLeft: 0,
      closed: true,
      correctNow: 6,
      passedItems: 3,
    });
    // Locked on the first check — the resent «feil» does not stand.
    expect(cellOf(details, TLF)).toMatchObject({ correct: true, value: '22 45 67 89' });
    expect(cellOf(details, ROM)).toMatchObject({
      correct: true,
      firstCorrect: false,
      firstAnswer: '2',
    });
  });

  it('never closes on the budget under attempts: 0 (INF-S4)', () => {
    const details = detailsOf(
      validate(
        { cells: FIRST_GO, attempt: 7, firstAnswers: FIRST_GO },
        withAnswering({ attempts: 0 }),
      ),
    );
    expect(details).toMatchObject({ checksLeft: null, closed: false });
  });

  it('a graded check is one check, without key or hints (INF-S13)', () => {
    const details = detailsOf(
      validate({ cells: FIRST_GO, graded: true }, withAnswering({ revealKey: 'immediately' })),
    );
    expect(details).toMatchObject({ checksLeft: 0, closed: true, revealed: false });
    expect(cellOf(details, ROM)).not.toHaveProperty('canonical');
    expect(details.items.some((c) => c.hint !== undefined)).toBe(false);
    // The reason stays: an explanation is not the key.
    expect(cellOf(details, ROM).why).toBeDefined();
  });

  it('fails a blank that clears the mark but misses a required cell, under requiredAll (INF-M8)', () => {
    const blank = sampleContent();
    const strict = { ...blank, grading: { ...blank.grading, requiredAll: true } };
    const result = validate({ cells: SAMPLE_ANSWERS }, strict);
    expect(result.value).toMatchObject({ score: 83, passed: false });
    expect(detailsOf(result).missedRequired).toBe(1);
  });
});
