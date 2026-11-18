import { aggregateReviewGate } from '../../../../src/modules/ai-usage/domain/review-gate.js';
import type { ReviewGateRow } from '../../../../src/modules/ai-usage/domain/review-gate.js';

const gate = { minDrafts: 100, minKept: 0.85, maxDiscarded: 0.1 };

const row = (over: Partial<ReviewGateRow> = {}): ReviewGateRow => ({
  capability: 'review_draft',
  modelId: 'm1',
  templateCode: 'writing_task',
  draftsSettled: 0,
  remarksAccepted: 0,
  remarksEdited: 0,
  remarksDiscarded: 0,
  remarksUntouched: 0,
  reviews: 0,
  disputes: 0,
  teacherVerdicts: 0,
  teacherOverturned: 0,
  ...over,
});

describe('aggregateReviewGate (plan 90, phase 7, step 10)', () => {
  it('folds agents, prompts and days of one template on one model, and passes it', () => {
    const [group, ...rest] = aggregateReviewGate(
      [
        row({ draftsSettled: 60, reviews: 60, remarksAccepted: 150, remarksEdited: 20, remarksDiscarded: 10 }),
        row({ capability: 'review_direct', draftsSettled: 40, reviews: 50, disputes: 5, remarksAccepted: 20, teacherVerdicts: 10, teacherOverturned: 1 }),
      ],
      gate,
    );
    expect(rest).toHaveLength(0);
    expect(group).toEqual({
      templateCode: 'writing_task',
      modelId: 'm1',
      drafts: 100,
      remarks: { accepted: 170, edited: 20, discarded: 10, untouched: 0, total: 200 },
      keptRate: 0.95,
      discardedRate: 0.05,
      // `reviews` of the review_draft row are teachers' verdicts, not delivered ones.
      direct: { reviews: 50, disputes: 5, disputeRate: 0.1, teacherVerdicts: 10, overturned: 1, overturnRate: 0.1 },
      verdict: 'passed',
      passed: true,
    });
  });

  it('says "insufficient" below the draft count, whatever the shares', () => {
    const [group] = aggregateReviewGate([row({ draftsSettled: 99, remarksAccepted: 100 })], gate);
    expect(group.verdict).toBe('insufficient');
    expect(group.passed).toBe(false);
  });

  it('fails on too few kept, or on too many thrown out — untouched remarks count against both', () => {
    const [kept] = aggregateReviewGate([row({ draftsSettled: 100, remarksAccepted: 84, remarksUntouched: 16 })], gate);
    expect(kept).toMatchObject({ keptRate: 0.84, discardedRate: 0, verdict: 'failed' });
    const [thrown] = aggregateReviewGate([row({ draftsSettled: 100, remarksAccepted: 89, remarksDiscarded: 11 })], gate);
    expect(thrown).toMatchObject({ keptRate: 0.89, discardedRate: 0.11, verdict: 'failed' });
  });

  it('compares the exact shares, not the rounded ones', () => {
    // 16999 / 20000 = 0.84995 → shown as 0.85, still below the gate.
    const [group] = aggregateReviewGate(
      [row({ draftsSettled: 100, remarksAccepted: 16_999, remarksUntouched: 3_001 })],
      gate,
    );
    expect(group.keptRate).toBe(0.85);
    expect(group.verdict).toBe('failed');
    // Exactly on the thresholds passes.
    const [edge] = aggregateReviewGate([row({ draftsSettled: 100, remarksAccepted: 85, remarksUntouched: 5, remarksDiscarded: 10 })], gate);
    expect(edge.verdict).toBe('passed');
  });

  it('keeps rows without a template apart, never ruled on, and lists them last', () => {
    const groups = aggregateReviewGate(
      [
        row({ templateCode: null, draftsSettled: 500, remarksAccepted: 500 }),
        row({ templateCode: 'writing_task', modelId: 'm2', draftsSettled: 3, remarksAccepted: 3 }),
        row({ templateCode: 'writing_task', modelId: 'm1', draftsSettled: 7, remarksAccepted: 7 }),
        row({ templateCode: 'error_correction', draftsSettled: 1, remarksAccepted: 1 }),
      ],
      gate,
    );
    expect(groups.map((g) => [g.templateCode, g.modelId, g.verdict])).toEqual([
      ['error_correction', 'm1', 'insufficient'],
      ['writing_task', 'm1', 'insufficient'],
      ['writing_task', 'm2', 'insufficient'],
      [null, 'm1', 'not_recorded'],
    ]);
  });

  it('has no shares with no remarks', () => {
    const [group] = aggregateReviewGate([row({ draftsSettled: 150 })], gate);
    expect(group).toMatchObject({ keptRate: null, discardedRate: null, verdict: 'insufficient' });
  });
});
