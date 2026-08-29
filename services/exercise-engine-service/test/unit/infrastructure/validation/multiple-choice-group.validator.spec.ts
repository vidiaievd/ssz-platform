import { MultipleChoiceGroupValidator } from '../../../../src/infrastructure/validation/validators/multiple-choice-group.validator.js';

const validator = new MultipleChoiceGroupValidator();

type Item = { id: string; correct_option_ids: string[]; explanation?: string };

const run = (
  submittedItems: Item[],
  expectedItems: Item[],
  settings: Record<string, unknown> = {},
) =>
  validator.validate({
    submittedAnswer: { items: submittedItems },
    expectedAnswers: { items: expectedItems },
    checkSettings: settings,
    targetLanguage: 'no',
  });

// A Riktig / Galt block: four statements about the same text.
const expected: Item[] = [
  { id: '1', correct_option_ids: ['r'] },
  { id: '2', correct_option_ids: ['g'], explanation: 'The advert asks for three years.' },
  { id: '3', correct_option_ids: ['g'] },
  { id: '4', correct_option_ids: ['r'] },
];

const pick = (id: string, option: string): Item => ({ id, correct_option_ids: [option] });

// Everything in this first block is the *old* form, graded by
// `multiple-choice-group-legacy.ts` and unchanged by the rewrite. Two seeded exercises
// are still written this way until phase 3 (plan 54 §1.1), and the dispatch is by the
// shape of the document: an input with no `content.rows` is one of them.
describe('MultipleChoiceGroupValidator — the old form', () => {
  it('scores 100 when every question matches the key', () => {
    const result = run([pick('1', 'r'), pick('2', 'g'), pick('3', 'g'), pick('4', 'r')], expected);

    expect(result.isOk).toBe(true);
    expect(result.value.score).toBe(100);
    expect(result.value.correct).toBe(true);
    expect(result.value.requiresReview).toBe(false);
  });

  it('gives partial credit per question by default', () => {
    const result = run([pick('1', 'r'), pick('2', 'r'), pick('3', 'g'), pick('4', 'g')], expected);

    expect(result.value.score).toBe(50);
    expect(result.value.correct).toBe(false);
  });

  it('counts a skipped question as wrong rather than dropping it', () => {
    const result = run([pick('1', 'r'), pick('2', 'g'), pick('3', 'g')], expected);

    expect(result.value.score).toBe(75);
    const items = (result.value.details as { items: Array<{ item_id: string; correct: boolean }> })
      .items;
    expect(items).toHaveLength(4);
    expect(items[3]).toMatchObject({ item_id: '4', correct: false, submitted: [] });
  });

  it('reports each question with the key and the author note behind it', () => {
    const result = run([pick('1', 'r'), pick('2', 'r'), pick('3', 'g'), pick('4', 'r')], expected);

    const items = (
      result.value.details as {
        items: Array<{
          item_id: string;
          correct: boolean;
          submitted: string[];
          expected: string[];
          explanation?: string;
        }>;
      }
    ).items;
    expect(items[1]).toEqual({
      item_id: '2',
      correct: false,
      submitted: ['r'],
      expected: ['g'],
      explanation: 'The advert asks for three years.',
    });
    expect(items[0]!.explanation).toBeUndefined();
  });

  it('scores all-or-nothing when partial credit is switched off', () => {
    const nearly = [pick('1', 'r'), pick('2', 'g'), pick('3', 'g'), pick('4', 'g')];

    expect(run(nearly, expected, { allow_partial_credit: false }).value.score).toBe(0);
    expect(
      run([pick('1', 'r'), pick('2', 'g'), pick('3', 'g'), pick('4', 'r')], expected, {
        allow_partial_credit: false,
      }).value.score,
    ).toBe(100);
  });

  it('needs every option of a multi-answer question, no more and no less', () => {
    const multi: Item[] = [{ id: '1', correct_option_ids: ['a', 'c'] }];

    expect(run([{ id: '1', correct_option_ids: ['c', 'a'] }], multi).value.score).toBe(100);
    expect(run([{ id: '1', correct_option_ids: ['a'] }], multi).value.score).toBe(0);
    expect(run([{ id: '1', correct_option_ids: ['a', 'b', 'c'] }], multi).value.score).toBe(0);
  });
});


// ── The new form ────────────────────────────────────────────────────────────
//
// A table of statements over one text, sharing one set of columns, handed in whole. What
// this validator has to get right is the inputs the client does not own: which check this
// is, which rows are frozen, and what was picked the first time round.

const columns = [
  { id: 'c1', label: 'Riktig', short: 'R' },
  { id: 'c2', label: 'Galt', short: 'G' },
];

const content = {
  title: 'Tekst 1A',
  instruction: 'Er påstandene riktige eller gale?',
  source: { mode: 'inline', label: 'Bartek', text: 'Bartek er snekker. Han søker jobb i Bergen.' },
  columns,
  rows: [
    { id: 'r1', text: 'Bartek er snekker.' },
    { id: 'r2', text: 'Bartek søker jobb i Oslo.' },
    { id: 'r3', text: 'Bartek har jobbet i tre år.' },
    { id: 'r4', text: 'Bartek bor i Bergen.' },
    // Written but never marked: not part of the table the student sees, so not part of
    // the total either.
    { id: 'r5', text: 'Bartek er 30 år.' },
  ],
  settings: {
    numbering: true,
    shuffleRows: false,
    layout: 'auto',
    showText: true,
    retry: 'one',
    lockCorrect: true,
    showWhy: 'wrong',
    revealKey: true,
    passThreshold: 70,
    progress: true,
  },
};

const key = {
  rows: {
    r1: { answer: 'c1', why: 'Første setning.', quote: 'Bartek er snekker.' },
    r2: { answer: 'c2', why: 'Bergen, ikke Oslo.', quote: 'Han søker jobb i Bergen.' },
    r3: { answer: 'c1', why: '', quote: '' },
    r4: { answer: 'c1', why: 'Han søker der.', quote: '' },
  },
};

interface RowResult {
  itemId: string;
  submitted: string | null;
  correct: boolean;
  firstAnswer: string | null;
  keyColumnId?: string;
  why?: string;
  quote?: string;
}

interface Details {
  totalItems: number;
  passedItems: number;
  attempt: number;
  attemptsLeft: number;
  closed: boolean;
  locked: string[];
  items: RowResult[];
}

const grade = (
  submitted: unknown,
  overrides: { content?: unknown; key?: unknown } = {},
) =>
  validator.validate({
    submittedAnswer: submitted,
    expectedAnswers: overrides.key ?? key,
    content: overrides.content ?? content,
    checkSettings: {},
    targetLanguage: 'nb',
  });

const details = (result: ReturnType<typeof grade>) => result.value.details as Details;

const allRight = { r1: 'c1', r2: 'c2', r3: 'c1', r4: 'c1' };

describe('MultipleChoiceGroupValidator — the new form', () => {
  it('counts only the statements the student was shown', () => {
    // `r5` has text and no key, so the projection dropped it. Counting it in the total
    // would mark the table 4/5 for a student who answered every row on the screen.
    const result = grade({ answers: allRight });

    expect(details(result).totalItems).toBe(4);
    expect(result.value.score).toBe(100);
    expect(result.value.correct).toBe(true);
  });

  it('scores the share of correct rows, on 0, 1 and all', () => {
    expect(grade({ answers: { r1: 'c2', r2: 'c1', r3: 'c2', r4: 'c2' } }).value.score).toBe(0);
    expect(grade({ answers: { r1: 'c1', r2: 'c1', r3: 'c2', r4: 'c2' } }).value.score).toBe(25);
    expect(grade({ answers: allRight }).value.score).toBe(100);
  });

  it('counts an unanswered row as wrong rather than dropping it', () => {
    const result = grade({ answers: { r1: 'c1', r2: 'c2', r3: 'c1' } });

    expect(result.value.score).toBe(75);
    const row = details(result).items.find((r) => r.itemId === 'r4');
    expect(row).toMatchObject({ submitted: null, correct: false });
  });

  it('passes exactly at the threshold — `>=`, never `>`', () => {
    // Three of four is 75%, and the pass mark is 70. At exactly 75 the boundary is not
    // tested, so the threshold is moved onto the score itself.
    const at75 = {
      ...content,
      settings: { ...content.settings, passThreshold: 75 },
    };
    const at76 = {
      ...content,
      settings: { ...content.settings, passThreshold: 76 },
    };
    const three = { answers: { r1: 'c1', r2: 'c2', r3: 'c1', r4: 'c2' } };

    expect(grade(three, { content: at75 }).value.passed).toBe(true);
    expect(grade(three, { content: at76 }).value.passed).toBe(false);
  });

  it('reports the pass mark the author set rather than the platform default', () => {
    const strict = { ...content, settings: { ...content.settings, passThreshold: 100 } };

    // 75% is a pass under the platform's default of 70 and a failure under this table's
    // own «all or nothing». The validator is the one that knows.
    const result = grade({ answers: { r1: 'c1', r2: 'c2', r3: 'c1', r4: 'c2' } }, { content: strict });
    expect(result.value.score).toBe(75);
    expect(result.value.passed).toBe(false);
  });

  it('freezes the rows that came out right, and only those', () => {
    // IMPLEMENTATION.md checklist: `retry: 'one'` + `lockCorrect: true`, after a check
    // with two wrong rows exactly those two are editable.
    const result = grade({ answers: { r1: 'c1', r2: 'c1', r3: 'c1', r4: 'c2' } });
    const state = details(result);

    expect(state.locked.sort()).toEqual(['r1', 'r3']);
    expect(state.closed).toBe(false);
    expect(state.attemptsLeft).toBe(1);
  });

  it('freezes nothing when the author switched locking off', () => {
    const open = { ...content, settings: { ...content.settings, lockCorrect: false } };

    expect(details(grade({ answers: { r1: 'c1', r2: 'c1', r3: 'c1', r4: 'c2' } }, { content: open })).locked)
      .toEqual([]);
  });

  it('answers a locked row from the key, whatever the client sent for it', () => {
    // The freeze is the server's or it is nothing: a client free to re-answer a locked
    // row could unlock it for the price of one request.
    const result = grade({
      answers: { r1: 'c2', r2: 'c2', r3: 'c1', r4: 'c1' },
      locked: ['r1'],
      attempt: 2,
    });

    const row = details(result).items.find((r) => r.itemId === 'r1');
    expect(row).toMatchObject({ submitted: 'c1', correct: true });
    expect(result.value.score).toBe(100);
  });

  it('withholds the key while a retry is still available', () => {
    const result = grade({ answers: { r1: 'c2', r2: 'c2', r3: 'c1', r4: 'c1' } });
    const state = details(result);

    expect(state.closed).toBe(false);
    expect(state.items.every((r) => r.keyColumnId === undefined)).toBe(true);
    // Being told *which* rows are wrong is the point of checking, and is not the key.
    expect(state.items.find((r) => r.itemId === 'r1')!.correct).toBe(false);
  });

  it('hands the key over once the attempts are spent', () => {
    const result = grade({ answers: { r1: 'c2', r2: 'c2', r3: 'c1', r4: 'c1' }, attempt: 2 });
    const state = details(result);

    expect(state.closed).toBe(true);
    expect(state.attemptsLeft).toBe(0);
    expect(state.items.find((r) => r.itemId === 'r1')!.keyColumnId).toBe('c1');
  });

  it('hands the key over when the student gives up on the retry', () => {
    const result = grade({ answers: { r1: 'c2', r2: 'c2', r3: 'c1', r4: 'c1' }, reveal: true });
    const state = details(result);

    expect(state.closed).toBe(true);
    expect(state.items.find((r) => r.itemId === 'r1')!.keyColumnId).toBe('c1');
  });

  it('never marks a cell with the key when the author switched revealing off', () => {
    // IMPLEMENTATION.md checklist: `revealKey: false` + spent attempts, no `key` state.
    const hidden = { ...content, settings: { ...content.settings, revealKey: false } };
    const result = grade({ answers: { r1: 'c2', r2: 'c2', r3: 'c1', r4: 'c1' }, attempt: 2 }, { content: hidden });
    const state = details(result);

    expect(state.closed).toBe(true);
    expect(state.items.every((r) => r.keyColumnId === undefined)).toBe(true);
  });

  it('closes the table as soon as every row is right, retry or not', () => {
    const state = details(grade({ answers: allRight }));

    expect(state.closed).toBe(true);
    expect(state.attemptsLeft).toBe(1);
  });

  it('explains the wrong rows only, under the default setting', () => {
    const state = details(grade({ answers: { r1: 'c1', r2: 'c1', r3: 'c1', r4: 'c1' } }));

    expect(state.items.find((r) => r.itemId === 'r2')!.why).toBe('Bergen, ikke Oslo.');
    expect(state.items.find((r) => r.itemId === 'r2')!.quote).toBe('Han søker jobb i Bergen.');
    expect(state.items.find((r) => r.itemId === 'r1')!.why).toBeUndefined();
  });

  it('sends no explanation block for a row that has neither a line nor a quote', () => {
    // IMPLEMENTATION.md checklist, and the reason it is a checklist item: `showWhy:
    // 'always'` must not produce an empty card under every row.
    const always = { ...content, settings: { ...content.settings, showWhy: 'always' } };
    const state = details(grade({ answers: allRight }, { content: always }));

    const bare = state.items.find((r) => r.itemId === 'r3')!;
    expect(bare.why).toBeUndefined();
    expect(bare.quote).toBeUndefined();
    expect(state.items.find((r) => r.itemId === 'r1')!.why).toBe('Første setning.');
  });

  it('records the first answer on the first check and keeps the one it is given after', () => {
    const first = details(grade({ answers: { r1: 'c2', r2: 'c2', r3: 'c1', r4: 'c1' } }));
    expect(first.items.find((r) => r.itemId === 'r1')!.firstAnswer).toBe('c2');

    const second = details(
      grade({
        answers: { r1: 'c1', r2: 'c2', r3: 'c1', r4: 'c1' },
        attempt: 2,
        firstAnswers: { r1: 'c2' },
      }),
    );
    const row = second.items.find((r) => r.itemId === 'r1')!;
    expect(row.submitted).toBe('c1');
    expect(row.correct).toBe(true);
    // The corrected answer scores; the first one is what says whether the text was read.
    expect(row.firstAnswer).toBe('c2');
  });

  it('refuses a submission that is not a map of picks', () => {
    for (const bad of [null, [], { rows: {} }, { answers: [] }, { answers: { r1: 7 } }]) {
      const result = grade(bad);
      expect(result.isFail).toBe(true);
      expect((result.error as { code: string }).code).toBe('SCHEMA_MISMATCH');
    }
  });

  it('refuses a table with no finished statement rather than scoring it 100', () => {
    const empty = { ...content, rows: [{ id: 'r9', text: '' }] };
    const result = grade({ answers: {} }, { content: empty, key: { rows: {} } });

    expect(result.isFail).toBe(true);
    expect((result.error as { code: string }).code).toBe('INVALID_EXERCISE');
  });

  it('never routes to a teacher', () => {
    expect(grade({ answers: allRight }).value.requiresReview).toBe(false);
  });
});
