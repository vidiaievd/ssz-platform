/**
 * What a review remark is about. The first four are the switches of `translate`'s
 * `ai.checks` block (shared-kernel `translate/model.ts`); `alternative` is a correction the
 * key did not foresee that is also right — `error_correction`'s `altFixes` (plan 79, 1.7a);
 * `task` and `structure` are about an essay as a whole — `writing_task`'s switches (1.7b).
 * An aspect the author turned off is not asked for, and the answer schema does not even
 * admit it.
 */
export const REVIEW_ASPECTS = ['grammar', 'order', 'lexis', 'register', 'alternative', 'task', 'structure'] as const;
export type ReviewAspect = (typeof REVIEW_ASPECTS)[number];

/** Aspects that name an error. `alternative` says the opposite: this differs from the key and is right. */
export const ERROR_ASPECTS: readonly ReviewAspect[] = ['grammar', 'order', 'lexis', 'register', 'task', 'structure'];

/**
 * Aspects a remark may make without quoting the answer: a point of the task left out, an
 * essay with no conclusion — there is no fragment to point at. Every other aspect quotes.
 */
export const WHOLE_TEXT_ASPECTS: readonly ReviewAspect[] = ['task', 'structure'];

const TRANSLATE_ASPECTS: readonly ReviewAspect[] = ['grammar', 'order', 'lexis', 'register'];

/** The enabled aspects of a `translate` `ai.checks` block, in the canonical order. */
export function enabledAspects(checks: Partial<Record<ReviewAspect, boolean>>): ReviewAspect[] {
  return TRANSLATE_ASPECTS.filter((aspect) => checks[aspect] === true);
}

/**
 * The aspects an `error_correction` `ai.checks` block allows. Its switches are not aspects:
 * `explainWhy` is "explain what is still wrong" — the three error aspects; `register` is the
 * register aspect; `altFixes` is "say when an unforeseen correction is also right".
 */
export function errorCorrectionAspects(checks: { explainWhy?: boolean; altFixes?: boolean; register?: boolean }): ReviewAspect[] {
  return [
    ...(checks.explainWhy === true ? (['grammar', 'order', 'lexis'] as const) : []),
    ...(checks.register === true ? (['register'] as const) : []),
    ...(checks.altFixes === true ? (['alternative'] as const) : []),
  ];
}

/**
 * The aspects a `writing_task` AI stage allows (plan 79, 1.7b). Its switches are aspects by
 * name, except `draft`, which asks for rubric marks rather than remarks (step 1.7c).
 */
export function writingTaskAspects(checks: { grammar?: boolean; lexis?: boolean; structure?: boolean; task?: boolean }): ReviewAspect[] {
  return (['grammar', 'lexis', 'structure', 'task'] as const).filter((aspect) => checks[aspect] === true);
}
