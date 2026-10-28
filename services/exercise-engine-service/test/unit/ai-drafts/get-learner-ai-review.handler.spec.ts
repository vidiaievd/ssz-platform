import { jest } from '@jest/globals';
import { GetLearnerAiReviewHandler } from '../../../src/modules/ai-drafts/application/queries/get-learner-ai-review/get-learner-ai-review.handler.js';
import { GetLearnerAiReviewQuery } from '../../../src/modules/ai-drafts/application/queries/get-learner-ai-review/get-learner-ai-review.query.js';
import {
  AttemptAiDraft,
  type AiDraftStatus,
} from '../../../src/modules/ai-drafts/domain/entities/attempt-ai-draft.entity.js';
import {
  Attempt,
  type AttemptPersistenceProps,
} from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

const REVIEWED = new Date('2026-10-24T10:00:00Z');

function attempt(props: Partial<AttemptPersistenceProps> = {}): Attempt {
  return Attempt.reconstitute({
    id: 'a1',
    userId: 'student-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'translate_to_target',
    targetLanguage: 'nb',
    difficultyLevel: 'A2',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'RETURNED',
    score: 50,
    passed: false,
    timeSpentSeconds: 300,
    submittedAnswer: { answers: [{ itemId: 'i1', text: 'i går jeg var hjemme' }] },
    validationDetails: null,
    feedback: null,
    answerHash: 'hash',
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date('2026-10-24T09:00:00Z'),
    submittedAt: new Date('2026-10-24T09:30:00Z'),
    scoredAt: null,
    reviewedByUserId: null,
    reviewedAt: REVIEWED,
    reviewComment: 'Se på ordstillingen.',
    reviewDecisions: [{ itemId: 'i1', approved: false }],
    schoolId: null,
    containerId: null,
    groupId: null,
    exercisePath: null,
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    ...props,
  });
}

function review(status: AiDraftStatus = 'READY'): AttemptAiDraft {
  return AttemptAiDraft.restore('d1', {
    attemptId: 'a1',
    capability: 'review_direct',
    status,
    items:
      status === 'FAILED'
        ? []
        : [
            {
              itemId: 'i1',
              sentenceIndex: 0,
              aspect: 'order',
              fragment: 'i går jeg var',
              comment: 'V2: verbet står på andre plass.',
              suggestion: 'i går var jeg',
            },
          ],
    summary: status === 'FAILED' ? null : 'Se på ordstillingen.',
    marks: null,
    errorCode: status === 'FAILED' ? 'invalid_response' : null,
    providerId: 'fake',
    modelId: 'fake-model',
    promptVersion: 'review_direct@1',
    aiCallId: 'call-1',
    createdAt: REVIEWED,
    updatedAt: REVIEWED,
  });
}

function makeHandler(row: Attempt | null, stored: AttemptAiDraft | null = review()) {
  const attempts = { findById: jest.fn(() => Promise.resolve(row)) };
  const drafts = { findByAttempt: jest.fn(() => Promise.resolve(stored)) };
  return { handler: new GetLearnerAiReviewHandler(attempts as never, drafts as never), drafts };
}

const run = (handler: GetLearnerAiReviewHandler, userId = 'student-1') =>
  handler.execute(new GetLearnerAiReviewQuery('a1', userId));

describe('GetLearnerAiReviewHandler', () => {
  // Plan 80, step 3b.
  describe('on a school’s work a model answered first', () => {
    const AT = new Date('2026-10-24T09:31:00Z');
    const COUNTS_AT = new Date('2026-10-31T09:30:00Z');
    const waiting = (over: Partial<AttemptPersistenceProps> = {}) =>
      attempt({
        status: 'ROUTED_FOR_REVIEW',
        score: null,
        passed: null,
        reviewedAt: null,
        reviewComment: null,
        reviewDecisions: null,
        schoolId: 'school-1',
        reviewAiPolicy: { mode: 'ai_then_teacher', autoAcceptAt: COUNTS_AT, teacherDrawn: false },
        provisionalAiVerdict: {
          outcome: 'returned',
          decisions: [{ itemId: 'i1', approved: false }],
          comment: 'Se på ordstillingen.',
          score: 0,
          at: AT,
        },
        ...over,
      });

    it('hands over the review at once, labelled as not counting yet', async () => {
      const result = await run(makeHandler(waiting()).handler);
      expect(result.value).toMatchObject({
        outcome: 'returned',
        summary: 'Se på ordstillingen.',
        reviewedAt: AT,
        disputedAt: null,
        provisional: true,
        countsAt: COUNTS_AT,
      });
    });

    it('goes quiet once the teacher has answered', async () => {
      const decided = waiting({
        status: 'SCORED',
        score: 100,
        passed: true,
        reviewedByUserId: 'teacher-1',
        reviewedAt: REVIEWED,
      });
      expect((await run(makeHandler(decided).handler)).error).toEqual({ code: 'NO_AI_REVIEW' });
    });

    it('says the verdict counted by itself once the term ran out (step 4)', async () => {
      const accepted = waiting({ status: 'RETURNED', reviewedAt: REVIEWED });
      const result = await run(makeHandler(accepted).handler);
      expect(result.value).toMatchObject({
        outcome: 'returned',
        reviewedAt: REVIEWED,
        provisional: false,
        countsAt: null,
        acceptedAtTerm: true,
      });
    });

    it('has nothing before the model answered', async () => {
      const result = await run(makeHandler(waiting({ provisionalAiVerdict: null })).handler);
      expect(result.error).toEqual({ code: 'NO_AI_REVIEW' });
    });
  });

  // Plan 82, step 7.
  it('reads a reading’s review off the voice check, with the check behind it', async () => {
    const reading = { passPercent: 85, prompts: [], carriedItemIds: [] };
    const voice = AttemptAiDraft.restore('d2', {
      attemptId: 'a1',
      capability: 'voice_review',
      status: 'READY',
      items: [],
      summary: null,
      marks: null,
      reading,
      errorCode: null,
      providerId: 'whisper-local',
      modelId: 'nb-whisper-small-verbatim',
      promptVersion: null,
      aiCallId: 'call-2',
      createdAt: REVIEWED,
      updatedAt: REVIEWED,
    });
    const { handler, drafts } = makeHandler(attempt({ templateCode: 'read_aloud' }), voice);

    const result = await run(handler);

    expect(drafts.findByAttempt).toHaveBeenCalledWith('a1', 'voice_review');
    expect(result.value).toMatchObject({ items: [], summary: null, reading });
  });

  // Plan 82, step 8.
  it('hands the learner the reading without the ledger ids of the calls that heard it', async () => {
    const prompt = { itemId: 'p1', transcript: 'jeg bor', words: [], audioMs: 1000, pronunciation: null, check: {}, percent: 100, passed: true, wordsPerMinute: null };
    const reading = { passPercent: 85, prompts: [{ ...prompt, aiCallId: 'call-2' }], carriedItemIds: [] } as never;
    const voice = AttemptAiDraft.restore('d2', {
      attemptId: 'a1',
      capability: 'voice_review',
      status: 'READY',
      items: [],
      summary: null,
      marks: null,
      reading,
      errorCode: null,
      providerId: 'whisper-local',
      modelId: 'nb-whisper-small-verbatim',
      promptVersion: null,
      aiCallId: 'call-2',
      createdAt: REVIEWED,
      updatedAt: REVIEWED,
    });
    const { handler } = makeHandler(attempt({ templateCode: 'read_aloud' }), voice);

    const result = await run(handler);

    expect(result.value.reading?.prompts).toEqual([prompt]);
  });

  it('hands the learner the remarks and the verdict, not the model behind them', async () => {
    const { handler, drafts } = makeHandler(attempt());

    const result = await run(handler);

    expect(result.isOk).toBe(true);
    expect(result.value).toEqual({
      outcome: 'returned',
      items: [expect.objectContaining({ itemId: 'i1', suggestion: 'i går var jeg' })],
      summary: 'Se på ordstillingen.',
      marks: null,
      reading: null,
      reviewedAt: REVIEWED,
      disputedAt: null,
      provisional: false,
      countsAt: null,
      acceptedAtTerm: false,
    });
    expect(JSON.stringify(result.value)).not.toContain('fake-model');
    expect(drafts.findByAttempt).toHaveBeenCalledWith('a1', 'review_direct');
  });

  it('reads an approval as one', async () => {
    const result = await run(makeHandler(attempt({ status: 'SCORED', score: 100, passed: true })).handler);
    expect(result.value.outcome).toBe('approved');
  });

  it('is somebody else’s attempt: forbidden', async () => {
    const result = await run(makeHandler(attempt()).handler, 'student-2');
    expect(result.error).toEqual({ code: 'FORBIDDEN' });
  });

  it('is not found when the attempt is not', async () => {
    expect((await run(makeHandler(null).handler)).error).toEqual({ code: 'ATTEMPT_NOT_FOUND' });
  });

  it('has nothing to show while the verdict has not landed, even with the review stored', async () => {
    const waiting = attempt({ status: 'ROUTED_FOR_REVIEW', reviewedAt: null, score: null, passed: null });
    expect((await run(makeHandler(waiting).handler)).error).toEqual({ code: 'NO_AI_REVIEW' });
  });

  it('has nothing to show on a teacher’s verdict', async () => {
    const teachers = attempt({ schoolId: 'school-1', reviewedByUserId: 'teacher-1' });
    expect((await run(makeHandler(teachers).handler)).error).toEqual({ code: 'NO_AI_REVIEW' });
  });

  it('reads a failed review as none', async () => {
    expect((await run(makeHandler(attempt(), review('FAILED')).handler)).error).toEqual({
      code: 'NO_AI_REVIEW',
    });
  });
});
