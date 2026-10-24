/**
 * What a review remark is about. The first four are the switches of `translate`'s
 * `ai.checks` block (shared-kernel `translate/model.ts`); `alternative` is a correction the
 * key did not foresee that is also right — `error_correction`'s `altFixes` (plan 79, 1.7a);
 * `task` and `structure` are about an essay as a whole — `writing_task`'s switches (1.7b);
 * `content` is a key point a `short_answer` leaves out or gets wrong (1.7e), whose
 * `alternative` is a key point said in words the phrase match missed.
 * An aspect the author turned off is not asked for, and the answer schema does not even
 * admit it.
 */
export const REVIEW_ASPECTS = ['grammar', 'order', 'lexis', 'register', 'alternative', 'task', 'structure', 'content'] as const;
export type ReviewAspect = (typeof REVIEW_ASPECTS)[number];

/** Aspects that name an error. `alternative` says the opposite: this differs from the key and is right. */
export const ERROR_ASPECTS: readonly ReviewAspect[] = ['grammar', 'order', 'lexis', 'register', 'task', 'structure', 'content'];

/**
 * Aspects a remark may make without quoting the answer: a point of the task left out, an
 * essay with no conclusion, a key point an answer never mentions — there is no fragment to
 * point at. Every other aspect quotes.
 */
export const WHOLE_TEXT_ASPECTS: readonly ReviewAspect[] = ['task', 'structure', 'content'];

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
 * name, except `draft`, which asks for suggested rubric marks rather than remarks (step 1.7c,
 * read in `review-input.ts`).
 */
export function writingTaskAspects(checks: { grammar?: boolean; lexis?: boolean; structure?: boolean; task?: boolean }): ReviewAspect[] {
  return (['grammar', 'lexis', 'structure', 'task'] as const).filter((aspect) => checks[aspect] === true);
}

/**
 * The aspects a `short_answer` AI stage allows (plan 79, 1.7e). The builder promises the stage
 * "comments on content", and "on grammar too" — spelling and form — under its second switch.
 * Content is two aspects: a key point missing or wrong, and a key point the phrase match did
 * not find but the answer does say, which the teacher may credit.
 */
export function shortAnswerAspects(checks: { grammar?: boolean }): ReviewAspect[] {
  return ['content', 'alternative', ...(checks.grammar === true ? (['grammar', 'lexis'] as const) : [])];
}
