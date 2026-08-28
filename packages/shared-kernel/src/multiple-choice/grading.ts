// Grading for `multiple_choice`: one picked option at a time, and the attempt as a whole.
//
// The whole file exists because of plan 53 §3.2 — the key does not reach the browser, so
// the judge runs on the server and hands back only what the student is allowed to know at
// that moment. That "at that moment" is the substance:
//
//   * the key comes back **only once the question closes** — correct, revealed, or out of
//     attempts. Sending it with a wrong pick that still has a retry left would make both
//     the retry and the 50/50 theatre (IMPLEMENTATION.md, "Grading payload");
//   * the rule (`Question.why`) follows the same rule, plus `explainOnCorrect`;
//   * the rebuttal (`Option.why`) is the picked option's own, under `showWhyWrong`.
//
// Everything here is pure: the 50/50 takes a seed rather than reaching for randomness, so
// the same wrong pick eliminates the same distractor on a reload.

import { answerableQuestions, correctOption, filledOptions } from './derive.js';
import type { MultipleChoiceContent, Question, Settings } from './model.js';
import { maxAttempts } from './model.js';

export interface AnswerInput {
  question: Question;
  settings: Settings;
  /** The option the student picked. */
  optionId: string;
  /** 1-based: the attempt this pick belongs to. */
  attempt: number;
  /** The student pressed «Vis svaret» instead of retrying — the question closes. */
  reveal?: boolean;
  /** Options already dimmed by an earlier 50/50 on this question; they stay dimmed. */
  eliminated?: readonly string[];
  /** Chooses which distractor survives the 50/50. Server: per attempt and question. */
  seed?: number;
}

/** What `answer-question` returns — plan 53 §3.3, point 3. */
export interface AnswerVerdict {
  questionId: string;
  optionId: string;
  correct: boolean;
  attempt: number;
  attemptsLeft: number;
  /** No further pick is possible: right, revealed, or the budget is spent. */
  closed: boolean;
  /** Present only when `closed`. Never on a wrong pick with an attempt left. */
  keyOptionId?: string;
  /** The rule behind the right answer. */
  why?: string;
  /** The rebuttal of the option that was picked. */
  optionWhy?: string;
  /** The cumulative dimmed set, when the 50/50 fired on this pick. */
  eliminated?: string[];
}

export function judge(input: AnswerInput): AnswerVerdict {
  const { question: q, settings, optionId, attempt } = input;
  const key = correctOption(q);
  const picked = q.options.find((o) => o.id === optionId) ?? null;

  const correct = key !== null && key.id === optionId;
  const attemptsLeft = Math.max(0, maxAttempts(settings) - attempt);
  const closed = correct || input.reveal === true || attemptsLeft === 0;

  const verdict: AnswerVerdict = {
    questionId: q.id,
    optionId,
    correct,
    attempt,
    attemptsLeft,
    closed,
  };

  if (closed && key !== null) verdict.keyOptionId = key.id;

  const why = q.why.trim();
  const showWhy = correct ? settings.explainOnCorrect : closed;
  if (showWhy && why !== '') verdict.why = why;

  if (!correct && settings.showWhyWrong && picked !== null && picked.why.trim() !== '') {
    verdict.optionWhy = picked.why.trim();
  }

  if (!correct && !closed && settings.eliminate) {
    verdict.eliminated = eliminate(q, optionId, input.eliminated ?? [], input.seed ?? attempt);
  }

  return verdict;
}

/**
 * The 50/50 — README: "mark as eliminated: the picked option plus all-but-one of the
 * remaining wrong options. The key and one distractor always survive."
 *
 * The survival rule is the whole check, and it is why this cannot simply strike out the
 * pick: on a two-option question that would leave the key alone on screen and hand over
 * the answer under the name of a hint. When there is no distractor left to survive, the
 * help does not fire and the dimmed set comes back unchanged.
 */
export function eliminate(
  q: Question,
  pickedId: string,
  already: readonly string[],
  seed: number,
): string[] {
  const wrongs = filledOptions(q).filter((o) => !o.correct);
  const pool = wrongs.filter((o) => o.id !== pickedId && !already.includes(o.id));
  if (pool.length === 0) return [...already];

  const survivor = pool[Math.abs(Math.trunc(seed)) % pool.length]!;
  const next = new Set(already);
  next.add(pickedId);
  for (const o of pool) if (o.id !== survivor.id) next.add(o.id);
  return [...next];
}

/** One question's outcome inside a finished attempt. */
export interface QuestionOutcome {
  questionId: string;
  /** `null` when the student left the set before answering this one. */
  optionId: string | null;
  correct: boolean;
  /** Right on attempt 1 — the only thing that scores. */
  firstTry: boolean;
  attempt: number;
}

export interface SubmittedAnswer {
  questionId: string;
  optionId: string | null;
  /** 1-based. A client that omits it is treated as the first attempt. */
  attempt?: number;
}

export interface AttemptResult {
  outcomes: QuestionOutcome[];
  /** 0-100. The platform's contract, read by SRS: below 60 is `AGAIN`. */
  score: number;
  /** Every answerable question taken on the first attempt. */
  correct: boolean;
  firstTry: number;
  total: number;
}

/**
 * Grade a whole attempt from the submitted picks.
 *
 * Two rules, both decisions rather than consequences (plan 53 §3.5): only a first-attempt
 * hit scores, and a question that was never answered counts as wrong — otherwise leaving
 * a set halfway through scores better than finishing it.
 *
 * The server runs this over its own document, never over what the client claims: the
 * verdicts in the payload are not read here, only the picks.
 */
export function gradeAttempt(
  ex: MultipleChoiceContent,
  answers: readonly SubmittedAnswer[],
): AttemptResult {
  const questions = answerableQuestions(ex);
  const byId = new Map(answers.map((a) => [a.questionId, a]));

  const outcomes = questions.map((q): QuestionOutcome => {
    const key = correctOption(q);
    const answer = byId.get(q.id);
    const optionId = answer?.optionId ?? null;
    const attempt = Math.max(1, Math.trunc(answer?.attempt ?? 1));
    const correct = optionId !== null && key !== null && key.id === optionId;
    return { questionId: q.id, optionId, correct, firstTry: correct && attempt === 1, attempt };
  });

  const firstTry = outcomes.filter((o) => o.firstTry).length;
  const total = outcomes.length;

  return {
    outcomes,
    score: total === 0 ? 0 : Math.round((firstTry / total) * 100),
    correct: total > 0 && firstTry === total,
    firstTry,
    total,
  };
}
