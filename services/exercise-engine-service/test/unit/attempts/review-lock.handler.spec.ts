import { jest } from '@jest/globals';
import { ClaimReviewHandler } from '../../../src/modules/attempts/application/commands/claim-review/claim-review.handler.js';
import { ClaimReviewCommand } from '../../../src/modules/attempts/application/commands/claim-review/claim-review.command.js';
import { ReleaseReviewHandler } from '../../../src/modules/attempts/application/commands/release-review/release-review.handler.js';
import { ReleaseReviewCommand } from '../../../src/modules/attempts/application/commands/release-review/release-review.command.js';
import {
  Attempt,
  REVIEW_CLAIM_TTL_MS,
  type AttemptPersistenceProps,
} from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

const SCHOOL = 'school-1';
const ME = 'teacher-1';
const COLLEAGUE = 'teacher-2';

function attempt(props: Partial<AttemptPersistenceProps> = {}): Attempt {
  return Attempt.reconstitute({
    id: 'a1',
    userId: 'student-1',
    exerciseId: 'ex-1',
    assignmentId: null,
    enrollmentId: null,
    templateCode: 'translate_to_target',
    targetLanguage: 'no',
    difficultyLevel: 'B1',
    checkMode: 'GRADED',
    practicedAtoms: [],
    status: 'ROUTED_FOR_REVIEW',
    score: null,
    passed: null,
    timeSpentSeconds: 60,
    submittedAnswer: [{ itemId: 'i1', text: 'Jeg har bodd i Tromsø.' }],
    validationDetails: null,
    feedback: null,
    answerHash: 'hash',
    revisionCount: 0,
    recheckCount: 0,
    answersRevealed: false,
    selfChecksUsed: 0,
    startedAt: new Date('2026-08-17T09:00:00Z'),
    submittedAt: new Date('2026-08-17T09:40:00Z'),
    scoredAt: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewComment: null,
    reviewDecisions: null,
    schoolId: SCHOOL,
    containerId: 'course-1',
    groupId: 'group-1',
    exercisePath: { course: 'Ny i Norge A2', module: 'Leksjon 7', exercise: 'Perfektum' },
    reviewClaimedBy: null,
    reviewClaimedAt: null,
    previousAttemptId: null,
    autoPassedItems: null,
    totalItems: null,
    ...props,
  });
}

function makeHandlers(row: Attempt | null) {
  const attempts = {
    findById: jest.fn(() => Promise.resolve(row)),
    save: jest.fn(() => Promise.resolve()),
  };
  return {
    attempts,
    claim: new ClaimReviewHandler(attempts as never),
    release: new ReleaseReviewHandler(attempts as never),
  };
}

const held = (teacherId: string, agoMs: number) => ({
  reviewClaimedBy: teacherId,
  reviewClaimedAt: new Date(Date.now() - agoMs),
});

describe('ClaimReviewHandler', () => {
  it('places the marker and says how long it holds', async () => {
    const row = attempt();
    const { claim, attempts } = makeHandlers(row);

    const result = await claim.execute(new ClaimReviewCommand('a1', SCHOOL, ME));

    expect(result.isFail).toBe(false);
    expect(result.value.mine).toBe(true);
    expect(result.value.lock?.teacherId).toBe(ME);
    const heldFor = result.value.lock!.expiresAt.getTime() - Date.now();
    expect(heldFor).toBeGreaterThan(REVIEW_CLAIM_TTL_MS - 5_000);
    expect(heldFor).toBeLessThanOrEqual(REVIEW_CLAIM_TTL_MS);
    expect(attempts.save).toHaveBeenCalledTimes(1);
  });

  it('extends when the same reviewer claims again', async () => {
    const row = attempt(held(ME, REVIEW_CLAIM_TTL_MS - 60_000));
    const { claim } = makeHandlers(row);

    const result = await claim.execute(new ClaimReviewCommand('a1', SCHOOL, ME));

    expect(result.value.mine).toBe(true);
    expect(result.value.lock!.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      REVIEW_CLAIM_TTL_MS - 5_000,
    );
  });

  it("does not displace a colleague's live marker, and does not refuse either", async () => {
    const row = attempt(held(COLLEAGUE, 60_000));
    const { claim, attempts } = makeHandlers(row);

    const result = await claim.execute(new ClaimReviewCommand('a1', SCHOOL, ME));

    expect(result.isFail).toBe(false);
    expect(result.value.mine).toBe(false);
    expect(result.value.lock?.teacherId).toBe(COLLEAGUE);
    expect(row.reviewClaimedBy).toBe(COLLEAGUE);
    // Nothing changed, so nothing was written.
    expect(attempts.save).not.toHaveBeenCalled();
  });

  it('takes over a marker that has lapsed', async () => {
    const row = attempt(held(COLLEAGUE, REVIEW_CLAIM_TTL_MS + 1_000));
    const { claim } = makeHandlers(row);

    const result = await claim.execute(new ClaimReviewCommand('a1', SCHOOL, ME));

    expect(result.value.mine).toBe(true);
    expect(result.value.lock?.teacherId).toBe(ME);
  });

  it('refuses a submission that is not waiting on anyone', async () => {
    const row = attempt({ status: 'SCORED', score: 90, reviewedByUserId: COLLEAGUE });
    const { claim, attempts } = makeHandlers(row);

    const result = await claim.execute(new ClaimReviewCommand('a1', SCHOOL, ME));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'NOT_WAITING_FOR_REVIEW' });
    expect(attempts.save).not.toHaveBeenCalled();
  });

  it('is not found when the caller names another school', async () => {
    const { claim } = makeHandlers(attempt());

    const result = await claim.execute(new ClaimReviewCommand('a1', 'school-2', ME));

    expect(result.error).toEqual({ code: 'ATTEMPT_NOT_FOUND' });
  });

  it('is not found when there is no such attempt', async () => {
    const { claim } = makeHandlers(null);

    expect((await claim.execute(new ClaimReviewCommand('a1', SCHOOL, ME))).isFail).toBe(true);
  });
});

describe('ReleaseReviewHandler', () => {
  it('lifts the reviewer’s own marker', async () => {
    const row = attempt(held(ME, 60_000));
    const { release, attempts } = makeHandlers(row);

    const result = await release.execute(new ReleaseReviewCommand('a1', SCHOOL, ME));

    expect(result.value).toEqual({ lock: null, mine: false });
    expect(row.reviewClaimedBy).toBeNull();
    expect(attempts.save).toHaveBeenCalledTimes(1);
  });

  it("leaves a colleague's marker standing", async () => {
    const row = attempt(held(COLLEAGUE, 60_000));
    const { release, attempts } = makeHandlers(row);

    const result = await release.execute(new ReleaseReviewCommand('a1', SCHOOL, ME));

    expect(result.value.lock?.teacherId).toBe(COLLEAGUE);
    expect(row.reviewClaimedBy).toBe(COLLEAGUE);
    expect(attempts.save).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing was held', async () => {
    const row = attempt();
    const { release } = makeHandlers(row);

    expect((await release.execute(new ReleaseReviewCommand('a1', SCHOOL, ME))).value).toEqual({
      lock: null,
      mine: false,
    });
  });

  it('still releases after the verdict has been delivered', async () => {
    const row = attempt({ status: 'SCORED', score: 90, ...held(ME, 60_000) });
    const { release } = makeHandlers(row);

    const result = await release.execute(new ReleaseReviewCommand('a1', SCHOOL, ME));

    expect(result.isFail).toBe(false);
    expect(result.value.lock).toBeNull();
  });
});

describe('a verdict clears the marker', () => {
  it('leaves nothing behind when the submission is approved', () => {
    const row = attempt(held(ME, 60_000));

    const reviewed = row.review({
      reviewerId: ME,
      outcome: 'approved',
      decisions: [{ itemId: 'i1', approved: true }],
      comment: null,
      score: 100,
    });

    expect(reviewed.isFail).toBe(false);
    expect(row.activeReviewLock()).toBeNull();
  });

  it('leaves nothing behind when the submission is returned', () => {
    const row = attempt(held(ME, 60_000));

    row.review({
      reviewerId: ME,
      outcome: 'returned',
      decisions: [],
      comment: 'Se på perfektum.',
    });

    expect(row.activeReviewLock()).toBeNull();
  });
});
