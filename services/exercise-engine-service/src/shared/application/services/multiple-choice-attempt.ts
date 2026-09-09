import { shuffled } from '@ssz/shared-kernel/multiple-choice';

/**
 * The randomness a `multiple_choice` attempt is allowed to have, and where it comes from.
 *
 * Two things about this template are decided by chance and both are decided on the server
 * (plan 53 §3.4): the order the options are shown in, and which distractor survives a
 * 50/50. Neither may be computed in the browser — the client does not know which options
 * are wrong, and an order it shuffled would be an order the network tab had already shown
 * unshuffled — and neither may be freshly random per request either, or a reload would
 * re-deal the card the student is looking at and the judge would number the options
 * differently from the screen.
 *
 * So the seed is the attempt: the same attempt sees the same order for as long as it is
 * open, a different attempt sees a different one, and a test can assert an order rather
 * than a set.
 */

/**
 * A stable 32-bit number from the strings that identify what is being dealt.
 *
 * FNV-1a: not a hash anything depends on for secrecy — what it seeds is an order, and the
 * order is not the answer — but it has to spread well enough that two attempts on the
 * same exercise do not agree, which the sum of the character codes would not.
 */
export function seedFrom(...parts: readonly string[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    // Separate the parts, so ('ab','c') and ('a','bc') do not collide.
    hash = Math.imul(hash ^ 0x2f, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The shuffle the student projection is dealt with, seeded by the attempt.
 *
 * Stateful on purpose. The kernel's projection asks for one `<T>(items) => T[]` and calls
 * it once per question plus once for the question order, so a closure over a single seed
 * would deal every question of the same length the same permutation — options A/B/C
 * landing in the same places on every card, which reads as a pattern to anyone who looks.
 * The counter keeps each call distinct while keeping the whole deal reproducible: the
 * calls happen in document order, so the same attempt replays the same sequence.
 */
export function attemptShuffle(attemptId: string): <T>(items: readonly T[]) => T[] {
  const base = seedFrom(attemptId);
  let call = 0;
  return <T,>(items: readonly T[]): T[] => {
    call += 1;
    return shuffled(items, base + call);
  };
}
