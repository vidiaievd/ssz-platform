import type { ReviewAspect } from './review-aspect.js';

/** One mistake the template's engine derived, and what the learner's edits made of it. */
export interface ErrorCorrectionReviewMistake {
  /** The faulty words as given; empty when a word is missing. */
  wrong: string;
  /** What the key has instead; empty when the words are superfluous. */
  fix: string;
  /** The engine's kind: `form`, `order`, `extra`, `missing`, `spelling`, `function`. */
  type: string;
  /** `fixed` — repaired as the key has it; `attempted` — changed, not to the key; `missed`. */
  state: string;
  /** What the learner's edits made of these words. */
  submitted: string;
  /** The author's explanation of the mistake. */
  note?: string;
}

/**
 * An `error_correction` submission as the reviewer sees it (plan 79, step 1.7): the faulty
 * sentence, the key, the sentence the learner's edits produced and, from the template's own
 * engine, which mistakes they reached. Built by exercise-engine; ai-service holds no copy of
 * the template.
 */
export interface ErrorCorrectionReviewSentence {
  itemId: string;
  given: string;
  /** The key and other accepted sentences, inline `(a|b)` alternatives unexpanded. */
  refs: string[];
  /** The learner's corrected sentence — what remarks quote. */
  answer: string;
  /** The auto-check closed it: identical to an accepted sentence. */
  matchesKey: boolean;
  mistakes: ErrorCorrectionReviewMistake[];
  /** Words changed or inserted where there was no mistake. */
  stray: string[];
  teacherNote?: string;
}

export interface ErrorCorrectionReviewInput {
  /** The language learnt, spelled out (`Norwegian Bokmål`). */
  targetLanguage: string;
  /** The language the remarks are written in. */
  commentLanguage: string;
  /** The author's context line; empty when there is none. */
  note: string;
  /** From the exercise's `ai.checks`; never empty — with nothing to check there is no call. */
  aspects: ReviewAspect[];
  sentences: ErrorCorrectionReviewSentence[];
}
