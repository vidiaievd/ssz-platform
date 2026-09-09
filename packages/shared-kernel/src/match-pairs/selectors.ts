// Everything derived from a `match_pairs` document: the right-hand pool, the columns of
// the feedback matrix, coverage, the resolved explanation, and the grade.
//
// Nothing here is persisted. The pool is `pairs ++ distractors` computed on demand, so
// editing a pair's right half moves the answer, the pool chip and the matrix column in
// one edit — the property the spec calls "the answer is never stored twice".

import type {
  Coverage,
  MatchPairs,
  MatchTask,
  Override,
  Pair,
  PairFeedback,
  PairId,
  PairResult,
  Placement,
  RightId,
  RightItem,
} from './model.js';

export const EMPTY_FEEDBACK: PairFeedback = { def: '', why: '', ov: {} };

/**
 * Trim, collapse internal whitespace, lowercase. For **comparison only** — never stored,
 * never shown.
 *
 * Deliberately not a diacritic strip: `æ ø å` are letters of the target language, not
 * decorations on a Latin base, and folding them would make "får" and "far" the same
 * word. Composed form is left as it arrives (AC-X5: NFC round-trips unchanged).
 */
export function norm(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The pairs a student could actually be asked to complete: both halves written.
 *
 * A pair with neither half filled is a row the teacher has not written yet, not an
 * error — it is ignored everywhere. A pair with exactly one half is an error, reported
 * by `issues`, and is excluded here too: half a pair cannot be graded.
 */
export function completePairs(task: MatchTask): Pair[] {
  return task.pairs.filter((pair) => pair.left.trim() !== '' && pair.right.trim() !== '');
}

/**
 * The right-hand pool, in author order: every complete pair's right half, then the
 * distractors when they are switched on.
 *
 * Empty text is filtered out before a student ever sees it, so a half-written distractor
 * is invisible rather than an empty chip. `settings.distractors` only decides whether the
 * extras take part — it never deletes them, which is what makes the toggle safe to flip
 * while authoring (AC-B14).
 */
export function rightItems(task: MatchTask): RightItem[] {
  const answers: RightItem[] = completePairs(task).map((pair, index) => ({
    id: pair.rightId,
    text: pair.right,
    kind: 'answer',
    n: index + 1,
  }));

  if (!task.settings.distractors) return answers;

  const extras: RightItem[] = task.distractors
    .filter((distractor) => distractor.text.trim() !== '')
    .map((distractor) => ({ id: distractor.id, text: distractor.text, kind: 'distractor' }));

  return [...answers, ...extras];
}

/** The pool minus this pair's own half — the editable columns of its matrix row. */
export function wrongItems(task: MatchTask, pairId: PairId): RightItem[] {
  const pair = task.pairs.find((candidate) => candidate.id === pairId);
  return rightItems(task).filter((item) => item.id !== pair?.rightId);
}

export function feedbackFor(ex: MatchPairs, pairId: PairId): PairFeedback {
  return ex.feedback[pairId] ?? EMPTY_FEEDBACK;
}

/** Authored override text for one cell, or `null` — an AI draft is not an explanation yet. */
function authoredOverride(feedback: PairFeedback, rightId: RightId): string | null {
  const override = feedback.ov[rightId];
  if (override === undefined || override.origin !== 'author') return null;
  return override.text.trim() === '' ? null : override.text;
}

/**
 * What the student is told when they attach `rightId` to `pairId`: the cell's own
 * override, else the pair's default, else nothing.
 *
 * `null` rather than an empty string, so a caller cannot render a bare dash where an
 * explanation was expected (AC-S9). Nothing invents a reason the teacher did not give.
 */
export function explanationFor(ex: MatchPairs, pairId: PairId, rightId: RightId): string | null {
  const feedback = feedbackFor(ex, pairId);
  const override = authoredOverride(feedback, rightId);
  if (override !== null) return override;
  return feedback.def.trim() === '' ? null : feedback.def;
}

/**
 * How much of the matrix is written, counted against the pool **as currently
 * configured**: switching the extras off drops their columns from `total` rather than
 * leaving the meter stuck below a figure the teacher can no longer reach.
 */
export function coverage(ex: MatchPairs): Coverage {
  const pairs = completePairs(ex);
  const pool = rightItems(ex);

  let total = 0;
  let written = 0;
  let noDefault = 0;

  for (const pair of pairs) {
    const feedback = feedbackFor(ex, pair.id);
    if (feedback.def.trim() === '') noDefault += 1;

    for (const item of pool) {
      if (item.id === pair.rightId) continue;
      total += 1;
      if (authoredOverride(feedback, item.id) !== null) written += 1;
    }
  }

  return {
    total,
    written,
    noDefault,
    pct: total === 0 ? 0 : Math.round((written / total) * 100),
    pairs: pairs.length,
  };
}

/**
 * Grade the placements the student sent, and only those.
 *
 * Partial submission is legal for this type and deliberate (BEHAVIOR §2.2): a student who
 * has matched three of five learns most from checking those three. Pairs absent from
 * `placements` are unanswered, not wrong, so they produce no result at all — a caller
 * reporting "N av M riktige" takes M from `completePairs`, never from this list's length.
 *
 * Comparison is by id, so nothing is normalised here: text normalisation belongs to
 * duplicate detection, where two halves that *read* the same are the problem.
 */
export function grade(ex: MatchPairs, placements: Placement[]): PairResult[] {
  const byPair = new Map(placements.map((placement) => [placement.pairId, placement.rightId]));

  return completePairs(ex).flatMap((pair) => {
    const rightId = byPair.get(pair.id);
    if (rightId === undefined) return [];

    return [
      rightId === pair.rightId
        ? { pairId: pair.id, correct: true, explanation: null }
        : { pairId: pair.id, correct: false, explanation: explanationFor(ex, pair.id, rightId) },
    ];
  });
}

/** Every complete pair answered correctly — the exercise is done. */
export function isSolved(ex: MatchPairs, placements: Placement[]): boolean {
  const pairs = completePairs(ex);
  if (pairs.length === 0) return false;

  const results = grade(ex, placements);
  return results.length === pairs.length && results.every((result) => result.correct);
}

/**
 * Drop feedback that no longer addresses anything: entries for pairs that were deleted,
 * and overrides naming a half that has left the document.
 *
 * This is the whole of the spec's cascade. Deleting a pair deletes its feedback row *and*
 * every other pair's override that pointed at its half; deleting a distractor deletes its
 * column everywhere. Expressing it as one prune over the finished document, rather than
 * as consequences bolted onto each edit, is what stops the two from disagreeing — the
 * builder and the server's save-time cleanup call the same function.
 *
 * Note what it does **not** prune: overrides on a distractor that is merely switched off.
 * `settings.distractors` is a display rule, and treating it as a delete would lose the
 * teacher's writing the moment they flipped a toggle to see what the pool looked like.
 */
export function pruneFeedback(ex: MatchPairs): MatchPairs {
  const livePairs = new Set(ex.pairs.map((pair) => pair.id));
  // Every id that can legitimately key an override: pool halves and *all* distractors,
  // switched on or not.
  const liveHalves = new Set<RightId>([
    ...ex.pairs.map((pair) => pair.rightId),
    ...ex.distractors.map((distractor) => distractor.id),
  ]);

  const feedback: Record<PairId, PairFeedback> = {};
  for (const [pairId, entry] of Object.entries(ex.feedback)) {
    if (!livePairs.has(pairId)) continue;

    const ov: Record<RightId, Override> = {};
    for (const [rightId, override] of Object.entries(entry.ov)) {
      if (liveHalves.has(rightId)) ov[rightId] = override;
    }
    feedback[pairId] = { ...entry, ov };
  }

  return { ...ex, feedback };
}

/**
 * Deterministic shuffle, seeded — a linear congruential generator (Numerical Recipes
 * constants) driving a Fisher–Yates pass.
 *
 * Deterministic on purpose, and only for the builder's preview: a pool that reordered on
 * every keystroke would make the preview unreadable while typing (AC-B29). The order a
 * *student* sees is shuffled by the server with `randomInt`, because there the order is
 * the one thing standing between a closed pool and the answer key, and a caller who could
 * guess the seed could reconstruct it.
 */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = (Math.trunc(seed) >>> 0) || 1;

  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }

  return out;
}
