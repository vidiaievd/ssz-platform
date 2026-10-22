import { aggregateDraftQuality, isFoldableDraft } from '../../../../src/modules/ai-usage/domain/draft-quality.js';

const row = (over: Partial<Parameters<typeof aggregateDraftQuality>[0][number]> = {}) => ({
  capability: 'review_draft',
  modelId: 'm1',
  promptVersion: 'review_draft@1',
  reviews: 1,
  remarksAccepted: 0,
  remarksEdited: 0,
  remarksDiscarded: 0,
  remarksUntouched: 0,
  ...over,
});

describe('aggregateDraftQuality', () => {
  it('folds the days of one model and prompt into one group', () => {
    const [group, ...rest] = aggregateDraftQuality([
      row({ remarksAccepted: 1 }),
      row({ remarksEdited: 1 }),
      row({ remarksDiscarded: 1, remarksUntouched: 1 }),
    ]);

    expect(rest).toHaveLength(0);
    expect(group).toEqual({
      capability: 'review_draft',
      modelId: 'm1',
      promptVersion: 'review_draft@1',
      reviews: 3,
      remarks: { accepted: 1, edited: 1, discarded: 1, untouched: 1, total: 4 },
      takenRate: 0.5,
    });
  });

  it('keeps prompt versions and models apart, unknown ones included', () => {
    const groups = aggregateDraftQuality([
      row(),
      row({ promptVersion: 'review_draft@2' }),
      row({ modelId: null, promptVersion: null }),
      row({ modelId: null, promptVersion: null }),
    ]);
    expect(groups.map((g) => [g.modelId, g.promptVersion, g.reviews])).toEqual([
      ['m1', 'review_draft@1', 1],
      ['m1', 'review_draft@2', 1],
      [null, null, 2],
    ]);
  });

  it('has no rate for drafts without remarks', () => {
    expect(aggregateDraftQuality([row()])[0].takenRate).toBeNull();
  });
});

describe('isFoldableDraft', () => {
  const draft = {
    capability: 'review_draft',
    modelId: 'm1',
    promptVersion: null,
    accepted: 1,
    edited: 0,
    discarded: 2,
    untouched: 0,
  };

  it('takes a well-formed draft and refuses a broken count', () => {
    expect(isFoldableDraft(draft)).toBe(true);
    expect(isFoldableDraft({ ...draft, edited: -1 })).toBe(false);
    expect(isFoldableDraft({ ...draft, untouched: 1.5 })).toBe(false);
    expect(isFoldableDraft({ ...draft, capability: undefined })).toBe(false);
  });
});
