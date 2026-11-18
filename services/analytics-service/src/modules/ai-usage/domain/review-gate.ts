import { isLearnerReview } from './draft-quality.js';

/**
 * The Q2 gate of plan 79 (decided 24.10), read per exercise template for the platform admin
 * (plan 90, phase 7, step 10): a model may review a template's work by itself (`review_direct`)
 * once teachers settled at least `minDrafts` of its drafts on that template, kept (as written or
 * reworded) at least `minKept` of the remarks and threw out no more than `maxDiscarded`.
 *
 * Shares are over all remarks of those drafts, the untouched ones included — the same
 * denominator as `takenRate` of the drafts readout, so the two screens agree.
 */
export interface ReviewGateThresholds {
  minDrafts: number;
  minKept: number;
  maxDiscarded: number;
}

/**
 * - `passed` / `failed` — enough drafts, and the shares are within / outside the thresholds;
 * - `insufficient` — fewer settled drafts than the gate asks for, whatever the shares;
 * - `not_recorded` — rows folded before the template was kept: no template to rule on.
 */
export type ReviewGateVerdict = 'passed' | 'failed' | 'insufficient' | 'not_recorded';

/** One stored row of `ai_draft_quality_daily`, as the gate reads it. */
export interface ReviewGateRow {
  capability: string;
  modelId: string | null;
  templateCode: string | null;
  draftsSettled: number;
  remarksAccepted: number;
  remarksEdited: number;
  remarksDiscarded: number;
  remarksUntouched: number;
  reviews: number;
  disputes: number;
  teacherVerdicts: number;
  teacherOverturned: number;
}

/** One template on one model, all agents and prompt versions folded together. */
export interface ReviewGateGroup {
  templateCode: string | null;
  modelId: string | null;
  /** Drafts teachers acted on, `review_draft` and `review_direct` alike. */
  drafts: number;
  remarks: { accepted: number; edited: number; discarded: number; untouched: number; total: number };
  /** (accepted + edited) / total remarks, four places; null with no remarks. */
  keptRate: number | null;
  /** discarded / total remarks, four places; null with no remarks. */
  discardedRate: number | null;
  /**
   * What the model's own verdicts went through where learners got them (`review_direct`,
   * `voice_review`): delivered, disputed by the learner, ruled on again by a teacher and
   * overturned. Context for the admin, not part of the gate.
   */
  direct: {
    reviews: number;
    disputes: number;
    disputeRate: number | null;
    teacherVerdicts: number;
    overturned: number;
    overturnRate: number | null;
  };
  verdict: ReviewGateVerdict;
  /** `verdict === 'passed'`. */
  passed: boolean;
}

export function aggregateReviewGate(rows: ReviewGateRow[], thresholds: ReviewGateThresholds): ReviewGateGroup[] {
  const groups = new Map<string, ReviewGateGroup>();
  for (const row of rows) {
    const key = JSON.stringify([row.templateCode, row.modelId]);
    let group = groups.get(key);
    if (!group) {
      group = {
        templateCode: row.templateCode,
        modelId: row.modelId,
        drafts: 0,
        remarks: { accepted: 0, edited: 0, discarded: 0, untouched: 0, total: 0 },
        keptRate: null,
        discardedRate: null,
        direct: { reviews: 0, disputes: 0, disputeRate: null, teacherVerdicts: 0, overturned: 0, overturnRate: null },
        verdict: 'insufficient',
        passed: false,
      };
      groups.set(key, group);
    }
    group.drafts += row.draftsSettled;
    group.remarks.accepted += row.remarksAccepted;
    group.remarks.edited += row.remarksEdited;
    group.remarks.discarded += row.remarksDiscarded;
    group.remarks.untouched += row.remarksUntouched;
    // `reviews` on a `review_draft` row are teachers' verdicts, already in `drafts`.
    if (isLearnerReview(row.capability)) {
      group.direct.reviews += row.reviews;
      group.direct.disputes += row.disputes;
    }
    group.direct.teacherVerdicts += row.teacherVerdicts;
    group.direct.overturned += row.teacherOverturned;
  }

  for (const group of groups.values()) {
    const r = group.remarks;
    r.total = r.accepted + r.edited + r.discarded + r.untouched;
    group.keptRate = share(r.accepted + r.edited, r.total);
    group.discardedRate = share(r.discarded, r.total);
    const d = group.direct;
    d.disputeRate = share(d.disputes, d.reviews);
    d.overturnRate = share(d.overturned, d.teacherVerdicts);
    group.verdict = verdictOf(group, thresholds);
    group.passed = group.verdict === 'passed';
  }

  return [...groups.values()].sort(byTemplateThenDrafts);
}

function verdictOf(group: ReviewGateGroup, t: ReviewGateThresholds): ReviewGateVerdict {
  if (group.templateCode === null) return 'not_recorded';
  const r = group.remarks;
  if (group.drafts < t.minDrafts || r.total === 0) return 'insufficient';
  // On the exact counts, not the rounded shares: 0.84996 must not pass a gate of 0.85.
  const kept = (r.accepted + r.edited) / r.total;
  const discarded = r.discarded / r.total;
  return kept >= t.minKept && discarded <= t.maxDiscarded ? 'passed' : 'failed';
}

/** Templates by name, "not recorded" last; within a template the model with most drafts first. */
function byTemplateThenDrafts(a: ReviewGateGroup, b: ReviewGateGroup): number {
  if (a.templateCode !== b.templateCode) {
    if (a.templateCode === null) return 1;
    if (b.templateCode === null) return -1;
    return a.templateCode < b.templateCode ? -1 : 1;
  }
  if (a.drafts !== b.drafts) return b.drafts - a.drafts;
  return String(a.modelId).localeCompare(String(b.modelId));
}

function share(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 10_000) / 10_000;
}
