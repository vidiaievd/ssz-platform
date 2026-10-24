import type { RubricMarks } from '@ssz/shared-kernel/writing-task';
import type { ReviewDecision } from '../../attempts/domain/entities/attempt.entity.js';
import type { AiDraftMark } from './entities/attempt-ai-draft.entity.js';

/** A model's ruling on one item of a set — a sentence, a question. */
export interface AiItemDecision {
  itemId: string;
  approved: boolean;
}

/**
 * What a model rules on a learner's submission (plan 79 §2.1): the whole of it, and each
 * item the machine left open. An essay's ruling is its marks, which travel with the draft.
 */
export interface AiVerdict {
  outcome: 'approved' | 'returned';
  decisions: AiItemDecision[];
}

/**
 * The decisions a model's verdict stands on (decision Q4-C): wherever the machine can check,
 * it decides, and the model decides only what nothing else can.
 *
 * An item the auto-check closed counts whatever the model says about it — the answer hit the
 * author's key, and a model marking a key answer wrong is the model's error. Its remarks on
 * such an item still reach the learner, as feedback, and it can still send the work as a
 * whole back. Every item the machine left open needs the model's word; one without it is
 * `missing`, never read as either verdict.
 *
 * With no items to go by — a validator that cannot read the answer — the model's decisions
 * are taken as they are, as a teacher's would be.
 */
export function decisionsUnderMachine(
  auto: Array<{ itemId: string; autoPassed: boolean }>,
  model: AiItemDecision[],
): { decisions: ReviewDecision[]; missing: string[] } {
  if (auto.length === 0) {
    return { decisions: model.map(({ itemId, approved }) => ({ itemId, approved })), missing: [] };
  }

  const ruled = new Map(model.map((decision) => [decision.itemId, decision.approved]));
  const decisions: ReviewDecision[] = [];
  const missing: string[] = [];
  for (const item of auto) {
    if (item.autoPassed) {
      decisions.push({ itemId: item.itemId, approved: true });
      continue;
    }
    const approved = ruled.get(item.itemId);
    if (approved === undefined) missing.push(item.itemId);
    else decisions.push({ itemId: item.itemId, approved });
  }
  return { decisions, missing };
}

/** A draft's suggested marks as the rubric scorer reads them, keyed by criterion. */
export function marksOf(marks: AiDraftMark[] | null): RubricMarks {
  return Object.fromEntries((marks ?? []).map((m) => [m.criterionId, m.mark]));
}
