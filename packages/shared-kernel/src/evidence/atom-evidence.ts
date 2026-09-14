import type { EvidenceInput, EvidenceStrength, ReviewRatingValue } from './evidence-strength.js';
import { evidenceStrength, ratingRank } from './evidence-strength.js';

/**
 * What an author said this piece of the exercise was doing with the atom (plan 63 §2 D).
 *
 * Mirrored rather than imported — the kernel depends on nothing — and structurally the
 * `role` of an `AttemptTarget` in `@ssz/contracts`.
 */
export type AtomRole = 'focus' | 'context';

/** `Modality` from `@ssz/shared-kernel/skills`, restated here for the same reason. */
export type AtomModality = 'recognition' | 'recall' | 'production' | 'unknown';

/**
 * How much one answer proves about **one atom inside it** (plan 63 phase 5).
 *
 * `evidenceStrength` answers a narrower question: how much the answer proves at all,
 * from the form it was produced in. That is the right ceiling for a card standing for
 * the exercise or the gap, where the thing being remembered *is* the thing that was
 * answered. It is the wrong ceiling for an atom, because an atom can sit inside an
 * item without being what the item asked: the same correct sentence is a full recall
 * of the verb form it was testing and almost nothing about the noun that happened to
 * be in it.
 *
 * So two more axes narrow the form's verdict, and only ever narrow it:
 *
 *   - **role** — what the author said this item was doing with the atom;
 *   - **modality** — how the answer had to be known, where the form could not say.
 *
 * The result feeds the same `clampByEvidence` as everything else.
 */
export interface AtomEvidenceInput extends EvidenceInput {
  /** `focus` — the item examined it. `context` — it was merely needed. */
  role?: AtomRole | null;
  /** How the learner had to know it, as the engine snapshotted the attempt. */
  modality?: AtomModality | null;
}

/**
 * The atom was background: needed to answer, never asked about.
 *
 * Weak in both directions, and deliberately symmetric. Getting the item right while
 * the atom was only along for the ride is the thinnest kind of success — it proves
 * the learner did not trip over it. Getting the item *wrong* says as little: the
 * failure was almost certainly about the atom the item was actually testing, and
 * punishing this one for it would let a hard exercise flatten every word in its
 * sentences.
 */
const INCIDENTAL: EvidenceStrength = { successCap: 'HARD', failureFloor: 'HARD' };

/**
 * Recognised it among things on screen. Nothing had to be produced, so a success
 * caps below the top, and a failure with the answer in view gets no mercy.
 */
const BY_RECOGNITION: EvidenceStrength = { successCap: 'GOOD', failureFloor: 'AGAIN' };

/**
 * Produced or recalled it from nothing on screen. Success may reach the top; failure
 * is held off the floor, because a wrong string may be a wrong spelling of a word the
 * learner knows (the asymmetry of plan 36 §B.1).
 */
const BY_RECALL: EvidenceStrength = { successCap: 'EASY', failureFloor: 'HARD' };

function byModality(modality: AtomModality | null | undefined): EvidenceStrength | null {
  switch (modality) {
    case 'recognition':
      return BY_RECOGNITION;
    case 'recall':
    case 'production':
      return BY_RECALL;
    // `unknown`, and absent: a template nobody has judged says nothing, and inventing a
    // reading for it would be worse than leaving the form's verdict alone.
    default:
      return null;
  }
}

/**
 * The weaker of two claims, read separately in each direction.
 *
 * Nothing here may make evidence stronger than one of its sources says it is: a
 * success is capped by the lowest cap, and a failure lifted to the highest floor.
 * Where the axes agree this changes nothing; where they disagree — a modality of
 * `recall` on a template whose form says a bank was on screen, which is a document
 * describing itself two ways — it believes the cautious half of each.
 */
function weaker(a: EvidenceStrength, b: EvidenceStrength): EvidenceStrength {
  return {
    successCap: ratingRank(b.successCap) < ratingRank(a.successCap) ? b.successCap : a.successCap,
    failureFloor: ratingRank(b.failureFloor) > ratingRank(a.failureFloor) ? b.failureFloor : a.failureFloor,
  };
}

export function atomEvidenceStrength(input: AtomEvidenceInput): EvidenceStrength {
  // `context` swallows the rest: whatever form the item was answered in, it was not
  // asking about this atom, and no form makes background evidence strong.
  if (input.role === 'context') return INCIDENTAL;

  const fromForm = evidenceStrength(input);
  const fromModality = byModality(input.modality);

  return fromModality ? weaker(fromForm, fromModality) : fromForm;
}

/**
 * Which of two observations of the same atom, in the same attempt, to keep.
 *
 * One submission can address the same atom twice — the focus of one gap and the
 * context of another, or two gaps that disagree. Rating the card once per address
 * would move it two or three times for a single answer, and the old fan-out's version
 * of this bug is exactly what phase 5 exists to fix: in one attempt the word
 * `stillingsannonse` was rated `GOOD` as a gap and `AGAIN` as a word.
 *
 * So: the strongest claim about the atom wins — an item that examined it outranks one
 * that merely needed it — and among equals, the **worse** outcome wins. A lapse is the
 * informative half of an attempt, and letting a success elsewhere in the same exercise
 * hide it would keep the card on a schedule the learner has just disproved.
 */
export function strongerClaim<T extends { role: AtomRole; rating: ReviewRatingValue }>(
  a: T,
  b: T,
): T {
  if (a.role !== b.role) return a.role === 'focus' ? a : b;
  return ratingRank(b.rating) < ratingRank(a.rating) ? b : a;
}
