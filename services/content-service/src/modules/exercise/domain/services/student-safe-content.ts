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
import {
  TEMPLATE_CODE as WRITING_TASK,
  toStudentProjection as writingTaskProjection,
} from '@ssz/shared-kernel/writing-task';
import {
  isShortAnswerDocument,
  TEMPLATE_CODE as SHORT_ANSWER,
  toStudentProjection as shortAnswerProjection,
} from '@ssz/shared-kernel/short-answer';
import {
  isMultipleChoiceDocument,
  TEMPLATE_CODE as MULTIPLE_CHOICE,
  toStudentProjection as multipleChoiceProjection,
} from '@ssz/shared-kernel/multiple-choice';
import {
  fromPersisted as sentenceSchemaDocument,
  isSentenceSchemaDocument,
  TEMPLATE_CODE as SENTENCE_SCHEMA,
  toStudentProjection as sentenceSchemaProjection,
} from '@ssz/shared-kernel/sentence-schema';
import {
  isMultipleChoiceGroupDocument,
  TEMPLATE_CODE as MULTIPLE_CHOICE_GROUP,
  toStudentProjection as multipleChoiceGroupProjection,
} from '@ssz/shared-kernel/multiple-choice-group';
import { withStudentAudio } from '@ssz/shared-kernel/audio';

/**
 * The content an exercise may show a student before they answer.
 *
 * For seven of the thirteen templates this is the content itself: the answers live in
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
 * `sentence_schema` is the fifth, and the one where the arrangement matters as much as
 * the omission. Its key — which field each chunk belongs in, which other fields also
 * accept it, the rule and the per-chunk notes — is in `expected_answers` already, and so
 * is `row.text`, the sentence in its correct order, which plan 52 §3.2 adds to the
 * handoff's list because it is the answer written out as a string. What is left is the
 * pieces, and the pieces have to be *shuffled here*: a bank in sentence order would hand
 * over the answer as surely as the key would, and a runner that shuffled it locally would
 * be shuffling something the network tab had already shown in order.
 *
 * It carried two document shapes for exactly one plan phase. Plan 52 §8 Q7 ended that:
 * all seven seeded exercises were rewritten, so a document that still looks like the old
 * one is a leftover rather than a form to support — and it is handed back untouched,
 * unprojected, rather than run through a projection that would read it as an empty set
 * and blank the exercise. `short_answer` above still has two, and this is what the end of
 * that looks like.
 *
 * `multiple_choice` is the sixth, and the one whose content column was built to have
 * nothing to leak. Which option is right is not a flag on the option and not its position
 * — it is a question id → option id map in `expected_answers`, put there by the kernel's
 * persistence module along with the rule behind the key and every rebuttal. So this
 * projection withholds by construction rather than by omission, and what it actually does
 * here is two other things: it drops options the author left blank, which are persisted as
 * authored and must not reach the runner, and it *shuffles* — for the same reason
 * `sentence_schema` does, and one more. The order the server computes the 50/50 by has to
 * be the order the student is looking at, so a runner that shuffled locally would be
 * numbering the options differently from the judge (plan 53 §3.4).
 *
 * It has two live document shapes, like `short_answer` and for the same reason: plan 53 §8
 * Q2 reseeds the first lesson of `norsk-b1` and leaves 121 exercises of the old
 * single-question form in place. Those hold no key in their content either — the correct
 * ids were always in `expected_answers` — so an old document travels as it always has.
 *
 * `multiple_choice_group` is the seventh, and the one where the omission and the
 * *readiness* are the same question. Its key is which shared column each statement
 * belongs in, and it is in `expected_answers` along with the author's line and the quote
 * that proves it — so nothing in the content column has to be taken away. What has to be
 * decided is which rows exist at all: a statement is ready only when it has text *and* a
 * marked column, and the mark is on the other side. `content` alone cannot tell a
 * finished statement from a half-written one, which is why this projection is the one
 * that takes both columns and could not be written to take one (plan 54 §1, fact 2). The
 * rows are shuffled here too, columns never.
 *
 * There are exactly two places content leaves this service towards a learner, and both
 * call this: the exercise response DTO and the internal attempt envelope in `graded`
 * mode. Anything that needs the raw document (the builder, the grading engine) asks for
 * the expected answers as well, and gets both.
 *
 * **One step here is not per-template**, and it is the audio block (plan 56 §3.3). The
 * transcript of a listening exercise is the answer, so it is withheld unless the policy
 * is `always` — and the block has to be *put back* afterwards, because the projections
 * below build a new object out of the content column and would drop it. Thirteen copies
 * of that rule would be twelve chances to forget it, so it wraps them all instead.
 */
export function studentSafeContent(
  templateCode: string,
  content: Record<string, unknown>,
  expectedAnswers: Record<string, unknown>,
): Record<string, unknown> {
  return withStudentAudio(
    projectByTemplate(templateCode, content, expectedAnswers),
    content,
    templateCode,
  );
}

/** The per-template half: what this one type keeps back from a learner. */
function projectByTemplate(
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

  if (templateCode === SENTENCE_SCHEMA) {
    // Not a set at all — a document predating the rewrite, or one written by hand. There
    // is nothing here to project and nothing to hide either: its key was always in the
    // other column. Handed back as it stands, so what is wrong with it stays visible.
    if (!isSentenceSchemaDocument(content)) return content;

    // Assembled from both columns before it can be taken apart: the projection has to
    // know where each chunk belongs in order to drop undeliverable sentences and to
    // count the chunks per field when the author asked for counts.
    const document = sentenceSchemaDocument(content, expectedAnswers);
    const projection = sentenceSchemaProjection(document, shuffled);
    return projection as unknown as Record<string, unknown>;
  }

  if (templateCode === MULTIPLE_CHOICE) {
    // The old form: one question, its options plain text, its key in the other column.
    // There is nothing here to project and nothing to hide, and running the new
    // projection over it would find no `questions` and blank the exercise.
    if (!isMultipleChoiceDocument(content)) return content;

    // The content column alone, unlike the four above: no setting on this template
    // reveals part of the key early, so there is nothing for the answer column to carry
    // into what the student sees before they pick.
    const projection = multipleChoiceProjection(content, shuffled);
    return projection as unknown as Record<string, unknown>;
  }

  if (templateCode === MULTIPLE_CHOICE_GROUP) {
    // The old form: `items[]`, each question carrying its own options, its key in
    // the other column. Nothing here to hide, and running the new projection over
    // one would find no `rows` and blank the exercise.
    if (!isMultipleChoiceGroupDocument(content)) return content;

    // Both columns, and this one is easy to get wrong: a row is ready only if the
    // author marked which column it belongs in, and that mark lives in
    // `expected_answers`. `content` alone cannot tell a finished statement from a
    // half-written one, so a call with `{}` here would hand back an empty table —
    // silently, and looking exactly like a table nobody has written yet.
    //
    // The projection asks the key column one question per row — «is there an
    // answer?» — and carries neither the answer, nor the author's line, nor the
    // quote. The quote is the part worth naming: it is the line of the passage
    // that proves the statement, which on a Riktig/Galt row is the answer written
    // out in the author's own words (plan 54 §3.2).
    //
    // And it *shuffles the rows*, for the reason `sentence_schema` and
    // `multiple_choice` do: an order computed in the browser is an order the
    // network tab had already shown unshuffled. Columns are never shuffled — that
    // would break the table header and the muscle memory of a Riktig/Galt grid.
    const projection = multipleChoiceGroupProjection(content, expectedAnswers, shuffled);
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
 *
 * Unconstrained in its element type on purpose: each kernel declares its own shape for a
 * bank item — a string here, `{ itemId, text }` there, `{ id, text }` in the third — and a
 * union of all three would have to be widened for every template that arrives next,
 * while adding nothing this function could get wrong.
 */
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
