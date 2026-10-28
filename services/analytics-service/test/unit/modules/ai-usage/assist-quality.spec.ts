import { assistFoldOf } from '../../../../src/modules/ai-usage/consumers/assist-feedback.consumer.js';
import { aggregateAssistQuality } from '../../../../src/modules/ai-usage/domain/assist-quality.js';

const payload = {
  capability: 'student_assist',
  modelId: 'fake-model',
  promptVersion: 'student_assist@1',
  helpful: false,
  reasonGiven: true,
  answeredAt: '2026-10-27T23:30:00.000Z',
};

const row = (over: Partial<Parameters<typeof aggregateAssistQuality>[0][number]> = {}) => ({
  capability: 'student_assist',
  modelId: 'm1',
  promptVersion: 'student_assist@1',
  helpful: 0,
  notHelpful: 0,
  withReason: 0,
  ...over,
});

describe('AssistFeedbackConsumer — assistFoldOf (plan 83, step 7)', () => {
  it('counts a mark on the answer’s day, with its axes and flags', () => {
    expect(assistFoldOf(payload)).toEqual({
      day: '2026-10-27',
      capability: 'student_assist',
      modelId: 'fake-model',
      promptVersion: 'student_assist@1',
      helpful: false,
      reasonGiven: true,
    });
  });

  it('folds an answer with no model or prompt as nulls', () => {
    expect(assistFoldOf({ ...payload, modelId: null, promptVersion: null })).toMatchObject({ modelId: null, promptVersion: null });
  });

  it('reads nothing it cannot fold', () => {
    expect(assistFoldOf(null)).toBeNull();
    expect(assistFoldOf({ ...payload, helpful: 'yes' })).toBeNull();
    expect(assistFoldOf({ ...payload, reasonGiven: undefined })).toBeNull();
    expect(assistFoldOf({ ...payload, answeredAt: 'yesterday' })).toBeNull();
    expect(assistFoldOf({ ...payload, modelId: 7 })).toBeNull();
  });
});

describe('aggregateAssistQuality', () => {
  it('folds the days of one model and prompt into one group with its helpful rate', () => {
    const groups = aggregateAssistQuality([
      row({ helpful: 2, notHelpful: 1, withReason: 1 }),
      row({ helpful: 1, notHelpful: 2 }),
      row({ promptVersion: 'student_assist@2', helpful: 1 }),
    ]);
    expect(groups).toEqual([
      { capability: 'student_assist', modelId: 'm1', promptVersion: 'student_assist@1', helpful: 3, notHelpful: 3, withReason: 1, helpfulRate: 0.5 },
      { capability: 'student_assist', modelId: 'm1', promptVersion: 'student_assist@2', helpful: 1, notHelpful: 0, withReason: 0, helpfulRate: 1 },
    ]);
  });

  it('rounds the rate to four places and leaves it null without marks', () => {
    const [third, none] = aggregateAssistQuality([row({ helpful: 1, notHelpful: 2 }), row({ modelId: null })]);
    expect(third.helpfulRate).toBe(0.3333);
    expect(none.helpfulRate).toBeNull();
  });
});
