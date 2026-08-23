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
import {
  TEMPLATE_CODE as WRITING_TASK,
  toStudentProjection as writingTaskProjection,
} from '@ssz/shared-kernel/writing-task';
import {
  isShortAnswerDocument,
  TEMPLATE_CODE as SHORT_ANSWER,
  toStudentProjection as shortAnswerProjection,
} from '@ssz/shared-kernel/short-answer';

/**
 * The content an exercise may show a student before they answer.
 *
 * For ten of the thirteen templates this is the content itself: the answers live in
 * `expected_answers`, a separate column that student-facing responses never carry. Two
 * templates store their content solved, and serving it unchanged would put every answer
 * in the browser the moment the exercise opens:
 *
 * - `word_bank_gap_fill` keeps each sentence whole, so the answer is a token inside
 *   `content.sentences[].text`;
 * - `match_pairs` keeps each pair whole, so `content.pairs[].right` is the answer to
 *   `content.pairs[].left` (docs/plan/49-match-pairs.md).
 *
 * `writing_task` is the third, and it is the reason this function takes the answer
 * column at all. Its content hides nothing — the key is in its own column already — but
 * one setting runs the other way: with `showRubric: 'always'` the rubric's level
 * descriptors are a writing guide and have to reach the student *before* the mark, and
 * they live in `expected_answers`. A projection built from `content` alone would look
 * correct and silently drop the feature (docs/plan/50-writing-task.md §5).
 *
 * That is also why the parameter is required rather than optional. An optional answer
 * column is one a caller forgets, and the failure is invisible: the page renders, the
 * task works, only the guide the author switched on is missing.
 *
 * `short_answer` is the fourth, and the one where the stakes are plainest. Its key is a
 * set of anchor phrases — the answer written in the words the student is being asked to
 * find — so the projection ships the prompt and drops the elements, the model answer and
 * the explanation. `showModel: 'always'` runs the other way, exactly as `showRubric`
 * does above, which is the second reason this function takes the answer column.
 *
 * It is also the one template here with two live document shapes. Plan 51 §8 Q1 leaves
 * the 144 documents of the old single-question form in place until the catalogue is
 * rewritten, and those hold no key in their content at all — the accepted strings were
 * always in `expected_answers`. Running the new projection over one would return an
 * empty question set and blank the exercise, so the shape is checked first.
 *
 * There are exactly two places content leaves this service towards a learner, and both
 * call this: the exercise response DTO and the internal attempt envelope in `graded`
 * mode. Anything that needs the raw document (the builder, the grading engine) asks for
 * the expected answers as well, and gets both.
 */
export function studentSafeContent(
  templateCode: string,
  content: Record<string, unknown>,
  expectedAnswers: Record<string, unknown>,
): Record<string, unknown> {
  if (templateCode === WORD_BANK_GAP_FILL) {
    const projection = gapFillProjection(readGapFill(content), { shuffle: shuffled });
    return projection as unknown as Record<string, unknown>;
  }

  if (templateCode === MATCH_PAIRS) {
    // Both columns, as the engine's own path does: a document in the current shape keeps
    // its pairing inside `content.pairs`, but a pre-plan-49 one held it in
    // `expected_answers`, and reading the content alone would fall back to pairing by
    // position — a wrong answer key rather than a near miss.
    const projection = matchPairsProjection(readMatchPairs(content, expectedAnswers), {
      shuffle: shuffled,
    });
    return projection as unknown as Record<string, unknown>;
  }

  if (templateCode === SHORT_ANSWER) {
    // The old form keeps nothing secret in its content — one question and its context —
    // so it travels as it always has.
    if (!isShortAnswerDocument(content)) return content;

    const projection = shortAnswerProjection(content, expectedAnswers);
    return projection as unknown as Record<string, unknown>;
  }

  if (templateCode === WRITING_TASK) {
    const projection = writingTaskProjection(content, expectedAnswers);
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
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
