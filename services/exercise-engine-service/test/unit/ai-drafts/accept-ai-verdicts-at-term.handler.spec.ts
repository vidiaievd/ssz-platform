import { jest } from '@jest/globals';
import { AcceptAiVerdictsAtTermCommand } from '../../../src/modules/ai-drafts/application/commands/accept-ai-verdicts-at-term/accept-ai-verdicts-at-term.command.js';
import { AcceptAiVerdictsAtTermHandler } from '../../../src/modules/ai-drafts/application/commands/accept-ai-verdicts-at-term/accept-ai-verdicts-at-term.handler.js';
import { AttemptAiDraft } from '../../../src/modules/ai-drafts/domain/entities/attempt-ai-draft.entity.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

// Plan 80, step 4.

const TERM = new Date('2026-11-01T09:00:00Z');
const NOW = new Date('2026-11-01T09:05:00Z');

function provisional(): Attempt {
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
    schoolId: 'school-1',
    containerId: null,
    groupId: null,
    exercisePath: null,
    previousAttemptId: null,
    revisionCount: 0,
  });
  attempt.submit([{ itemId: 'i1', text: 'Jeg har bodd i Tromsø.' }], 'hash');
  attempt.routeForReview(undefined, null, { mode: 'ai_then_teacher', autoAcceptAt: TERM, teacherDrawn: false });
  attempt.reviewByAi({ outcome: 'approved', decisions: [], comment: 'Bra.', score: 100, passed: true });
  attempt.clearDomainEvents();
  return attempt;
}

function review(attemptId: string): AttemptAiDraft {
  return AttemptAiDraft.propose(
    attemptId,
    'review_direct',
    {
      status: 'READY',
      items: [],
      summary: 'Bra.',
      marks: null,
      errorCode: null,
      providerId: 'p1',
      modelId: 'm1',
      promptVersion: 'review_direct@1',
      aiCallId: `call-${attemptId}`,
    },
    NOW,
  );
}

function setup(attempts: Attempt[], opts: { closedMeanwhile?: string[] } = {}) {
  const byId = new Map(attempts.map((a) => [a.id, a]));
  const repo = {
    findDueAiVerdictIds: jest.fn((_now: Date, _limit: number) => Promise.resolve(attempts.map((a) => a.id))),
    findById: jest.fn((id: string) => Promise.resolve(byId.get(id) ?? null)),
    saveIfInReview: jest.fn((a: Attempt) => Promise.resolve(!(opts.closedMeanwhile ?? []).includes(a.id))),
  };
  const drafts = {
    findByAttempt: jest.fn((attemptId: string) => Promise.resolve(review(attemptId))),
  };
  const publisher = { publish: jest.fn((_type: string, _payload: unknown) => Promise.resolve()) };
  const handler = new AcceptAiVerdictsAtTermHandler(repo as never, drafts as never, publisher as never);
  return { handler, repo, publisher };
}

const types = (publisher: { publish: jest.Mock }) => publisher.publish.mock.calls.map((c) => c[0]);

describe('AcceptAiVerdictsAtTermHandler', () => {
  it('closes due work by the model’s verdict and counts it as a model review', async () => {
    const attempt = provisional();
    const { handler, repo, publisher } = setup([attempt]);

    const result = await handler.execute(new AcceptAiVerdictsAtTermCommand(NOW, 50));

    expect(result).toEqual({ accepted: 1, skipped: 0 });
    expect(repo.findDueAiVerdictIds).toHaveBeenCalledWith(NOW, 50);
    expect(attempt.status).toBe('SCORED');
    expect(attempt.acceptedAtTerm).toBe(true);
    expect(types(publisher)).toEqual(['exercise.attempt.completed', 'exercise.attempt.ai_reviewed']);
    expect(publisher.publish.mock.calls[1][1]).toMatchObject({
      attemptId: attempt.id,
      capability: 'review_direct',
      modelId: 'm1',
      outcome: 'approved',
    });
  });

  it('leaves work a teacher has open, until their claim lapses', async () => {
    const attempt = provisional();
    attempt.claimForReview('teacher-1', new Date(NOW.getTime() - 60_000));
    const { handler, repo, publisher } = setup([attempt]);

    expect(await handler.execute(new AcceptAiVerdictsAtTermCommand(NOW))).toEqual({ accepted: 0, skipped: 1 });
    expect(attempt.status).toBe('ROUTED_FOR_REVIEW');
    expect(repo.saveIfInReview).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('publishes nothing when a teacher’s verdict landed between the read and the write', async () => {
    const attempt = provisional();
    const { handler, publisher } = setup([attempt], { closedMeanwhile: [attempt.id] });

    expect(await handler.execute(new AcceptAiVerdictsAtTermCommand(NOW))).toEqual({ accepted: 0, skipped: 1 });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('leaves work whose term the attempt says has not come, whatever the query said', async () => {
    const early = provisional();
    const due = provisional();
    const { handler, publisher } = setup([early, due]);
    // The query said due; the attempt reads its own term — here, not yet.
    const result = await handler.execute(new AcceptAiVerdictsAtTermCommand(new Date(TERM.getTime() - 1)));

    expect(result).toEqual({ accepted: 0, skipped: 2 });
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(due.status).toBe('ROUTED_FOR_REVIEW');
  });
});
