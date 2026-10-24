import {
  fromPersisted,
  gradeAttempt,
  isShortAnswerDocument,
  type QuestionKind,
  type SubmittedAnswer,
  type Verdict,
} from '@ssz/shared-kernel/short-answer';

/** One thing the answer had to say, and whether the phrase match found it said. */
export interface ShortAnswerSubjectElement {
  label: string;
  required: boolean;
  /** One of the author's anchor phrases occurs in the answer — the same `grade` the queue shows. */
  hit: boolean;
}

/** One answered question of a `short_answer` submission as a reviewer sees it. */
export interface ShortAnswerSubjectQuestion {
  /** The question id — what the queue's rows and the draft's remarks are keyed by. */
  itemId: string;
  kind: QuestionKind;
  /** The text, or the transcript of the audio, the question is about; empty for `opinion`. */
  passage: string;
  prompt: string;
  /** The author's own answer. */
  model: string;
  /** The author's explanation of what the answer had to say; empty when there is none. */
  why: string;
  elements: ShortAnswerSubjectElement[];
  verdict: Verdict;
  /** Shorter than the author's minimum: the check capped it at `partial`. */
  tooShort: boolean;
  /** The learner's answer, as submitted. */
  answer: string;
}

/** What ai-service reviews a `short_answer` submission from (plan 79, step 1.7e). */
export interface ShortAnswerSubject {
  template: 'short_answer';
  /** The language learnt, as the attempt records it (`nb`). The template carries no labels. */
  targetLanguage: string;
  instruction: string;
  /** The author's AI stage as stored — ai-service decides what it allows. */
  ai: { on: boolean; checks: { grammar: boolean } };
  questions: ShortAnswerSubjectQuestion[];
}

/**
 * The answers beside their keys, read through the template's own grader — the same
 * `gradeAttempt` the validator ran and the queue shows — so the reviewer is told which key
 * points the phrase match found rather than having to look for them.
 *
 * Only questions the learner answered go: a skipped one has nothing to quote and the queue
 * already shows it as skipped, and an answer to a question the document no longer holds has
 * no key to read it against. Null for a document of the old single-question form, which has
 * no key points to review by (plan 51 §8 Q1).
 */
export function shortAnswerSubject(
  content: unknown,
  expectedAnswers: unknown,
  submittedAnswer: unknown,
  targetLanguage: string,
): ShortAnswerSubject | null {
  if (!isShortAnswerDocument(content)) return null;
  const document = fromPersisted(content, expectedAnswers);
  const outcome = gradeAttempt(document, readSubmittedAnswers(submittedAnswer));

  return {
    template: 'short_answer',
    targetLanguage,
    instruction: document.instruction,
    ai: { on: document.settings.aiStage, checks: { grammar: document.settings.aiGrammar } },
    questions: outcome.answers.flatMap((answer) => {
      if (answer.skipped || !answer.question || !answer.result) return [];
      const { question, result } = answer;
      return [
        {
          itemId: question.id,
          kind: question.kind,
          passage: question.passage,
          prompt: question.prompt,
          model: question.model,
          why: question.why,
          elements: result.hits.map((hit) => ({ label: hit.label, required: hit.required, hit: hit.anchor !== null })),
          verdict: result.verdict,
          tooShort: result.tooShort,
          answer: answer.text,
        },
      ];
    }),
  };
}

/** `[{ questionId, text }]`, bare or under `answers`, as the validator reads it; anything else is none. */
function readSubmittedAnswers(submitted: unknown): SubmittedAnswer[] {
  const list = Array.isArray(submitted)
    ? submitted
    : typeof submitted === 'object' && submitted !== null
      ? (submitted as { answers?: unknown }).answers
      : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return [];
    const { questionId, text } = raw as { questionId?: unknown; text?: unknown };
    return typeof questionId === 'string' && questionId !== ''
      ? [{ questionId, text: typeof text === 'string' ? text : '' }]
      : [];
  });
}
