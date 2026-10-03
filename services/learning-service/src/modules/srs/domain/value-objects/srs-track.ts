import type { SrsContentType } from '../entities/review-card.entity.js';

/**
 * Which of the two memories a card belongs to — plan 63 §2 C / phase 6.
 *
 * Lexis is what is learned with a word, grammar is what is derived from a rule. They
 * split because they are paid for differently: forty nouns whose gender is unknown is
 * not a learner who handles the definite form badly, and a budget that cannot tell the
 * two apart spends the day on whichever happens to come due.
 */
export type SrsTrack = 'lexis' | 'grammar';

export const SRS_TRACKS: readonly SrsTrack[] = ['lexis', 'grammar'];

export function isSrsTrack(value: unknown): value is SrsTrack {
  return value === 'lexis' || value === 'grammar';
}

/**
 * The track a card type settles on its own, or null when the atom has to be asked.
 *
 * `GRAMMAR_ATOM` is the only kind whose track is not a fact about the type: the atom
 * carries it, and an author may deliberately put one on the lexical track — the gender
 * of a noun is learned with the noun, however much it lives inside a grammar rule.
 *
 * The exercise-scoped types answer `lexis` rather than nothing: they predate atoms and
 * are the learner's real schedule until phase 7 retires them, so they have to charge
 * some budget, and the budget they have always charged is the one words charge now.
 */
export function trackForContentType(contentType: SrsContentType): SrsTrack | null {
  switch (contentType) {
    case 'GRAMMAR_ATOM':
      return null;
    case 'EXERCISE':
    case 'EXERCISE_GAP':
    case 'VOCABULARY_WORD':
      return 'lexis';
  }
}
