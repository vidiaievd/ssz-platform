import { randomInt } from 'node:crypto';
import {
  readContent,
  TEMPLATE_CODE as WORD_BANK_GAP_FILL,
  toStudentProjection,
} from '@ssz/shared-kernel/wordbank-gapfill';

/**
 * The content an exercise may show a student before they answer.
 *
 * For twelve of the thirteen templates this is the content itself: the answers live in
 * `expected_answers`, a separate column that student-facing responses never carry. The
 * thirteenth, `word_bank_gap_fill`, stores each sentence solved — the answer is a token
 * inside `content.sentences[].text` — so serving its content unchanged would put every
 * answer in the browser.
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
  if (templateCode !== WORD_BANK_GAP_FILL) return content;

  const projection = toStudentProjection(readContent(content), { shuffle: shuffled });
  return projection as unknown as Record<string, unknown>;
}

/**
 * Fisher–Yates over a copy. `randomInt` rather than `Math.random` because the bank order
 * is the one thing standing between a closed set of words and the answer key: a weak
 * generator that a client can predict would give the order away over a few attempts.
 */
function shuffled(words: string[]): string[] {
  const out = [...words];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
