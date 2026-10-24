import { jest } from '@jest/globals';
import { GiveUpAiReviewCommand } from '../../../src/modules/ai-drafts/application/commands/give-up-ai-review/give-up-ai-review.command.js';
import { GiveUpAiReviewHandler } from '../../../src/modules/ai-drafts/application/commands/give-up-ai-review/give-up-ai-review.handler.js';
import {
  AttemptAiDraft,
  type ProposedDraft,
} from '../../../src/modules/ai-drafts/domain/entities/attempt-ai-draft.entity.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

// Plan 79, step 2.2a.

function routed(schoolId: string | null = null): Attempt {
  const attempt = Attempt.create({
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    checkMode: 'GRADED',
    practicedAtoms: [],
    axes: { skills: [], focus: [] },
  });
  attempt.snapshotReviewContext({
    schoolId,
    containerId: null,
    groupId: null,
    exercisePath: null,
    previousAttemptId: null,
    revisionCount: 0,
  });
  attempt.submit([{ itemId: 'i1', text: 'Jeg bor i Tromsø.' }], 'hash');
  attempt.routeForReview();
  attempt.clearDomainEvents();
  return attempt;
}

const proposed = (status: ProposedDraft['status']): ProposedDraft => ({
  status,
  items: [],
  summary: status === 'READY' ? 'Bra.' : null,
  marks: null,
  errorCode: status === 'FAILED' ? 'invalid_response' : null,
  providerId: null,
  modelId: null,
  promptVersion: 'review_direct@1',
  aiCallId: 'call-1',
});

function setup(attempt: Attempt | null, review: AttemptAiDraft | null = null) {
  const attempts = {
    findById: jest.fn(() => Promise.resolve(attempt)),
    save: jest.fn(() => Promise.resolve()),
  };
  const drafts = { findByAttempt: jest.fn(() => Promise.resolve(review)) };
  const handler = new GiveUpAiReviewHandler(attempts as never, drafts as never);
  const run = () => handler.execute(new GiveUpAiReviewCommand('attempt-1', 'refused', 'call-1'));
  return { run, attempts, drafts };
}

describe('GiveUpAiReviewHandler', () => {
  it('closes a learner’s routed work as NO_REVIEWER and saves it', async () => {
    const attempt = routed();
    const { run, attempts } = setup(attempt);

    const result = await run();

    expect(result.isOk && result.value.status).toBe('NO_REVIEWER');
    expect(attempts.save).toHaveBeenCalledWith(attempt);
    expect(attempt.getDomainEvents()).toHaveLength(0);
  });

  it('answers a repeat from the row, without saving again', async () => {
    const attempt = routed();
    attempt.giveUpReview();
    const { run, attempts } = setup(attempt);

    const result = await run();

    expect(result.isOk && result.value.status).toBe('NO_REVIEWER');
    expect(attempts.save).not.toHaveBeenCalled();
  });

  it('closes past a failed review — there is no text to keep', async () => {
    const attempt = routed();
    const failed = AttemptAiDraft.propose(attempt.id, 'review_direct', proposed('FAILED'), new Date());
    const { run } = setup(attempt, failed);

    expect((await run()).isOk).toBe(true);
    expect(attempt.status).toBe('NO_REVIEWER');
  });

  it('refuses while a ready review waits for its verdict to be written', async () => {
    const attempt = routed();
    const ready = AttemptAiDraft.propose(attempt.id, 'review_direct', proposed('READY'), new Date());
    const { run, attempts } = setup(attempt, ready);

    const result = await run();

    expect(result.isFail && result.error.code).toBe('REVIEW_EXISTS');
    expect(attempt.status).toBe('ROUTED_FOR_REVIEW');
    expect(attempts.save).not.toHaveBeenCalled();
  });

  it('leaves a school’s work to its teacher', async () => {
    const { run } = setup(routed('school-1'));
    const result = await run();
    expect(result.isFail && result.error.code).toBe('HAS_TEACHER_REVIEW');
  });

  it('refuses work that is not waiting for review', async () => {
    const attempt = routed();
    attempt.reviewByAi({ outcome: 'approved', decisions: [{ itemId: 'i1', approved: true }], comment: null, score: 100, passed: true });
    const { run } = setup(attempt);
    const result = await run();
    expect(result.isFail && result.error.code).toBe('ATTEMPT_NOT_IN_REVIEW');
  });

  it('404s an unknown attempt', async () => {
    const { run } = setup(null);
    const result = await run();
    expect(result.isFail && result.error.code).toBe('ATTEMPT_NOT_FOUND');
  });
});
