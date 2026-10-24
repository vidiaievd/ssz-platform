import type { ReviewAspect } from './review-aspect.js';

/**
 * A `translate_*` submission as the reviewer sees it: one entry per sentence of the set,
 * the author's key beside the learner's answer. Built by the caller from the exercise and
 * the attempt (plan 79, step 1.3); ai-service holds no copy of the template.
 */
export interface TranslateReviewSentence {
  itemId: string;
  direction: 'to_target' | 'from_target';
  source: string;
  /** Accepted translations, with the template's inline `(a|b)` alternatives unexpanded. */
  refs: string[];
  answer: string;
  /** Why the key reads the way it does — the author's own words. */
  explanation?: string;
  /** Meant for the teacher only; context, never quoted back. */
  teacherNote?: string;
}

export interface TranslateReviewInput {
  /** The template's language labels — free text, e.g. `{ explain: 'Russisk', target: 'Norsk' }`. */
  langs: { explain: string; target: string };
  /** The language the remarks are written in: the school's explanation language. */
  commentLanguage: string;
  /** Enabled `ai.checks` aspects; never empty — with nothing to check there is no call. */
  aspects: ReviewAspect[];
  sentences: TranslateReviewSentence[];
}
