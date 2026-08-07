import type { AnswerForm } from '@ssz/contracts';
import type { ReviewRatingValue } from './value-objects/review-rating.vo.js';

/**
 * How much knowledge one successful answer actually proves (plan 36 §B.1).
 *
 * This is **not** a weight on the exercise and not a multiplier on points. FSRS
 * models memory of one item, and the rating is a signal for "how easily did it come
 * back". So the right lever is a *ceiling on the rating by the form of the answer*:
 * scoring 100 by picking a word out of five given ones is not the same evidence as
 * scoring 100 by typing it from memory, and today both land on EASY.
 *
 * The asymmetry is the part that is easy to forget: **on failure it runs the other
 * way.** Getting it wrong while choosing from five given words is a strong signal of
 * not knowing — the hint was as large as it gets. Getting it wrong while typing it
 * out can happen to someone who knows the word perfectly well: a typo, `kj` against
 * `skj`, a doubled consonant. Hence:
 *
 *   - weak form: success means little, failure means a lot;
 *   - strong form: success means a lot, failure means less than it looks.
 *
 * The ceilings below are a judgement, not a measurement. They are deliberately set
 * from the head and refined against the telemetry of §A.1 — a system with ceilings
 * guessed at is still closer to the truth than today's, which has none at all.
 */
export interface EvidenceStrength {
  /** The highest rating a success may be reported as. */
  successCap: ReviewRatingValue;
  /** The lowest rating a failure may be reported as. */
  failureFloor: ReviewRatingValue;
}

/** AGAIN < HARD < GOOD < EASY. Clamping needs an order; FSRS itself does not. */
const RATING_ORDER: readonly ReviewRatingValue[] = ['AGAIN', 'HARD', 'GOOD', 'EASY'];

export function ratingRank(rating: ReviewRatingValue): number {
  return RATING_ORDER.indexOf(rating);
}

/**
 * No clamping in either direction — the identity, used wherever the form is unknown.
 *
 * Every event published before §5.4 of plan 35, and every template that still cannot
 * describe its answer form, lands here and is rated exactly as it is today. That is
 * what keeps the scale additive rather than a migration.
 */
const UNCLAMPED: EvidenceStrength = { successCap: 'EASY', failureFloor: 'AGAIN' };

/**
 * Produced the answer from nothing: typed out, spoken, written. Nothing narrowed the
 * options and the word's form had to be recalled, not recognised — so success may
 * reach the top, and failure is held off the floor because it may only be a slip.
 */
const FREE_PRODUCTION: EvidenceStrength = { successCap: 'EASY', failureFloor: 'HARD' };

/**
 * Chose from a closed set of a handful. Some of the answer was given: the word's form
 * is on screen and there is nothing to spell. Success caps at GOOD; failure gets no
 * mercy, since the hint was already there.
 */
const CLOSED_SET: EvidenceStrength = { successCap: 'GOOD', failureFloor: 'AGAIN' };

/**
 * Chose from two or three, or matched the last remaining pair. At this width the
 * answer is as much arithmetic as recall, and the last pair in a matching exercise is
 * correct by construction. Success barely counts.
 */
const NEAR_CERTAIN: EvidenceStrength = { successCap: 'HARD', failureFloor: 'AGAIN' };

/**
 * Above this many options, choosing stops being mostly elimination. Under it, a
 * correct answer says more about the size of the set than about the learner.
 */
const NEAR_CERTAIN_BANK_SIZE = 3;

/**
 * The scale by template, for the types that cannot describe their answer form.
 *
 * Covers all twelve types of the audit (plan 34) rather than gap-fill alone — that is
 * why this is its own plan. Settling the scale inside each per-type plan would mean
 * reopening the same question twelve times, and any type whose plan stayed silent
 * would quietly keep rating itself as strong evidence.
 *
 * Every future plan that touches an exercise type owes this table a row.
 */
const BY_TEMPLATE: Readonly<Record<string, EvidenceStrength>> = {
  // The learner produces the language and it is checked. The strongest evidence there is.
  short_answer: FREE_PRODUCTION,
  writing_task: FREE_PRODUCTION,
  translate_to_target: FREE_PRODUCTION,
  // Typed from memory. Superseded by word_bank_gap_fill, which reports its form
  // directly; kept for events still carrying the old code.
  fill_in_blank: FREE_PRODUCTION,
  // Finding the error is genuine recall, and the correction is written out. Failing
  // may still be a slip in the correction rather than blindness to the error.
  error_correction: FREE_PRODUCTION,

  // Into the learner's own language: comprehension rather than production. Real, but
  // it never shows they could produce the target form. Failure is held off the floor
  // because the answer is typed and typos are the learner's own language's problem.
  translate_from_target: { successCap: 'GOOD', failureFloor: 'HARD' },

  // Some of the answer is given. The words are on screen; the recall is which one.
  multiple_choice: CLOSED_SET,
  multiple_choice_group: CLOSED_SET,
  word_bank_fill: CLOSED_SET,
  sentence_schema: CLOSED_SET,

  // Elimination does most of the work: the last pair and the last line are free.
  match_pairs: NEAR_CERTAIN,
  text_order: NEAR_CERTAIN,
};

export interface EvidenceInput {
  /** How the answer was produced, when the template can say. Takes precedence. */
  answerForm?: AnswerForm | null;
  /** Falls back to the type of exercise when there is no form to read. */
  templateCode?: string | null;
}

/**
 * The ceiling and floor for one attempt.
 *
 * The form wins over the template wherever both are present: after gap-fill was
 * merged into one template, `templateCode` no longer distinguishes choosing a word
 * from typing it, and the form is the only thing that does.
 */
export function evidenceStrength(input: EvidenceInput): EvidenceStrength {
  const form = input.answerForm;

  if (form) {
    if (form.mode === 'free') return FREE_PRODUCTION;
    // A bank of two or three is a coin toss with extra steps, whatever the template.
    if (form.bankSize !== null && form.bankSize <= NEAR_CERTAIN_BANK_SIZE) return NEAR_CERTAIN;
    return CLOSED_SET;
  }

  if (input.templateCode) {
    return BY_TEMPLATE[input.templateCode] ?? UNCLAMPED;
  }

  return UNCLAMPED;
}
