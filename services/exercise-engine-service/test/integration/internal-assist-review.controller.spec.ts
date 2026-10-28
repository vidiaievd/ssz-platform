import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Result } from '../../src/shared/kernel/result.js';
import type { Attempt } from '../../src/modules/attempts/domain/entities/attempt.entity.js';
import { InternalAssistReviewController, toAssistReviewedWork } from '../../src/modules/attempts/presentation/controllers/internal-assist-review.controller.js';

// Plan 83, step 2: the learner's own reviewed work, for the student assistant.

const ATTEMPT = 'a0000000-0000-4000-8000-000000000083';

function attempt(overrides: Partial<Record<keyof Attempt, unknown>> = {}): Attempt {
  return {
    id: ATTEMPT,
    exerciseId: 'ex-1',
    containerId: 'course-1',
    templateCode: 'translate',
    status: 'RETURNED',
    reviewedBy: 'teacher',
    reviewedAt: new Date('2026-10-27T10:00:00Z'),
    scoreValue: null,
    passed: null,
    submittedAnswer: { sentences: [{ itemId: 'i1', text: 'Jeg bor i Oslo i to år.' }] },
    // The key sits here for some validators; it must never be read.
    validationDetails: { expected: ['Jeg har bodd i Oslo i to år'] },
    reviewComment: 'Подумай о времени глагола.',
    reviewDecisions: [{ itemId: 'i1', approved: false, comment: 'har bodd' }, { itemId: 'i2', approved: true }],
    rubricMarks: null,
    ...overrides,
  } as unknown as Attempt;
}

describe('toAssistReviewedWork', () => {
  it('carries the answer and the review, never the validation details', () => {
    const work = toAssistReviewedWork(attempt())!;
    expect(work).toEqual({
      attemptId: ATTEMPT,
      exerciseId: 'ex-1',
      courseId: 'course-1',
      templateCode: 'translate',
      status: 'RETURNED',
      reviewedBy: 'teacher',
      reviewedAt: '2026-10-27T10:00:00.000Z',
      score: null,
      passed: null,
      answer: { sentences: [{ itemId: 'i1', text: 'Jeg bor i Oslo i to år.' }] },
      comment: 'Подумай о времени глагола.',
      decisions: [
        { itemId: 'i1', approved: false, comment: 'har bodd' },
        { itemId: 'i2', approved: true, comment: null },
      ],
      rubricMarks: null,
    });
    expect(JSON.stringify(work)).not.toContain('Jeg har bodd i Oslo');
  });

  it('is null before a verdict is delivered (R-g)', () => {
    expect(toAssistReviewedWork(attempt({ reviewedBy: null, status: 'ROUTED_FOR_REVIEW' }))).toBeNull();
  });
});

describe('InternalAssistReviewController', () => {
  const controller = (result: Result<Attempt, unknown>) => {
    const queryBus = { execute: jest.fn().mockResolvedValue(result) };
    return { queryBus, c: new InternalAssistReviewController(queryBus as never) };
  };

  it('asks for the attempt as the named learner', async () => {
    const { c, queryBus } = controller(Result.ok(attempt()));
    await c.get(ATTEMPT, 'user-1');
    expect(queryBus.execute.mock.calls[0][0]).toMatchObject({ attemptId: ATTEMPT, userId: 'user-1' });
  });

  it('is 404 for another learner\'s attempt, as for an unknown one', async () => {
    await expect(controller(Result.fail({ code: 'FORBIDDEN' })).c.get(ATTEMPT, 'user-2')).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller(Result.fail({ code: 'ATTEMPT_NOT_FOUND' })).c.get(ATTEMPT, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is 409 before the verdict', async () => {
    const { c } = controller(Result.ok(attempt({ reviewedBy: null })));
    await expect(c.get(ATTEMPT, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
