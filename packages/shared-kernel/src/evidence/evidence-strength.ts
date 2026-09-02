/**
 * Lives in the kernel rather than in learning-service because two services now need the
 * same judgement and neither may hold a second copy of it: learning-service clamps the
 * rating it sends to FSRS, and analytics weighs the same attempt into the mastery profile
 * (plan 55 §3.9 rule 2). A weight table invented next to the projection would drift from
 * the ceilings here within one plan.
 *
 * The two types below are mirrored rather than imported: the kernel deliberately depends
 * on nothing, so `@ssz/contracts` cannot be reached from here. They are structurally the
 * same shapes, and each service passes its own.
 */

/** The FSRS rating vocabulary — `ReviewRating` in learning-service. */
export type ReviewRatingValue = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';

/** `AnswerForm` from `@ssz/contracts` — how the answer was produced. */
export interface AnswerForm {
  mode: 'bank' | 'free';
  bankSize: number | null;
  wordsConsumed: boolean;
}

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
 * Chose from two or three, matched the last remaining pair, or reached the tail of a
 * bank that is spent as it goes. At this width the answer is as much arithmetic as
 * recall, and the last pair — like the last word of a spent bank — is correct by
 * construction. Success barely counts.
 *
 * `HARD` rather than nothing at all: the weakest success FSRS has a word for. Whether
 * evidence this thin should move a card *at all* is left open (plan 36, question 2);
 * this only stops it counting as recall.
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
  // Still the strongest evidence after plan 51, and now for the reason the row always
  // gave: the answer is produced from nothing — one to three sentences in the learner's
  // own words, with nothing on screen to copy from. What changed is the checking. The
  // old form matched the line against a list of accepted strings; the new one asks
  // whether the things the answer had to say were said, an element at a time, by anchor
  // phrase now and by AI later, with a teacher last. So coverage is not the same fact as
  // a word recalled correctly: an element can go uncovered because the learner said it
  // in a phrasing the key does not list, which is a gap in the key rather than in the
  // memory. That is what the floor is for — a `partial` scores low enough for
  // `scoreToRating` to call AGAIN, and HARD is where it lands instead, so an incomplete
  // answer does not reset an interval it never disproved. The cap stays at the top.
  short_answer: FREE_PRODUCTION,
  // Still the strongest evidence after plan 50, and for a slightly different reason: the
  // answer is now a whole text a teacher reads and marks against a rubric, not a line
  // matched against a key. Nothing narrows it and nothing is machine-scored, so the cap
  // stays at the top; the floor stays off AGAIN because a rubric can fail a text on
  // structure or length while every word in it was recalled correctly. The checklist
  // ticks the runner sends alongside the text are self-report and rate nothing.
  writing_task: FREE_PRODUCTION,
  // Still typed from nothing after plan 42, only a set of sentences at a time rather than
  // one — the form of the answer did not change, so neither does the row. One soft edge:
  // an exercise with `dir: "both"` is stored under this code, so its target→explain
  // sentences are rated here rather than by the row below. Not worth a code of its own
  // until `both` is split out for analytics.
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
  //
  // Plan 53 kept the rating and replaced the ground under `multiple_choice`. A question
  // is now one of a set played against the server, and the author may hand out a second
  // try and a 50/50 that removes wrong options: a success can therefore be arrived at by
  // elimination rather than recalled, and the event that reaches here reports only where
  // the learner ended up, not how many tries it took. That is a weaker argument than the
  // sentence above, not a stronger one — the same caveat plan 52 wrote onto
  // `sentence_schema` and plan 49 onto `match_pairs` — and it pushes down, while
  // CLOSED_SET is already the cautious end of recognition. So the row stands; it is here
  // by decision, not by oversight. The two codes below still hold the plain reading.
  multiple_choice: CLOSED_SET,
  multiple_choice_group: CLOSED_SET,
  word_bank_fill: CLOSED_SET,

  // Also closed, but not for the sentence above: the recall here is *where* a piece goes
  // and in what order, not which word it is. Plan 52 loosened the set in two ways without
  // changing the rating — the bank may carry distractors, so what is on screen is no
  // longer exactly the answer; and a sentence may be checked as often as the learner
  // likes, so a success can be converged on by trying, the same caveat that costs
  // `match_pairs` its old argument below. Both push down rather than up, and CLOSED_SET
  // is already the cautious end of recognition.
  sentence_schema: CLOSED_SET,

  // Elimination does most of the work: the last line is free.
  text_order: NEAR_CERTAIN,

  // Still NEAR_CERTAIN, but no longer for the old reason. Plan 49 gave the pool its own
  // distractors, so the last slot is not correct by construction any more. What replaced
  // that argument is weaker evidence, not stronger: a check is partial and unlimited, so
  // a learner can converge on the right grid by trying, and the event that reaches here
  // reports the state they converged to. Until an attempt says how many checks it took,
  // a success here is worth about what elimination used to be worth.
  match_pairs: NEAR_CERTAIN,
};

export interface EvidenceInput {
  /** How the answer was produced, when the template can say. Takes precedence. */
  answerForm?: AnswerForm | null;
  /** Falls back to the type of exercise when there is no form to read. */
  templateCode?: string | null;
  /** 1-based position of this gap in its block, where the attempt is graded per gap. */
  gapPosition?: number | null;
}

/**
 * How many words were still on offer by the time this gap came round (plan 36 §B.3).
 *
 * When each word may be used once, spending one narrows what is left: with five words
 * over five gaps, the fifth gap has exactly one word to put in it and is filled
 * correctly by anyone still awake. The evidence decays across the block, to nothing
 * at the end — so the bank the scale should read is the remaining one, not the
 * original.
 *
 * Position here is position in the document, because that is what the attempt reports;
 * a learner who answers the easy gaps first narrows the bank in their own order, not
 * this one. The approximation is deliberate: the direction is right for everyone, and
 * carrying an answering order through the event to sharpen it is not worth the field.
 */
function remainingBankSize(form: AnswerForm, gapPosition: number | null | undefined): number | null {
  if (form.bankSize === null) return null;
  if (!form.wordsConsumed || !gapPosition || gapPosition < 1) return form.bankSize;
  return Math.max(1, form.bankSize - (gapPosition - 1));
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
    // A bank of two or three is a coin toss with extra steps, whatever the template —
    // and a spent bank shrinks to that on its own, part-way down a long block.
    const remaining = remainingBankSize(form, input.gapPosition);
    if (remaining !== null && remaining <= NEAR_CERTAIN_BANK_SIZE) return NEAR_CERTAIN;
    return CLOSED_SET;
  }

  if (input.templateCode) {
    return BY_TEMPLATE[input.templateCode] ?? UNCLAMPED;
  }

  return UNCLAMPED;
}

/**
 * The rating that should actually reach FSRS, given how the answer was produced.
 *
 * `AGAIN` is the split between success and failure, because that is what it means to
 * FSRS: `AGAIN` is a lapse, and `HARD`/`GOOD`/`EASY` all say the item was recalled,
 * only with differing effort. So a lapse gets lifted to the floor, and everything
 * else gets held down to the ceiling.
 *
 * The clamp only ever moves a rating *toward* the middle. It cannot invent an `EASY`
 * out of a `HARD`, and it cannot turn a recalled item into a lapse.
 */
export function clampByEvidence(
  rating: ReviewRatingValue,
  strength: EvidenceStrength,
): ReviewRatingValue {
  if (rating === 'AGAIN') {
    return ratingRank(strength.failureFloor) > ratingRank(rating) ? strength.failureFloor : rating;
  }
  return ratingRank(strength.successCap) < ratingRank(rating) ? strength.successCap : rating;
}
