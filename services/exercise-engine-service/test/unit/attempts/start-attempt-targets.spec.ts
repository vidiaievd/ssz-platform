import { jest } from '@jest/globals';
import { ReviewContextResolver } from '../../../src/modules/attempts/application/services/review-context-resolver.js';
import { StartAttemptHandler } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.handler.js';
import { StartAttemptCommand } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import { Result } from '../../../src/shared/kernel/result.js';
import type { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

// Plan 63 §2 D — what each piece of the exercise is about reaches the attempt at the
// instant it starts, on the envelope the engine already fetches, and the atoms the SRS
// fans out over are the union of the old relation graph and the new addresses.

const ENVELOPE = {
  exercise: {
    templateCode: 'word_bank_gap_fill',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    content: { settings: { input: 'free' }, sentences: [], distractors: [] },
    expectedAnswers: {},
    answerCheckSettings: null,
  },
  template: { answerSchema: {}, defaultCheckSettings: {} },
  axes: { skills: ['written'], focus: ['grammar'], modality: 'recall' },
};

function makeHandler(
  targets: unknown[],
  relationAtoms: Array<{ atomType: string; atomId: string }>,
) {
  const saved: Attempt[] = [];
  const attempts = {
    findInProgress: jest.fn(() => Promise.resolve(null)),
    findLatestReturned: jest.fn(() => Promise.resolve(null)),
    save: jest.fn((attempt: Attempt) => {
      saved.push(attempt);
      return Promise.resolve();
    }),
  };
  const contentClient = {
    getExerciseForAttempt: jest.fn(() => Promise.resolve(Result.ok({ ...ENVELOPE, targets }))),
    getPracticedAtoms: jest.fn(() => Promise.resolve(Result.ok(relationAtoms))),
    getExercisePlacement: jest.fn(() =>
      Promise.resolve(Result.fail({ statusCode: 404, message: 'Not placed' })),
    ),
  };
  const organizationClient = {
    resolveLearnerReviewContext: jest.fn(() =>
      Promise.resolve(Result.fail({ statusCode: 404, message: 'No context' })),
    ),
  };
  const publisher = { publish: jest.fn(() => Promise.resolve()) };

  const handler = new StartAttemptHandler(
    attempts as never,
    contentClient as never,
    new ReviewContextResolver(contentClient as never, organizationClient as never),
    publisher as never,
  );

  return { handler, saved };
}

const command = new StartAttemptCommand('user-1', 'ex-1', 'no', null, null, 'PRACTICE');

describe('StartAttemptHandler — the address travels with the attempt', () => {
  it('snapshots what each piece is about', async () => {
    const { handler, saved } = makeHandler(
      [{ itemKey: 's1#5', atomType: 'grammar_rule_atom', atomId: 'atom-1', role: 'focus' }],
      [],
    );

    await handler.execute(command);

    expect(saved[0]?.itemTargets).toEqual([
      { itemKey: 's1#5', atomType: 'grammar_rule_atom', atomId: 'atom-1', role: 'focus' },
    ]);
    expect(saved[0]?.modality).toBe('recall');
  });

  it('keeps the relation graph beside the addresses rather than replacing it', async () => {
    // The addresses exist for a fraction of the catalogue. Dropping the graph here would
    // quietly empty the fan-out plan 21 has been feeding, for every exercise nobody has
    // addressed — which is most of them. Phase 7 retires the old model, after comparison.
    const { handler, saved } = makeHandler(
      [{ itemKey: 's1#5', atomType: 'grammar_rule_atom', atomId: 'atom-1', role: 'focus' }],
      [{ atomType: 'vocabulary_item', atomId: 'word-1' }],
    );

    await handler.execute(command);

    expect(saved[0]?.practicedAtoms).toEqual([
      { atomType: 'vocabulary_item', atomId: 'word-1' },
      { atomType: 'grammar_rule_atom', atomId: 'atom-1' },
    ]);
  });

  it('counts an atom named twice once', async () => {
    // An addressed exercise names the same atom in both places — the address is the
    // finer statement about an atom the graph already knew — and rating one card twice
    // for one attempt would be the SRS double-counting a single piece of evidence.
    const { handler, saved } = makeHandler(
      [{ itemKey: 's1#5', atomType: 'vocabulary_item', atomId: 'word-1', role: 'focus' }],
      [{ atomType: 'vocabulary_item', atomId: 'word-1' }],
    );

    await handler.execute(command);

    expect(saved[0]?.practicedAtoms).toEqual([{ atomType: 'vocabulary_item', atomId: 'word-1' }]);
  });

  it('starts the attempt for an exercise nobody has addressed', async () => {
    const { handler, saved } = makeHandler([], [{ atomType: 'vocabulary_item', atomId: 'word-9' }]);

    const result = await handler.execute(command);

    expect(result.isOk).toBe(true);
    expect(saved[0]?.itemTargets).toEqual([]);
  });
});
