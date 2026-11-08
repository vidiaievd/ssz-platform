/**
 * The sentence a word of the session is said in (plan 88, step 6b): «Nå sier jeg … igjen.» — the
 * word in focus, not at the end, the same frame its reference clip was synthesised in. The learner
 * imitates the clip, so the take must be the same sentence; ai-service judges the word in it by the
 * `word` thresholds and the frame around it as running speech (step 13.3).
 *
 * Kept in step with ai-service's `CARRIERS` (`reference-synthesis/domain/reference-clip.ts`): a
 * language added there needs its frame here, or its words cannot be drilled.
 */
const CARRIERS: Record<string, { before: string; after: string }> = {
  nb: { before: 'Nå sier jeg', after: 'igjen.' },
};

/** The carrier sentence of `word`; null for a language without a frame. */
export function carrierSentence(language: string, word: string): string | null {
  const carrier = CARRIERS[language];
  return carrier ? `${carrier.before} ${word} ${carrier.after}` : null;
}
