/**
 * What a review remark is about. Exactly the switches of the template's `ai.checks` block
 * (shared-kernel `translate/model.ts`): an aspect the author turned off is not asked for,
 * and the answer schema does not even admit it.
 */
export const REVIEW_ASPECTS = ['grammar', 'order', 'lexis', 'register'] as const;
export type ReviewAspect = (typeof REVIEW_ASPECTS)[number];

/** The enabled aspects of an `ai.checks` block, in the canonical order. */
export function enabledAspects(checks: Partial<Record<ReviewAspect, boolean>>): ReviewAspect[] {
  return REVIEW_ASPECTS.filter((aspect) => checks[aspect] === true);
}
