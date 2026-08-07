import { jest } from '@jest/globals';
import { SubmitAnswerHandler } from '../../../src/modules/attempts/application/commands/submit-answer/submit-answer.handler.js';
import { SubmitAnswerCommand } from '../../../src/modules/attempts/application/commands/submit-answer/submit-answer.command.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import { Result } from '../../../src/shared/kernel/result.js';

// Plan 35 §5.4. `word_bank_gap_fill` absorbed `fill_in_blank`, so one template now
// covers both choosing a word out of five and typing it from memory. Those are not
// equal evidence of knowing it, and after the merge no templateCode tells them apart —
// without this field the merge would make spaced repetition worse than it was.

const gapFillContent = (overrides: Record<string, unknown> = {}) => ({
  settings: {
    shuffle: true,
    allowReuse: false,
    showBankCount: true,
    caseSensitive: false,
    input: 'bank',
    ...overrides,
  },
  sentences: [
    { id: 's1', text: 'Jeg vil gjerne bestille en kaffe.', gaps: [3] },
    { id: 's2', text: 'Kan jeg få regningen, takk?', gaps: [3] },
  ],
  distractors: ['bestilt', 'regning'],
});

/** In progress, so the handler itself makes the submit → score transition. */
function makeAttempt(templateCode: string) {
  return Attempt.reconstitute({
    id: 'attempt-1',
    userId: 'user-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode,
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    checkMode: 'PRACTICE',
    practicedAtoms: [],
    status: 'IN_PROGRESS',
    score: null,
    passed: null,
    timeSpentSeconds: 0,
    submittedAnswer: null,
    validationDetails: null,
    feedback: null,
    answerHash: null,
    revisionCount: 0,
    answersRevealed: false,
    startedAt: new Date(),
    submittedAt: null,
    scoredAt: null,
  });
}

/** Runs a submission and returns the payload of the published completion event. */
async function publishedPayload(
  templateCode: string,
  content: unknown,
  validationDetails: unknown = null,
) {
  const attempt = makeAttempt(templateCode);
  const published: Array<{ type: string; payload: Record<string, unknown> }> = [];

  const handler = new SubmitAnswerHandler(
    { findById: jest.fn(() => Promise.resolve(attempt)), save: jest.fn() } as never,
    {
      getExerciseForAttempt: jest.fn(() =>
        Promise.resolve(
          Result.ok({
            exercise: {
              id: 'ex-1',
              templateCode,
              targetLanguage: 'no',
              difficultyLevel: 'B1',
              content,
              expectedAnswers: {},
              answerCheckSettings: null,
            },
            template: {
              code: templateCode,
              contentSchema: {},
              answerSchema: {},
              defaultCheckSettings: {},
              supportedLanguages: null,
            },
            instruction: null,
          }),
        ),
      ),
    } as never,
    {
      validate: jest.fn(() =>
        Promise.resolve(
          Result.ok({
            correct: true,
            score: 100,
            details: validationDetails,
            requiresReview: false,
          }),
        ),
      ),
    } as never,
    { generate: jest.fn(() => Result.ok({ summary: 'Bra!' })) } as never,
    { createSubmission: jest.fn(() => Promise.resolve(Result.ok(undefined))) } as never,
    {
      publish: jest.fn((type: string, payload: Record<string, unknown>) => {
        published.push({ type, payload });
        return Promise.resolve();
      }),
    } as never,
  );

  await handler.execute(new SubmitAnswerCommand(attempt.id, 'user-1', {}, 5, 'en'));
  return published.find((e) => e.type === 'exercise.attempt.completed')?.payload;
}

describe('the answer form in the attempt completed event', () => {
  it('reports a closed bank, its size, and that words are spent', async () => {
    const payload = await publishedPayload('word_bank_gap_fill', gapFillContent());

    expect(payload?.['answerForm']).toEqual({
      mode: 'bank',
      bankSize: 4, // two answers plus two distractors
      wordsConsumed: true,
    });
  });

  it('reports no bank at all when the learner types the word', async () => {
    const payload = await publishedPayload('word_bank_gap_fill', gapFillContent({ input: 'free' }));

    expect(payload?.['answerForm']).toEqual({
      mode: 'free',
      bankSize: null,
      wordsConsumed: true,
    });
  });

  it('reports that words are not spent when they may be reused', async () => {
    // Seven words for ten gaps: using one narrows nothing, so the exercise is
    // easier than the same bank spent once.
    const payload = await publishedPayload(
      'word_bank_gap_fill',
      gapFillContent({ allowReuse: true }),
    );

    expect(payload?.['answerForm']).toMatchObject({ wordsConsumed: false });
  });

  it('says nothing for a template that cannot say', async () => {
    const payload = await publishedPayload('fill_in_blank', {
      text_with_blanks: 'Jeg ___1___ norsk',
    });

    // Absent rather than null: an event without the field is exactly what every
    // publisher sent before this existed, and the consumer already handles it.
    expect(payload).not.toHaveProperty('answerForm');
  });

  it('leaves the rest of the payload alone', async () => {
    const payload = await publishedPayload('word_bank_gap_fill', gapFillContent());

    expect(payload).toMatchObject({
      userId: 'user-1',
      exerciseId: 'ex-1',
      score: 100,
      completed: true,
      templateCode: 'word_bank_gap_fill',
      passed: true,
    });
  });
});

// Plan 36 §C.1. One card per gap instead of one per exercise, so that a block of six
// sentences with one word wrong brings back the one and not the six.
describe('the per-gap verdicts in the attempt completed event', () => {
  const graded = {
    totalGaps: 2,
    correctGaps: 1,
    gaps: [
      { gapKey: 's1:3', correct: true, explanation: null },
      { gapKey: 's2:3', correct: false, explanation: 'Feil ordklasse.' },
    ],
  };

  it('carries the verdict for each gap, in gap order', async () => {
    const payload = await publishedPayload('word_bank_gap_fill', gapFillContent(), graded);

    expect(payload?.['gapResults']).toEqual([
      { gapKey: 's1:3', correct: true },
      { gapKey: 's2:3', correct: false },
    ]);
  });

  it('leaves the explanation behind', async () => {
    // The explanation is feedback owed to the learner. The scheduler has no use for
    // it, and events are not the place for text that nothing reads.
    const payload = await publishedPayload('word_bank_gap_fill', gapFillContent(), graded);
    const gaps = payload?.['gapResults'] as Array<Record<string, unknown>>;

    expect(gaps.every((gap) => !('explanation' in gap))).toBe(true);
  });

  it('says nothing for a template not graded gap by gap', async () => {
    const payload = await publishedPayload(
      'short_answer',
      { question: 'Hvorfor?' },
      { target: 'fordi', matched: true },
    );

    expect(payload).not.toHaveProperty('gapResults');
  });

  it('says nothing when the validator reported no gaps', async () => {
    const payload = await publishedPayload('word_bank_gap_fill', gapFillContent(), null);

    expect(payload).not.toHaveProperty('gapResults');
  });
});
