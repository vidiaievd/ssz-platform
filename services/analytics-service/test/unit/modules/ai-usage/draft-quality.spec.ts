import { aggregateDraftQuality, isFoldableDraft, reviewedIncrements } from '../../../../src/modules/ai-usage/domain/draft-quality.js';

const row = (over: Partial<Parameters<typeof aggregateDraftQuality>[0][number]> = {}) => ({
  capability: 'review_draft',
  modelId: 'm1',
  promptVersion: 'review_draft@1',
  reviews: 1,
  remarksAccepted: 0,
  remarksEdited: 0,
  remarksDiscarded: 0,
  remarksUntouched: 0,
  reviewsWithMarks: 0,
  marksSame: 0,
  marksDifferent: 0,
  marksCompared: 0,
  marksDeltaSum: 0,
  marksAbsDeltaSum: 0,
  disputes: 0,
  teacherVerdicts: 0,
  teacherOverturned: 0,
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
      marks: { reviews: 0, same: 0, different: 0, compared: 0, agreement: null, meanAbsDelta: null, bias: null },
      disputes: 0,
      disputeRate: null,
      teacherVerdicts: { total: 0, overturned: 0, overturnRate: null },
    });
  });

  // Plan 80, step 6c.
  it('rates teachers’ verdicts after a model’s apart from the reviews it delivered', () => {
    const direct = { capability: 'review_direct', promptVersion: 'review_direct@2' };
    const [group] = aggregateDraftQuality([
      row({ ...direct, reviews: 4, disputes: 1, teacherVerdicts: 3, teacherOverturned: 1 }),
      row({ ...direct, reviews: 0, teacherVerdicts: 1, teacherOverturned: 1 }),
    ]);
    expect(group).toMatchObject({
      reviews: 4,
      disputeRate: 0.25,
      teacherVerdicts: { total: 4, overturned: 2, overturnRate: 0.5 },
    });
  });

  // Plan 79, step 2.3b.
  it('rates a model’s reviews of learners by how many they disputed', () => {
    const direct = { capability: 'review_direct', promptVersion: 'review_direct@1' };
    const [group] = aggregateDraftQuality([
      row({ ...direct, reviews: 3, disputes: 1 }),
      row({ ...direct, reviews: 5, disputes: 0 }),
    ]);
    expect(group).toMatchObject({ reviews: 8, disputes: 1, disputeRate: 0.125, takenRate: null });
  });

  it('gives no dispute rate to teachers’ drafts, which learners never see', () => {
    expect(aggregateDraftQuality([row({ reviews: 4 })])[0]!.disputeRate).toBeNull();
  });

  // Plan 79, step 1.7d.
  it('rates suggested marks over the range: agreement, mean distance and which way the model leans', () => {
    const [group] = aggregateDraftQuality([
      row({ reviewsWithMarks: 1, marksSame: 2, marksDifferent: 2, marksCompared: 4, marksDeltaSum: 0, marksAbsDeltaSum: 2 }),
      row({ reviewsWithMarks: 1, marksSame: 1, marksDifferent: 3, marksCompared: 3, marksDeltaSum: 3, marksAbsDeltaSum: 3 }),
      row(),
    ]);
    expect(group.marks).toEqual({
      reviews: 2,
      same: 3,
      different: 5,
      compared: 7,
      agreement: 0.375,
      meanAbsDelta: 0.7143,
      bias: 0.4286,
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

  // Plan 79, step 1.7d.
  it('takes a draft with or without marks, and refuses broken mark counts', () => {
    const marks = { same: 1, different: 2, compared: 3, deltaSum: -2, absDeltaSum: 2 };
    expect(isFoldableDraft({ ...draft, marks: null })).toBe(true);
    expect(isFoldableDraft({ ...draft, marks })).toBe(true);
    expect(isFoldableDraft({ ...draft, marks: { ...marks, absDeltaSum: -1 } })).toBe(false);
    expect(isFoldableDraft({ ...draft, marks: { ...marks, deltaSum: 0.5 } })).toBe(false);
    expect(isFoldableDraft({ ...draft, marks: 'x' })).toBe(false);
  });
});

// Plan 80, step 6c.
describe('reviewedIncrements', () => {
  const tally = { modelId: 'm1', promptVersion: 'review_direct@2', accepted: 1, edited: 0, discarded: 2, untouched: 0 };
  const modelSaid = (outcome: string) => ({
    capability: 'review_direct',
    modelId: 'm1',
    promptVersion: 'review_direct@2',
    outcome,
  });

  it('counts nothing on a letter with no model in it', () => {
    expect(reviewedIncrements({ outcome: 'approved', aiDraft: null })).toEqual([]);
  });

  it('counts a review_draft draft as a review, as before', () => {
    const [i, ...rest] = reviewedIncrements({ outcome: 'approved', aiDraft: { ...tally, capability: 'review_draft' } })!;
    expect(rest).toHaveLength(0);
    expect(i).toMatchObject({ capability: 'review_draft', reviews: 1, remarks: { accepted: 1, discarded: 2 }, teacherVerdicts: 0 });
  });

  it('takes a review_direct draft’s remarks without counting it as a delivered review', () => {
    const increments = reviewedIncrements({
      outcome: 'returned',
      aiDraft: { ...tally, capability: 'review_direct' },
      aiVerdict: modelSaid('approved'),
    })!;
    expect(increments).toEqual([
      expect.objectContaining({ capability: 'review_direct', reviews: 0, remarks: expect.objectContaining({ accepted: 1 }), teacherVerdicts: 0 }),
      expect.objectContaining({ capability: 'review_direct', modelId: 'm1', reviews: 0, teacherVerdicts: 1, teacherOverturned: 1 }),
    ]);
  });

  it('counts a teacher’s verdict that agrees, with no draft acted on — a batch approval', () => {
    expect(reviewedIncrements({ outcome: 'approved', aiDraft: null, aiVerdict: modelSaid('approved') })).toEqual([
      expect.objectContaining({ teacherVerdicts: 1, teacherOverturned: 0 }),
    ]);
  });

  it('refuses a letter it should read and cannot', () => {
    expect(reviewedIncrements({ outcome: 'approved', aiVerdict: modelSaid('maybe') })).toBeNull();
    expect(reviewedIncrements({ outcome: 'later', aiVerdict: modelSaid('approved') })).toBeNull();
    expect(reviewedIncrements({ outcome: 'approved', aiDraft: { ...tally, capability: 'review_draft', edited: -1 } })).toBeNull();
    expect(reviewedIncrements(null)).toBeNull();
  });
});
