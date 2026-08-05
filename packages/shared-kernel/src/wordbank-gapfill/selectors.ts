// Derived values for `word_bank_gap_fill`. Pure: same input, same output, no clock, no
// randomness, no I/O. This file is the single implementation behind AC-X1 — the client
// and the server must reach the same verdict on the same document, and two copies of
// these rules would not.
//
// Nothing here is persisted. Gap labels, the bank, coverage and grading are all
// recomputed from what the teacher typed.

import type {
  BankWord,
  Coverage,
  Gap,
  GapFeedback,
  GapKey,
  GapResult,
  Placement,
  WordBankGapFill,
} from './model.js';

/** What a gap with no authored feedback looks like. Frozen: it is handed out, not owned. */
export const EMPTY_FEEDBACK: GapFeedback = Object.freeze({
  fallback: '',
  why: '',
  pairs: Object.freeze({}) as GapFeedback['pairs'],
});

// The exact set from SPEC_data_model: « » " ' ( ) [ ] . , ! ? : ; — and nothing else.
// Widening it (typographic quotes, dashes) would change which answers are derived from
// existing content, so it is a content decision rather than a cleanup.
const LEADING_PUNCTUATION = /^[«»"'()[\].,!?:;]+/;
const TRAILING_PUNCTUATION = /[«»"'()[\].,!?:;]+$/;

/** Whitespace-split tokens. Blank text has no tokens — never `['']`. */
export function tokens(text: string): string[] {
  const trimmed = text.trim();
  return trimmed === '' ? [] : trimmed.split(/\s+/);
}

/**
 * The answer word inside a token: surrounding punctuation stripped, letters untouched.
 *
 * `æ ø å` are letters, not diacritics on `a` and `o`, and there is no Unicode folding
 * here in any direction — `regningen,` → `regningen`, but `på` stays `på` and `café`
 * stays `café`, in whichever normalisation form it arrived.
 */
export function core(token: string): string {
  return token.replace(LEADING_PUNCTUATION, '').replace(TRAILING_PUNCTUATION, '');
}

export function gapKey(sentenceId: string, tokenIndex: number): GapKey {
  return `${sentenceId}#${tokenIndex}`;
}

/**
 * Every gap in document order, labelled `G1…Gn`.
 *
 * Token indices that the sentence no longer has are skipped rather than reported: they
 * are the residue of an edit that has not been normalised yet (`withSentenceText`), and
 * a gap onto nothing is not something the teacher can see or fix.
 */
export function gaps(ex: WordBankGapFill): Gap[] {
  const out: Omit<Gap, 'label'>[] = [];

  ex.sentences.forEach((sentence, sentenceIndex) => {
    const sentenceTokens = tokens(sentence.text);
    const indices = [...new Set(sentence.gaps)].sort((a, b) => a - b);

    for (const tokenIndex of indices) {
      const token = sentenceTokens[tokenIndex];
      if (token === undefined) continue;

      out.push({
        key: gapKey(sentence.id, tokenIndex),
        sentenceId: sentence.id,
        sentenceIndex,
        tokenIndex,
        answer: core(token),
        sentence: sentence.text,
        ...(sentence.hint === undefined ? {} : { hint: sentence.hint }),
      });
    }
  });

  return out.map((gap, index) => ({ ...gap, label: `G${index + 1}` }));
}

/** Unique gap answers in document order. Empty tokens (pure punctuation) contribute nothing. */
export function answers(ex: WordBankGapFill): string[] {
  const seen: string[] = [];
  for (const gap of gaps(ex)) {
    if (gap.answer !== '' && !seen.includes(gap.answer)) seen.push(gap.answer);
  }
  return seen;
}

/**
 * The bank the student sees: answers first, then the teacher's distractors.
 *
 * A distractor that *is* an answer is dropped here so the bank never shows a word twice;
 * it is separately reported as the `BANK_DUPLICATE` blocker so the teacher finds out
 * rather than watching a chip vanish.
 *
 * Structural, and therefore the same in both input modes: in `free` mode the bank is not
 * rendered, but the stored distractors and pair matrix are kept, not deleted.
 */
export function bank(ex: WordBankGapFill): BankWord[] {
  const correct = answers(ex);
  const out: BankWord[] = correct.map((word) => ({ word, isAnswer: true }));

  for (const raw of ex.distractors) {
    const word = raw.trim();
    if (word === '') continue;
    if (out.some((existing) => equals(existing.word, word, ex.settings.caseSensitive))) continue;
    out.push({ word, isAnswer: false });
  }

  return out;
}

export function feedbackFor(ex: WordBankGapFill, key: GapKey): GapFeedback {
  return ex.feedback[key] ?? EMPTY_FEEDBACK;
}

/** Pair text that may be shown to a student: authored, non-blank. Drafts are not explanations yet. */
function authoredPairText(gapFeedback: GapFeedback, word: string): string | null {
  const pair = gapFeedback.pairs[word];
  if (pair === undefined || pair.origin !== 'author') return null;
  return pair.text.trim() === '' ? null : pair.text;
}

/**
 * How much of the (gap × wrong word) matrix is written.
 *
 * `total` is the whole matrix, so empty cells are legitimate — that is the point of the
 * design: only the per-gap `fallback` is required. In `free` mode there is nothing to
 * cover, because pairs never reach a student who types the word.
 */
export function coverage(ex: WordBankGapFill): Coverage {
  const allGaps = gaps(ex);
  const allWords = bank(ex);
  const pairsApply = ex.settings.input === 'bank';

  let total = 0;
  let written = 0;
  let noFallback = 0;

  for (const gap of allGaps) {
    const gapFeedback = feedbackFor(ex, gap.key);
    if (gapFeedback.fallback.trim() === '') noFallback += 1;
    if (!pairsApply) continue;

    for (const { word } of allWords) {
      if (word === gap.answer) continue;
      total += 1;
      if (authoredPairText(gapFeedback, word) !== null) written += 1;
    }
  }

  return {
    total,
    written,
    noFallback,
    pct: total === 0 ? 0 : Math.round((written / total) * 100),
    gaps: allGaps.length,
  };
}

/**
 * Answer comparison. NFC-normalised and trimmed; case-insensitive unless asked otherwise.
 *
 * `toLowerCase`, not `toLocaleLowerCase`: locale-sensitive casing would make the verdict
 * depend on where the code runs, and the client and the server have to agree (AC-X1).
 * Normalisation is NFC only — `æ ø å` survive it; nothing is folded to ASCII.
 */
export function equals(a: string, b: string, caseSensitive = false): boolean {
  const left = a.normalize('NFC').trim();
  const right = b.normalize('NFC').trim();
  return caseSensitive ? left === right : left.toLowerCase() === right.toLowerCase();
}

function isAccepted(ex: WordBankGapFill, gap: Gap, word: string): boolean {
  const { caseSensitive, input } = ex.settings;
  if (equals(word, gap.answer, caseSensitive)) return true;

  // Alternatives exist for the free-type mode (plan decision 3). In `bank` mode the set
  // is closed, so an "alternative" could only be another chip — accepting one there
  // would quietly make a distractor correct.
  if (input !== 'free') return false;
  const alternatives = ex.alternatives?.[gap.key] ?? [];
  return alternatives.some((alternative) => equals(word, alternative, caseSensitive));
}

/**
 * Grade every gap, whether or not the student filled it.
 *
 * Explanation resolution, the same rule the runner and the engine both owe the student:
 * correct → `why` (or nothing); wrong → the pair text for exactly that word, else the
 * gap's `fallback`. In `free` mode pairs are skipped — the word was typed, not chosen.
 */
export function grade(ex: WordBankGapFill, placements: Placement[]): GapResult[] {
  const placed = new Map(placements.map((placement) => [placement.gapKey, placement.word]));
  const pairsApply = ex.settings.input === 'bank';

  return gaps(ex).map((gap) => {
    // The student may type punctuation around the word; the gap's answer never carries it.
    const word = core((placed.get(gap.key) ?? '').trim());
    const gapFeedback = feedbackFor(ex, gap.key);

    if (isAccepted(ex, gap, word)) {
      const why = gapFeedback.why.trim();
      return { gapKey: gap.key, correct: true, explanation: why === '' ? null : gapFeedback.why };
    }

    const pairText = pairsApply ? authoredPairText(gapFeedback, word) : null;
    const fallback = gapFeedback.fallback.trim() === '' ? null : gapFeedback.fallback;
    return { gapKey: gap.key, correct: false, explanation: pairText ?? fallback };
  });
}

/**
 * Rewrite one sentence's text, dropping the gaps the new text no longer reaches.
 *
 * This is the edit the spec singles out: token indices `>= tokens.length` become
 * meaningless, and a gap that disappears takes its explanations with it (AC-B5). Gaps
 * that survive keep theirs, even when the word at that index changed — the answer is
 * re-derived from the text, which is the whole point of storing sentences solved.
 */
export function withSentenceText(
  ex: WordBankGapFill,
  sentenceId: string,
  text: string,
): WordBankGapFill {
  const limit = tokens(text).length;
  let dropped: GapKey[] = [];

  const sentences = ex.sentences.map((sentence) => {
    if (sentence.id !== sentenceId) return sentence;

    const kept = sentence.gaps.filter((tokenIndex) => tokenIndex < limit);
    dropped = sentence.gaps
      .filter((tokenIndex) => tokenIndex >= limit)
      .map((tokenIndex) => gapKey(sentenceId, tokenIndex));

    return { ...sentence, text, gaps: kept };
  });

  return { ...ex, sentences, ...withoutKeys(ex, dropped) };
}

/** The `feedback` / `alternatives` of `ex` minus `keys`, preserving an absent `alternatives`. */
function withoutKeys(
  ex: WordBankGapFill,
  keys: GapKey[],
): Pick<WordBankGapFill, 'feedback' | 'alternatives'> {
  if (keys.length === 0) return { feedback: ex.feedback, ...optionalAlternatives(ex.alternatives) };

  const drop = new Set(keys);
  const feedback = Object.fromEntries(
    Object.entries(ex.feedback).filter(([key]) => !drop.has(key)),
  );
  const alternatives =
    ex.alternatives === undefined
      ? undefined
      : Object.fromEntries(Object.entries(ex.alternatives).filter(([key]) => !drop.has(key)));

  return { feedback, ...optionalAlternatives(alternatives) };
}

function optionalAlternatives(
  alternatives: Record<GapKey, string[]> | undefined,
): Pick<WordBankGapFill, 'alternatives'> {
  return alternatives === undefined ? {} : { alternatives };
}

/**
 * Drop feedback that no longer refers to anything. Call this on save.
 *
 * Two kinds of orphan, both created by ordinary editing rather than by mistake:
 *
 * - entries for gaps that are gone (a deleted sentence, an un-gapped token);
 * - `pairs` keyed by a word that has left the bank — including the case where a rewrite
 *   turned that word into the gap's own answer, which leaves "why this word is wrong"
 *   attached to the right one.
 *
 * Silently, as the spec requires: the teacher already sees the coverage number move, and
 * a confirmation dialog on every rename would be noise.
 */
export function pruneFeedback(ex: WordBankGapFill): WordBankGapFill {
  const live = new Map(gaps(ex).map((gap) => [gap.key, gap]));
  const bankWords = new Set(bank(ex).map(({ word }) => word));

  const feedback: Record<GapKey, GapFeedback> = {};
  for (const [key, gapFeedback] of Object.entries(ex.feedback)) {
    const gap = live.get(key);
    if (gap === undefined) continue;

    const pairs = Object.fromEntries(
      Object.entries(gapFeedback.pairs).filter(
        ([word]) => bankWords.has(word) && word !== gap.answer,
      ),
    );
    feedback[key] = { ...gapFeedback, pairs };
  }

  const alternatives =
    ex.alternatives === undefined
      ? undefined
      : Object.fromEntries(Object.entries(ex.alternatives).filter(([key]) => live.has(key)));

  return { ...ex, feedback, ...optionalAlternatives(alternatives) };
}
