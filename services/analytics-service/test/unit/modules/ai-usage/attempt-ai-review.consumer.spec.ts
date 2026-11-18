import { foldOf } from '../../../../src/modules/ai-usage/consumers/attempt-ai-review.consumer.js';

const axes = {
  attemptId: 'a1',
  userId: 'u1',
  exerciseId: 'e1',
  templateCode: 'translate_to_target',
  capability: 'review_direct',
  modelId: 'fake-model',
  promptVersion: 'review_direct@1',
  outcome: 'approved',
};

describe('AttemptAiReviewConsumer — foldOf (plan 79, 2.3b)', () => {
  it('adds a delivered review on its own day', () => {
    expect(foldOf('exercise.attempt.ai_reviewed', { ...axes, occurredAt: '2026-10-24T23:10:00.000Z' })).toEqual({
      capability: 'review_direct',
      modelId: 'fake-model',
      promptVersion: 'review_direct@1',
      templateCode: 'translate_to_target',
      day: '2026-10-24',
      column: 'reviews',
    });
  });

  // Plan 90, phase 7, step 10.
  it('folds an event without a template on the "not recorded" row', () => {
    const { templateCode: _dropped, ...noTemplate } = axes;
    expect(foldOf('exercise.attempt.ai_reviewed', { ...noTemplate, occurredAt: '2026-10-24T10:00:00Z' })).toMatchObject({
      templateCode: null,
      column: 'reviews',
    });
    expect(
      foldOf('exercise.attempt.ai_review_disputed', {
        ...axes,
        reviewedAt: '2026-10-24T10:00:00Z',
        withReason: true,
        occurredAt: '2026-10-25T10:00:00Z',
      }),
    ).toMatchObject({ templateCode: 'translate_to_target', column: 'disputes' });
  });

  it('adds a dispute on its review’s day, not on the day it was pressed', () => {
    const fold = foldOf('exercise.attempt.ai_review_disputed', {
      ...axes,
      reviewedAt: '2026-10-24T23:10:00.000Z',
      withReason: false,
      occurredAt: '2026-10-26T08:00:00.000Z',
    });
    expect(fold).toMatchObject({ day: '2026-10-24', column: 'disputes' });
  });

  it('reads nothing it cannot fold', () => {
    expect(foldOf('exercise.attempt.ai_review_disputed', { ...axes, occurredAt: '2026-10-24T10:00:00Z' })).toBeNull();
    expect(foldOf('exercise.attempt.ai_reviewed', { ...axes, capability: 7, occurredAt: '2026-10-24T10:00:00Z' })).toBeNull();
    expect(foldOf('exercise.attempt.reviewed', { ...axes, occurredAt: '2026-10-24T10:00:00Z' })).toBeNull();
  });
});
