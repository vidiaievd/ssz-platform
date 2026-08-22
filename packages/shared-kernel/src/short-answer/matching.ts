// Normalisation and anchor matching — README "The grading engine, port verbatim".
//
// This is the whole mechanism. There is no lemmatiser and no synonym dictionary:
// Norwegian inflection is handled by the author writing variants (`familien`,
// `familie`). Matching is word-based, order-sensitive *inside* a phrase — `lys foran`
// requires those two words adjacent — and order-free *between* elements.
//
// Everything here is pure and synchronous. The builder calls it on every keystroke in
// three places at once (element hit states, the try-an-answer box, the review queue),
// so it stays O(words × anchors) with an early exit in the Levenshtein.

/** Lowercase, strip the punctuation a student's sentence carries, collapse whitespace. */
export function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[«»"'.,;:!?()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

/**
 * Levenshtein distance, early-exiting at 2 when the lengths differ by more than one.
 *
 * The only caller tolerates a distance of 1, so anything above that is interchangeable:
 * returning 2 for "definitely more than one" is the early exit, not a real distance.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;

  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows[i] = [i];
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length]![b.length]!;
}

/**
 * Are these two words the same, allowing for one slip?
 *
 * The typo tolerance deliberately does **not** apply to words of three characters or
 * fewer, in either position. That is what keeps `bak` and `bok` apart — and it is also
 * why an anchor as short as `lys` never matches `lyys`. BEHAVIOR.md's worked cases walk
 * into that trap on purpose; the fix there is an extra anchor variant, not a wider
 * tolerance.
 */
export function wordEquals(a: string, b: string, typos: boolean): boolean {
  return a === b || (typos && a.length > 3 && b.length > 3 && levenshtein(a, b) <= 1);
}

/** Does the answer contain this anchor phrase as a contiguous run of words? */
export function hasAnchor(answerWords: readonly string[], anchor: string, typos: boolean): boolean {
  const anchorWords = words(anchor);
  if (anchorWords.length === 0) return false;

  for (let i = 0; i + anchorWords.length <= answerWords.length; i++) {
    let ok = true;
    for (let j = 0; j < anchorWords.length; j++) {
      if (!wordEquals(answerWords[i + j]!, anchorWords[j]!, typos)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}
