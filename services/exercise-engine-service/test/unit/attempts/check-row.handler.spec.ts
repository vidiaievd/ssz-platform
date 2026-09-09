import { jest } from '@jest/globals';
import { CheckRowHandler } from '../../../src/modules/attempts/application/commands/check-row/check-row.handler.js';
import { CheckRowCommand } from '../../../src/modules/attempts/application/commands/check-row/check-row.command.js';
import { Result } from '../../../src/shared/kernel/result.js';

// A two-sentence set on the subordinate clause, plus one sentence the author left with a
// word outside the schema — the projection never ships it, and neither does this.
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
    {
      id: 'r3',
      clause: 'sub',
      source: '',
      chunks: [
        { id: 'e1', text: 'at' },
        { id: 'e2', text: 'de' },
      ],
      extras: [],
    },
  ],
  settings: {
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
  },
};

const expectedAnswers = {
  rows: {
    r1: {
      text: 'at han kommer i morgen',
      why: 'Subjunksjonen «at» innleder leddsetningen, og verbet står etter subjektet.',
      fields: { c1: 'f-sub', c2: 'f-subj', c3: 'f-v', c4: 'f-slutt' },
      alt: { c4: ['f-adv'] },
      fb: { c1: 'Subjunksjonen står først i leddsetningen.' },
    },
    r2: {
      text: 'at hun leser boka',
      why: 'Samme regel: subjektet før verbet.',
      fields: { d1: 'f-sub', d2: 'f-subj', d3: 'f-v', d4: 'f-slutt' },
      alt: {},
      fb: {},
    },
    // r3's placements were never finished, so it has no key and cannot be solved.
    r3: { text: '', why: '', fields: { e1: null, e2: null }, alt: {}, fb: {} },
  },
};

const solvedR1 = { 'f-sub': ['c1'], 'f-subj': ['c2'], 'f-v': ['c3'], 'f-slutt': ['c4'] };
const wrongR1 = { 'f-sub': ['c2'], 'f-subj': ['c1'], 'f-v': ['c3'], 'f-slutt': ['c4'] };

function makeAttempt(overrides: Record<string, unknown> = {}) {
  const rows: Array<{
    rowId: string;
    attempts: number;
    placement: Record<string, string[]>;
    solved: boolean;
    revealed: boolean;
  }> = [];

  return {
    id: 'att-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'sentence_schema',
    targetLanguage: 'no',
    get checkedRows() {
      return rows.map((row) => ({ ...row }));
    },
    // The domain's own rules, kept in step with `Attempt.checkRow`: a closed sentence is
    // refused, and a reveal does not spend an attempt.
    checkRow: jest.fn(
      (props: {
        rowId: string;
        placement: Record<string, string[]>;
        solved: boolean;
        revealed: boolean;
      }) => {
        const existing = rows.find((row) => row.rowId === props.rowId);
        if (existing && (existing.solved || existing.revealed)) {
          return Result.fail({ message: `Sentence ${props.rowId} is already closed` });
        }
        const checked = {
          ...props,
          attempts: (existing?.attempts ?? 0) + (props.revealed ? 0 : 1),
        };
        if (existing) rows[rows.indexOf(existing)] = checked;
        else rows.push(checked);
        return Result.ok(checked);
      },
    ),
    ...overrides,
  };
}

function makeHandler(attempt: unknown, document: unknown = { content, expectedAnswers }) {
  const attempts = { findById: jest.fn(() => Promise.resolve(attempt)), save: jest.fn() };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() => Promise.resolve(Result.ok({ exercise: document }))),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = new CheckRowHandler(attempts as any, contentClient as any);
  return { handler, attempts, contentClient };
}

const check = (
  placement: Record<string, string[]> = solvedR1,
  rowId = 'r1',
  reveal = false,
) => new CheckRowCommand('att-1', 'user-1', rowId, placement, reveal);

describe('CheckRowHandler', () => {
  it('marks a solved sentence and hands over the rule and the sentence itself', async () => {
    const { handler, attempts } = makeHandler(makeAttempt());
    const result = await handler.execute(check());

    expect(result.value.result).toMatchObject({
      rowId: 'r1',
      attempt: 1,
      solved: true,
      score: 100,
      text: 'at han kommer i morgen',
    });
    expect(result.value.closed).toBe(1);
    // r3 has no key, so it is not part of the set the student walks through.
    expect(result.value.total).toBe(2);
    expect(attempts.save).toHaveBeenCalled();
  });

  it('withholds the sentence and the rule while the sentence is still open', async () => {
    // `Rett opp` only means something while the answer is unknown, and `row.text` is the
    // word order written out — the answer as a string (plan 52 §3.2).
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(check(wrongR1));

    expect(result.value.result.solved).toBe(false);
    expect(result.value.result.text).toBeNull();
    expect(result.value.result.why).toBeNull();
    expect(JSON.stringify(result.value)).not.toContain('at han kommer i morgen');
  });

  it('sends the resolved note rather than the key the note came from', async () => {
    // The chain is `row.fb[chunkId]` → a default for the kind of mistake → `row.why`, and
    // two thirds of it is the answer key. The client cannot walk it, so the server does.
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(check(wrongR1));

    expect(result.value.result.banner).toEqual({
      source: 'override',
      text: 'Subjunksjonen står først i leddsetningen.',
      code: null,
      hint: '',
    });
    // And no `field` of any chunk travels with it.
    expect(JSON.stringify(result.value)).not.toContain('"c1":"f-sub"');
  });

  it('counts the attempts and escalates to the rule on the second', async () => {
    const attempt = makeAttempt();
    const { handler } = makeHandler(attempt);

    const first = await handler.execute(check(wrongR1));
    const second = await handler.execute(check(wrongR1));

    expect(first.value.result.attempt).toBe(1);
    expect(second.value.result.attempt).toBe(2);
    expect(second.value.result.banner?.hint).toBe(
      'Subjunksjonen «at» innleder leddsetningen, og verbet står etter subjektet.',
    );
    // Unlimited retries: being wrong decides nothing (BEHAVIOR.md, "Student · checking").
    expect(attempt.checkRow).toHaveBeenCalledTimes(2);
  });

  it('shows the solution on request, closes the sentence and scores it nothing', async () => {
    const attempt = makeAttempt();
    const { handler } = makeHandler(attempt);
    const result = await handler.execute(check({}, 'r1', true));

    expect(result.value.result.solution).toEqual(solvedR1);
    expect(result.value.result.solved).toBe(false);
    expect(result.value.result.score).toBe(0);
    expect(result.value.result.why).toBe(
      'Subjunksjonen «at» innleder leddsetningen, og verbet står etter subjektet.',
    );
    // Recorded as revealed, which is the fact the submission is not trusted about.
    expect(attempt.checkedRows[0]).toMatchObject({ rowId: 'r1', revealed: true, attempts: 0 });
  });

  it('refuses to check a sentence that is already closed', async () => {
    // Not the runner's disabled button: a revealed sentence checked again would be the
    // answer handed straight back.
    const { handler } = makeHandler(makeAttempt());
    await handler.execute(check({}, 'r1', true));
    const again = await handler.execute(check(solvedR1));

    expect(again.isFail).toBe(true);
  });

  it('refuses an empty board before anything is written down', async () => {
    const attempt = makeAttempt();
    const { handler, contentClient } = makeHandler(attempt);
    const result = await handler.execute(check({ 'f-sub': [] }));

    expect(result.error).toEqual({ code: 'NOTHING_PLACED' });
    expect(contentClient.getExerciseForAttempt).not.toHaveBeenCalled();
    expect(attempt.checkRow).not.toHaveBeenCalled();
  });

  it('allows a reveal from an empty board — giving up early is a move', async () => {
    const { handler } = makeHandler(makeAttempt());
    expect((await handler.execute(check({}, 'r1', true))).isOk).toBe(true);
  });

  it('refuses a sentence the set does not have', async () => {
    const { handler } = makeHandler(makeAttempt());
    expect((await handler.execute(check(solvedR1, 'gone'))).error).toEqual({
      code: 'ROW_NOT_FOUND',
    });
  });

  it('refuses a sentence the author has left unfinished', async () => {
    // It has no key, the projection never shipped it, and grading it would invent a
    // verdict rather than admit there is none (plan 52 §6.7).
    const { handler } = makeHandler(makeAttempt());
    expect((await handler.execute(check({ 'f-sub': ['e1'] }, 'r3'))).error).toEqual({
      code: 'ROW_NOT_FOUND',
    });
  });

  it('refuses an attempt that is not this student’s', async () => {
    const { handler } = makeHandler(makeAttempt({ userId: 'someone-else' }));
    expect((await handler.execute(check())).error).toEqual({ code: 'FORBIDDEN' });
  });

  it('refuses a template that is not worked through a sentence at a time', async () => {
    const { handler } = makeHandler(makeAttempt({ templateCode: 'writing_task' }));
    expect((await handler.execute(check())).error).toEqual({ code: 'UNSUPPORTED_TEMPLATE' });
  });

  it('refuses a document that is not a set — there are no sentences to check', async () => {
    // A leftover from before the rewrite (plan 52 §8 Q7). Read as an empty set it would
    // answer "no such sentence" about every sentence the exercise has.
    const { handler } = makeHandler(makeAttempt(), {
      content: {
        sentence: 'I morgen skal jeg reise til Bergen.',
        fields: [{ id: 'forfelt', label: 'Forfelt' }],
        tokens: [{ id: 't1', text: 'I morgen' }],
      },
      expectedAnswers: { placements: [{ field_id: 'forfelt', token_ids: ['t1'] }] },
    });

    expect((await handler.execute(check())).error).toEqual({ code: 'UNSUPPORTED_TEMPLATE' });
  });
});
