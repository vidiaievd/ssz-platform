import { randomInt } from 'node:crypto';
import {
  readContent as readGapFill,
  TEMPLATE_CODE as WORD_BANK_GAP_FILL,
  toStudentProjection as gapFillProjection,
} from '@ssz/shared-kernel/wordbank-gapfill';
import {
  readContent as readMatchPairs,
  TEMPLATE_CODE as MATCH_PAIRS,
  toStudentProjection as matchPairsProjection,
} from '@ssz/shared-kernel/match-pairs';
import type { ProjectedItem } from '@ssz/shared-kernel/match-pairs';

/**
 * The content an exercise may show a student before they answer.
 *
 * For eleven of the thirteen templates this is the content itself: the answers live in
 * `expected_answers`, a separate column that student-facing responses never carry. Two
 * templates store their content solved, and serving it unchanged would put every answer
 * in the browser the moment the exercise opens:
 *
 * - `word_bank_gap_fill` keeps each sentence whole, so the answer is a token inside
 *   `content.sentences[].text`;
 * - `match_pairs` keeps each pair whole, so `content.pairs[].right` is the answer to
 *   `content.pairs[].left` (docs/plan/49-match-pairs.md).
 *
 * There are exactly two places content leaves this service towards a learner, and both
 * call this: the exercise response DTO and the internal attempt envelope in `graded`
 * mode. Anything that needs the raw document (the builder, the grading engine) asks for
 * the expected answers as well, and gets both.
 */
export function studentSafeContent(
  templateCode: string,
  content: Record<string, unknown>,
): Record<string, unknown> {
  if (templateCode === WORD_BANK_GAP_FILL) {
    const projection = gapFillProjection(readGapFill(content), { shuffle: shuffled });
    return projection as unknown as Record<string, unknown>;
  }

  if (templateCode === MATCH_PAIRS) {
    // `readContent` is called without the expected answers, which this function is
    // never given. That costs nothing for a document in the current shape — the
    // pairing lives inside `content.pairs`. A pre-plan-49 document held it in
    // `expected_answers` instead, and falls back to pairing by position, which may be
    // wrong; it is also unreachable here, because such a document has no `pairs` array
    // for the grader to agree with. The engine's own path passes both columns.
    const projection = matchPairsProjection(readMatchPairs(content), { shuffle: shuffled });
    return projection as unknown as Record<string, unknown>;
  }

  return content;
}

/**
 * Fisher–Yates over a copy. `randomInt` rather than `Math.random` because the pool order
 * is the one thing standing between a closed set of options and the answer key: a weak
 * generator that a client can predict would give the order away over a few attempts.
 */
function shuffled<T extends string | ProjectedItem>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
