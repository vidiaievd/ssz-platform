import { jest } from '@jest/globals';
import { DisputeAiReviewHandler } from '../../../src/modules/ai-drafts/application/commands/dispute-ai-review/dispute-ai-review.handler.js';
import { DisputeAiReviewCommand } from '../../../src/modules/ai-drafts/application/commands/dispute-ai-review/dispute-ai-review.command.js';
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

function review(status: AiDraftStatus = 'READY', disputedAt: Date | null = null): AttemptAiDraft {
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
    disputedAt,
    createdAt: REVIEWED,
    updatedAt: REVIEWED,
  });
}

function makeHandler(
  row: Attempt | null,
  stored: AttemptAiDraft | null = review(),
  { marked = true, reread = stored }: { marked?: boolean; reread?: AttemptAiDraft | null } = {},
) {
  const attempts = { findById: jest.fn(() => Promise.resolve(row)) };
  const drafts = {
    findByAttempt: jest.fn<() => Promise<AttemptAiDraft | null>>()
      .mockResolvedValueOnce(stored)
      .mockResolvedValue(reread),
    markDisputed: jest.fn(() => Promise.resolve(marked)),
  };
  const publisher = { publish: jest.fn(() => Promise.resolve()) };
  return {
    handler: new DisputeAiReviewHandler(attempts as never, drafts as never, publisher as never),
    drafts,
    publisher,
  };
}

const run = (handler: DisputeAiReviewHandler, reason: string | null = null, userId = 'student-1') =>
  handler.execute(new DisputeAiReviewCommand('a1', userId, reason));

describe('DisputeAiReviewHandler', () => {
  it('marks the review and tells analytics on the review’s axes, not the learner’s words', async () => {
    const { handler, drafts, publisher } = makeHandler(attempt());

    const result = await run(handler, 'Setning 1 er riktig.');

    expect(result.isOk).toBe(true);
    expect(drafts.markDisputed).toHaveBeenCalledWith('d1', expect.any(Date), 'Setning 1 er riktig.');
    expect(publisher.publish).toHaveBeenCalledWith('exercise.attempt.ai_review_disputed', {
      attemptId: 'a1',
      userId: 'student-1',
      exerciseId: 'ex-1',
      templateCode: 'translate_to_target',
      capability: 'review_direct',
      modelId: 'fake-model',
      promptVersion: 'review_direct@1',
      outcome: 'returned',
      reviewedAt: REVIEWED.toISOString(),
      withReason: true,
      occurredAt: expect.any(String),
    });
    expect(JSON.stringify(publisher.publish.mock.calls)).not.toContain('Setning 1 er riktig.');
  });

  it('counts a press without a word as one too', async () => {
    const { handler, publisher } = makeHandler(attempt());
    await run(handler);
    expect(publisher.publish).toHaveBeenCalledWith(
      'exercise.attempt.ai_review_disputed',
      expect.objectContaining({ withReason: false }),
    );
  });

  it('answers a repeat with the first press and counts nothing', async () => {
    const first = new Date('2026-10-24T11:00:00Z');
    const { handler, drafts, publisher } = makeHandler(attempt(), review('READY', first));

    const result = await run(handler);

    expect(result.value).toEqual({ disputedAt: first });
    expect(drafts.markDisputed).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('loses a race to another press without counting twice', async () => {
    const theirs = new Date('2026-10-24T11:00:00Z');
    const { handler, publisher } = makeHandler(attempt(), review(), {
      marked: false,
      reread: review('READY', theirs),
    });

    expect((await run(handler)).value).toEqual({ disputedAt: theirs });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('refuses somebody else’s attempt', async () => {
    expect((await run(makeHandler(attempt()).handler, null, 'student-2')).error).toEqual({ code: 'FORBIDDEN' });
  });

  it('refuses a teacher’s verdict and work still waiting', async () => {
    const teachers = attempt({ schoolId: 'school-1', reviewedByUserId: 'teacher-1' });
    expect((await run(makeHandler(teachers).handler)).error).toEqual({ code: 'NO_AI_REVIEW' });
    const waiting = attempt({ status: 'ROUTED_FOR_REVIEW', reviewedAt: null });
    expect((await run(makeHandler(waiting).handler)).error).toEqual({ code: 'NO_AI_REVIEW' });
  });

  it('refuses when there is no review to dispute', async () => {
    expect((await run(makeHandler(attempt(), review('FAILED')).handler)).error).toEqual({ code: 'NO_AI_REVIEW' });
    expect((await run(makeHandler(attempt(), null).handler)).error).toEqual({ code: 'NO_AI_REVIEW' });
  });

  it('is not found when the attempt is not', async () => {
    expect((await run(makeHandler(null).handler)).error).toEqual({ code: 'ATTEMPT_NOT_FOUND' });
  });
});
