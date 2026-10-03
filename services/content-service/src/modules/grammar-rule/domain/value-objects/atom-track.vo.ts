/**
 * Which SRS track an atom's evidence is spent on — plan 63 §2 C.
 *
 * Carried by the atom rather than by the rule, and that is the whole point. The gender of
 * a Norwegian noun is learnt one word at a time; the ending that follows from it is learnt
 * once. Both live inside the same rule, and scoring them together turns "does not know
 * forty genders" into "bad at definite forms" — a diagnosis that sends the learner to
 * exactly the wrong practice.
 */
export enum AtomTrack {
  LEXIS = 'lexis',
  GRAMMAR = 'grammar',
}

export const ATOM_TRACKS: readonly AtomTrack[] = [AtomTrack.LEXIS, AtomTrack.GRAMMAR];

export function isAtomTrack(value: string): value is AtomTrack {
  return (ATOM_TRACKS as readonly string[]).includes(value);
}
