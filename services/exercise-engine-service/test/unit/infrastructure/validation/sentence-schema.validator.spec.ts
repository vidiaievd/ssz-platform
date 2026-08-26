import { SentenceSchemaValidator } from '../../../../src/infrastructure/validation/validators/sentence-schema.validator.js';

const validator = new SentenceSchemaValidator();

// Two document shapes reach this validator and the shape decides which grader runs
// (plan 52 §8 Q3: one exercise of the seven was reseeded, six stay as they were).
//
// The first block below is the old form — one sentence, inline fields, an ordered list of
// token ids per field — and it passes no `content` at all, which is exactly how those six
// documents arrive. The second is the set.

// "Lars har aldri likt Lotte" → Forfelt | Verbal | Midtfelt | Verbal | Sluttfelt
const expected = {
  placements: [
    { field_id: 'forfelt', token_ids: ['t1'] },
    { field_id: 'verbal1', token_ids: ['t2'] },
    { field_id: 'midtfelt', token_ids: ['t3'] },
    { field_id: 'verbal2', token_ids: ['t4'] },
    { field_id: 'sluttfelt', token_ids: ['t5'] },
  ],
};

const run = (
  placements: Array<{ field_id: string; token_ids: string[] }>,
  checkSettings: Record<string, unknown> = { allow_partial_credit: true, order_sensitive: true },
) =>
  validator.validate({
    submittedAnswer: { placements },
    expectedAnswers: expected,
    checkSettings,
    targetLanguage: 'no',
  });

describe('SentenceSchemaValidator — one sentence, the old form', () => {
  it('scores 100 when every field matches', () => {
    const result = run(expected.placements);
    expect(result.value.correct).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.requiresReview).toBe(false);
  });

  it('gives partial credit per field', () => {
    const result = run([
      { field_id: 'forfelt', token_ids: ['t1'] }, // correct
      { field_id: 'verbal1', token_ids: ['t2'] }, // correct
      { field_id: 'midtfelt', token_ids: ['t4'] }, // wrong
      { field_id: 'verbal2', token_ids: ['t3'] }, // wrong
      { field_id: 'sluttfelt', token_ids: ['t5'] }, // correct
    ]);
    expect(result.value.score).toBe(60);
    expect(result.value.correct).toBe(false);
  });

  it('is order-sensitive within a field', () => {
    const result = run([
      { field_id: 'forfelt', token_ids: ['t1'] },
      { field_id: 'verbal1', token_ids: ['t2'] },
      { field_id: 'midtfelt', token_ids: ['t3'] },
      { field_id: 'verbal2', token_ids: ['t4'] },
      { field_id: 'sluttfelt', token_ids: ['t5', 'extra'] }, // wrong length/order
    ]);
    expect(result.value.score).toBe(80);
  });

  it('treats a missing submitted field as incorrect', () => {
    const result = run([
      { field_id: 'forfelt', token_ids: ['t1'] },
      // verbal1 missing
      { field_id: 'midtfelt', token_ids: ['t3'] },
      { field_id: 'verbal2', token_ids: ['t4'] },
      { field_id: 'sluttfelt', token_ids: ['t5'] },
    ]);
    expect(result.value.score).toBe(80);
  });

  it('with allow_partial_credit=false scores 0 unless all fields match', () => {
    const result = run(
      [
        { field_id: 'forfelt', token_ids: ['t1'] },
        { field_id: 'verbal1', token_ids: ['t2'] },
        { field_id: 'midtfelt', token_ids: ['t3'] },
        { field_id: 'verbal2', token_ids: ['t4'] },
        { field_id: 'sluttfelt', token_ids: ['wrong'] },
      ],
      { allow_partial_credit: false },
    );
    expect(result.value.score).toBe(0);
  });

  it('exposes per-field results in details', () => {
    const result = run([
      { field_id: 'forfelt', token_ids: ['t1'] },
      { field_id: 'verbal1', token_ids: ['wrong'] },
      { field_id: 'midtfelt', token_ids: ['t3'] },
      { field_id: 'verbal2', token_ids: ['t4'] },
      { field_id: 'sluttfelt', token_ids: ['t5'] },
    ]);
    const details = result.value.details as { fields: Array<{ field_id: string; correct: boolean }> };
    expect(details.fields.find((f) => f.field_id === 'verbal1')?.correct).toBe(false);
    expect(details.fields.find((f) => f.field_id === 'forfelt')?.correct).toBe(true);
  });
});

// ── The set, rewritten for the design handoff ────────────────────────────────

const settings = {
  labels: true,
  hints: false,
  counts: false,
  prefill: 'none',
  markEmpty: false,
  perField: true,
  hintAfterMistake: true,
  shuffle: false,
  extras: true,
  order: 'strict',
};

// "at han kommer i morgen" — a subordinate clause, four pieces, one distractor.
// `i morgen` is accepted in the end field and in the adverbial: one chunk, two fields.
const content = {
  title: 'Indirekte tale',
  instruction: 'Bygg om setningen og legg den i skjemaet.',
  presetId: 'blank',
  clauses: ['sub'],
  schema: {
    sub: [
      { id: 'f-sub', short: 'sub', label: 'Subjunksjon', hint: '', optional: false },
      { id: 'f-subj', short: 'n', label: 'Subjekt', hint: '', optional: false },
      { id: 'f-adv', short: 'a', label: 'Adverbial', hint: '', optional: true },
      { id: 'f-v', short: 'v', label: 'Verbal', hint: '', optional: false },
      { id: 'f-slutt', short: 'N', label: 'Sluttfelt', hint: '', optional: true },
    ],
  },
  rows: [
    {
      id: 'r1',
      clause: 'sub',
      source: '«Jeg kommer i morgen», sa han.',
      chunks: [
        { id: 'c1', text: 'at' },
        { id: 'c2', text: 'han' },
        { id: 'c3', text: 'kommer' },
        { id: 'c4', text: 'i morgen' },
      ],
      extras: [{ id: 'x1', text: 'ikke' }],
    },
    {
      id: 'r2',
      clause: 'sub',
      source: '«Jeg leser boka», sa hun.',
      chunks: [
        { id: 'd1', text: 'at' },
        { id: 'd2', text: 'hun' },
        { id: 'd3', text: 'leser' },
        { id: 'd4', text: 'boka' },
      ],
      extras: [],
    },
  ],
  settings,
};

const answers = {
  rows: {
    r1: {
      text: 'at han kommer i morgen',
      why: 'Subjunksjonen «at» innleder leddsetningen, og verbet står etter subjektet.',
      fields: { c1: 'f-sub', c2: 'f-subj', c3: 'f-v', c4: 'f-slutt' },
      alt: { c4: ['f-adv'] },
      fb: {},
    },
    r2: {
      text: 'at hun leser boka',
      why: 'Samme regel: subjektet før verbet.',
      fields: { d1: 'f-sub', d2: 'f-subj', d3: 'f-v', d4: 'f-slutt' },
      alt: {},
      fb: {},
    },
  },
};

const solvedR1 = { 'f-sub': ['c1'], 'f-subj': ['c2'], 'f-v': ['c3'], 'f-slutt': ['c4'] };
const solvedR2 = { 'f-sub': ['d1'], 'f-subj': ['d2'], 'f-v': ['d3'], 'f-slutt': ['d4'] };

interface SetDetails {
  totalItems: number;
  passedItems: number;
  items: Array<{
    itemId: string;
    solved: boolean;
    revealed: boolean;
    score: number;
    byItem: Record<string, string>;
    byField: Record<string, string>;
  }>;
}

const runSet = (
  rows: Array<{ rowId: string; placement: Record<string, string[]>; revealed?: boolean }>,
  checkSettings: Record<string, unknown> = { allow_partial_credit: true },
) =>
  validator.validate({
    submittedAnswer: { rows },
    expectedAnswers: answers,
    content,
    checkSettings,
    targetLanguage: 'no',
  });

describe('SentenceSchemaValidator — the set', () => {
  it('scores 100 when every sentence is laid out correctly', () => {
    const result = runSet([
      { rowId: 'r1', placement: solvedR1 },
      { rowId: 'r2', placement: solvedR2 },
    ]);

    expect(result.value.score).toBe(100);
    expect(result.value.correct).toBe(true);
    // Deterministic: nothing here is for a teacher to decide.
    expect(result.value.requiresReview).toBe(false);
  });

  it('counts a sentence never handed in as a sentence not solved', () => {
    const result = runSet([{ rowId: 'r1', placement: solvedR1 }]);

    expect(result.value.score).toBe(50);
    const details = result.value.details as SetDetails;
    expect(details.totalItems).toBe(2);
    expect(details.passedItems).toBe(1);
  });

  it('credits the fields of an imperfect sentence when partial credit is allowed', () => {
    // `kommer` in the end field, `i morgen` in the verbal: two fields wrong of the four
    // the key has an opinion about, so half of this sentence and a quarter of the set.
    const swapped = { 'f-sub': ['c1'], 'f-subj': ['c2'], 'f-v': ['c4'], 'f-slutt': ['c3'] };
    const result = runSet([
      { rowId: 'r1', placement: swapped },
      { rowId: 'r2', placement: solvedR2 },
    ]);

    const details = result.value.details as SetDetails;
    expect(details.items.find((i) => i.itemId === 'r1')?.score).toBe(50);
    expect(result.value.score).toBe(75);
  });

  it('scores a sentence all or nothing when partial credit is off', () => {
    const swapped = { 'f-sub': ['c1'], 'f-subj': ['c2'], 'f-v': ['c4'], 'f-slutt': ['c3'] };
    const result = runSet(
      [
        { rowId: 'r1', placement: swapped },
        { rowId: 'r2', placement: solvedR2 },
      ],
      { allow_partial_credit: false },
    );

    expect(result.value.score).toBe(50);
  });

  it('accepts a chunk in an alternative field and still calls its own field empty-not-wrong', () => {
    // `I morgen` is right in the adverbial as well as in the end field. The field it
    // vacated must not then be marked as missing something — the trap the kernel's
    // two-pass grading exists for.
    const alternative = { 'f-sub': ['c1'], 'f-subj': ['c2'], 'f-v': ['c3'], 'f-adv': ['c4'] };
    const result = runSet([
      { rowId: 'r1', placement: alternative },
      { rowId: 'r2', placement: solvedR2 },
    ]);

    expect(result.value.score).toBe(100);
    const marks = (result.value.details as SetDetails).items.find((i) => i.itemId === 'r1');
    expect(marks?.byField['f-slutt']).toBe('empty');
  });

  it('marks a distractor as extra, whichever field it lands in', () => {
    const withStray = { ...solvedR1, 'f-adv': ['x1'] };
    const result = runSet([
      { rowId: 'r1', placement: withStray },
      { rowId: 'r2', placement: solvedR2 },
    ]);

    const marks = (result.value.details as SetDetails).items.find((i) => i.itemId === 'r1');
    expect(marks?.byItem['x1']).toBe('extra');
    expect(marks?.solved).toBe(false);
  });

  it('gives a revealed sentence nothing, however the board ended up looking', () => {
    // `Vis riktig skjema` fills the answer in. Crediting the board it leaves behind would
    // make the reveal the cheapest way to a full score (plan 52 §3.4).
    const result = runSet([
      { rowId: 'r1', placement: solvedR1, revealed: true },
      { rowId: 'r2', placement: solvedR2 },
    ]);

    expect(result.value.score).toBe(50);
    const marks = (result.value.details as SetDetails).items.find((i) => i.itemId === 'r1');
    expect(marks?.score).toBe(0);
    expect(marks?.revealed).toBe(true);
  });

  it('says nothing about a sentence the document no longer holds', () => {
    // Plan 52 §6.7: the author may edit the key under a saved attempt. A reader that
    // filled such a row with zeros would look healthy while inventing a verdict.
    const result = runSet([
      { rowId: 'gone', placement: solvedR1 },
      { rowId: 'r1', placement: solvedR1 },
      { rowId: 'r2', placement: solvedR2 },
    ]);

    const details = result.value.details as SetDetails;
    expect(details.items.map((i) => i.itemId)).toEqual(['r1', 'r2']);
    expect(result.value.score).toBe(100);
  });

  it('refuses a submission that is not a board per sentence', () => {
    const result = validator.validate({
      submittedAnswer: { placements: [{ field_id: 'f-sub', token_ids: ['c1'] }] },
      expectedAnswers: answers,
      content,
      checkSettings: {},
      targetLanguage: 'no',
    });

    expect(result.isFail).toBe(true);
  });

  it('never derives anything from the sentence the student rewrites', () => {
    // §6, caveat 10: `row.source` is a prompt and only a prompt. A grader that tokenized
    // it would find `sa han` in the bank and mark a correct board wrong.
    const result = runSet([
      { rowId: 'r1', placement: solvedR1 },
      { rowId: 'r2', placement: solvedR2 },
    ]);

    const marks = (result.value.details as SetDetails).items.find((i) => i.itemId === 'r1');
    expect(Object.keys(marks?.byItem ?? {})).toEqual(['c1', 'c2', 'c3', 'c4']);
  });
});
