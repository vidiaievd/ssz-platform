import { jest } from '@jest/globals';
import { SelfCheckHandler } from '../../../src/modules/attempts/application/commands/self-check/self-check.handler.js';
import { SelfCheckCommand } from '../../../src/modules/attempts/application/commands/self-check/self-check.command.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Two mistakes in the first sentence — both tense shifts after «sa» — and one in the
// second, where the indirect question keeps the inversion it should have lost.
const content = {
  mode: 'sentences',
  note: '',
  items: [
    { id: 's-0', wrong: 'Anne sa at han har skrivefeil, og hun er glad.' },
    { id: 's-1', wrong: 'Kari spør om har han fagbrev.' },
  ],
  check: { on: true, exactPass: true },
  flow: { selfCheck: 2 },
  hints: { count: true },
};

const expectedAnswers = {
  items: {
    's-0': { ref: 'Anne sa at han hadde skrivefeil, og hun var glad.', alts: [], meta: {} },
    's-1': { ref: 'Kari spør om han har fagbrev.', alts: [], meta: {} },
  },
};

/** The edits that fix the tense in the first sentence and leave everything else alone. */
const fixedTense = { items: { 's-0': { marked: { 4: true }, fix: { 4: 'hadde' }, ins: {} } } };

function makeAttempt(overrides: Record<string, unknown> = {}) {
  let used = (overrides['selfChecksUsed'] as number | undefined) ?? 0;
  return {
    id: 'att-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'error_correction',
    targetLanguage: 'no',
    get selfChecksUsed() {
      return used;
    },
    useSelfCheck: jest.fn((budget: number) => {
      if (used >= budget) return Result.fail({ message: 'All self-checks have been used' });
      used += 1;
      return Result.ok();
    }),
    ...overrides,
  };
}

function makeHandler(attempt: unknown, document = { content, expectedAnswers }) {
  const attempts = { findById: jest.fn(() => Promise.resolve(attempt)), save: jest.fn() };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() => Promise.resolve(Result.ok({ exercise: document }))),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = new SelfCheckHandler(attempts as any, contentClient as any);
  return { handler, attempts, contentClient };
}

const command = (draft: unknown = fixedTense) => new SelfCheckCommand('att-1', 'user-1', draft);

describe('SelfCheckHandler', () => {
  it('counts the mistakes corrected so far, per item and in total', async () => {
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    expect(result.value.fixedCount).toBe(1);
    expect(result.value.spanCount).toBe(3);
    expect(result.value.items).toEqual([
      expect.objectContaining({ itemId: 's-0', fixedCount: 1, spanCount: 2 }),
      expect.objectContaining({ itemId: 's-1', fixedCount: 0, spanCount: 1 }),
    ]);
  });

  it('says nothing about which words are wrong', async () => {
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(command());

    // BEHAVIOR §C.1: counts and flags only. Nothing that names a word, a position or
    // the answer key may cross this boundary before the work is graded.
    const wire = JSON.stringify(result.value);
    expect(wire).not.toContain('hadde');
    expect(wire).not.toContain('Kari spør om han har');
    for (const item of result.value.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['fixedCount', 'fixedSpans', 'itemId', 'spanCount', 'strayEdits'].sort(),
      );
    }
  });

  it('spends one check and reports how many are left', async () => {
    const attempt = makeAttempt();
    const { handler, attempts } = makeHandler(attempt);

    const first = await handler.execute(command());
    expect(first.value.checksUsed).toBe(1);
    expect(first.value.checksLeft).toBe(1);
    expect(attempt.useSelfCheck).toHaveBeenCalledWith(2);
    expect(attempts.save).toHaveBeenCalledWith(attempt);

    const second = await handler.execute(command());
    expect(second.value.checksLeft).toBe(0);

    const third = await handler.execute(command());
    expect(third.isFail).toBe(true);
  });

  it('offers no self-check when the author turned the auto-check off', async () => {
    const attempt = makeAttempt();
    const { handler } = makeHandler(attempt, {
      content: { ...content, check: { ...content.check, on: false } },
      expectedAnswers,
    });

    const result = await handler.execute(command());

    expect(result.isFail).toBe(true);
    // The budget the entity is asked to spend against is zero, not `flow.selfCheck`.
    expect(attempt.useSelfCheck).toHaveBeenCalledWith(0);
  });

  it('names the types of the mistakes still open only when the author asked for it', async () => {
    const withTypes = makeHandler(makeAttempt(), {
      content: { ...content, hints: { ...content.hints, showType: true } },
      expectedAnswers,
    });
    const shown = await withTypes.handler.execute(command());
    expect(shown.value.items[0]?.remainingTypes).toHaveLength(1);

    const { handler } = makeHandler(makeAttempt());
    const hidden = await handler.execute(command());
    expect(hidden.value.items[0]?.remainingTypes).toBeUndefined();
  });

  it('reports edits made where there was no mistake', async () => {
    const { handler } = makeHandler(makeAttempt());
    const result = await handler.execute(
      command({ items: { 's-0': { marked: { 1: true }, fix: { 1: 'sier' }, ins: {} } } }),
    );

    expect(result.value.items[0]?.strayEdits).toBe(1);
  });

  it('refuses an attempt belonging to someone else, without fetching the key', async () => {
    const { handler, contentClient } = makeHandler(makeAttempt({ userId: 'someone-else' }));
    const result = await handler.execute(command());

    expect(result.error).toEqual({ code: 'FORBIDDEN' });
    expect(contentClient.getExerciseForAttempt).not.toHaveBeenCalled();
  });

  it('refuses a template with no self-check', async () => {
    const { handler } = makeHandler(makeAttempt({ templateCode: 'word_bank_gap_fill' }));
    const result = await handler.execute(command());

    expect(result.error).toEqual({ code: 'UNSUPPORTED_TEMPLATE' });
  });

  it('rejects a draft that is not a set of edits', async () => {
    const { handler, contentClient } = makeHandler(makeAttempt());
    const result = await handler.execute(command({ items: [] }));

    expect(result.error).toEqual({ code: 'SCHEMA_MISMATCH' });
    expect(contentClient.getExerciseForAttempt).not.toHaveBeenCalled();
  });

  it('reports a missing attempt rather than throwing', async () => {
    const { handler } = makeHandler(null);
    const result = await handler.execute(command());
    expect(result.error).toEqual({ code: 'ATTEMPT_NOT_FOUND' });
  });

  // The second template with a self-check. Same budget, same rule about the key — but
  // here the key is a whole sentence, so the diff is masked rather than withheld.
  describe('translate', () => {
    const trContent = {
      dir: 'to_target',
      langs: { explain: 'Russisk', target: 'Norsk' },
      format: 'set',
      items: [
        { id: 't-0', dir: 'to_target', source: 'Я живу в Тромсё уже три года.' },
        { id: 't-1', dir: 'to_target', source: 'Мне нравятся кошки.' },
      ],
      check: { on: true, exactPass: true },
      flow: { selfCheck: 2, showRefs: 'afterGraded' },
    };

    const trAnswers = {
      items: {
        't-0': {
          refs: ['Jeg har bodd i Tromsø i tre år nå.'],
          require: [{ text: 'har bodd', note: 'Презенс перфект.' }],
        },
        't-1': { refs: ['Jeg liker katter.'] },
      },
    };

    const trHandler = (draftAnswer: unknown, overrides: Record<string, unknown> = {}) => {
      const attempt = makeAttempt({ templateCode: 'translate_to_target', ...overrides });
      const { handler } = makeHandler(attempt, {
        content: trContent,
        expectedAnswers: trAnswers,
      });
      return {
        attempt,
        run: () => handler.execute(new SelfCheckCommand('att-1', 'user-1', draftAnswer)),
      };
    };

    const draft = (answers: Record<string, string>) => ({
      answers: Object.entries(answers).map(([itemId, text]) => ({ itemId, text })),
    });

    it('scores each sentence and counts the ones a hit would close', async () => {
      const result = await trHandler(
        draft({ 't-0': 'Jeg bor i Tromsø i tre år nå.', 't-1': 'Jeg liker katter.' }),
      ).run();

      expect(result.isOk).toBe(true);
      expect(result.value.templateCode).toBe('translate_to_target');
      expect(result.value.passing).toBe(1);
      expect(result.value.items).toEqual([
        expect.objectContaining({ itemId: 't-0', verdict: 'near' }),
        expect.objectContaining({ itemId: 't-1', verdict: 'exact' }),
      ]);
    });

    // The rule that makes a budget necessary in the first place: without masking, three
    // self-checks against an empty answer would spell the key out word by word.
    it('masks the words of the key the student has not written', async () => {
      const result = await trHandler(draft({ 't-0': 'Jeg bor i Tromsø i tre år nå.' })).run();

      const tokens = result.value.items[0]?.tokens ?? [];
      // The diff shows what the student wrote and where a word is owed — never which.
      expect(tokens.filter((token) => token.t === 'missing')).toEqual([
        { t: 'missing', w: '•••', typo: null },
        { t: 'missing', w: '•••', typo: null },
      ]);
      expect(tokens.map((token) => token.w)).not.toContain('bodd');
    });

    // A fired guard is the one deviation the engine can name exactly, so it travels
    // with the author's explanation attached.
    it('names the rules of the task the answer does not meet', async () => {
      const result = await trHandler(draft({ 't-0': 'Jeg bor i Tromsø i tre år nå.' })).run();

      expect(result.value.items[0]?.missing).toEqual([
        { text: 'har bodd', note: 'Презенс перфект.' },
      ]);
    });

    it('spends the same budget as any other self-check', async () => {
      const { attempt, run } = trHandler(draft({ 't-1': 'Jeg liker katter.' }));
      const result = await run();

      expect(attempt.useSelfCheck).toHaveBeenCalledWith(2);
      expect(result.value.checksUsed).toBe(1);
      expect(result.value.checksLeft).toBe(1);
    });

    it('rejects a draft that is not a list of answers, without fetching the key', async () => {
      const attempt = makeAttempt({ templateCode: 'translate_to_target' });
      const { handler, contentClient } = makeHandler(attempt, {
        content: trContent,
        expectedAnswers: trAnswers,
      });

      const result = await handler.execute(
        new SelfCheckCommand('att-1', 'user-1', { items: { 't-0': 'Jeg bor her.' } }),
      );

      expect(result.error).toEqual({ code: 'SCHEMA_MISMATCH' });
      expect(contentClient.getExerciseForAttempt).not.toHaveBeenCalled();
    });
  });
});
