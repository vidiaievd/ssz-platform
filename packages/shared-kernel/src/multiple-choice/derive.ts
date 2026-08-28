// What can be derived from a document without knowing anything else about it.
//
// These four functions are the single definition of "this question works" and are asked
// by the runner, the projection, the validator and the publish preflight alike. The
// handoff calls them `mcCorrect`, `mcFilled` and `mcReady` and warns what happens when
// each screen re-derives them for itself: the builder drifts.

import type { MultipleChoiceContent, Option, Question } from './model.js';

/** The option marked as the key, or `null`. Never more than one — see `setKey`. */
export function correctOption(q: Question): Option | null {
  return q.options.find((o) => o.correct) ?? null;
}

/** Options with text. Empty ones are dropped at runtime, not saved as blanks. */
export function filledOptions(q: Question): Option[] {
  return q.options.filter((o) => o.text.trim() !== '');
}

/**
 * Whether this question can be shown to a student: it has a stem, at least two options
 * with text, and a key that is one of them and is not blank.
 */
export function isAnswerable(q: Question): boolean {
  const key = correctOption(q);
  return q.stem.trim() !== '' && filledOptions(q).length >= 2 && key !== null && key.text.trim() !== '';
}

/** The questions a student may be shown, in author order. */
export function answerableQuestions(ex: MultipleChoiceContent): Question[] {
  return ex.questions.filter(isAnswerable);
}

/**
 * Mark one option as the key, clearing every other in that question.
 *
 * Lives here rather than in the builder because "never two keys" is a rule of the model:
 * the validator, the projection and the grader all assume `correctOption` is unambiguous,
 * and an editor that set the flag directly could break that assumption in one keystroke.
 */
export function setKey(q: Question, optionId: string): Question {
  return { ...q, options: q.options.map((o) => ({ ...o, correct: o.id === optionId })) };
}
