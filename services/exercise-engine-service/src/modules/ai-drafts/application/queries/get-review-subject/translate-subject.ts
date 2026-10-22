import {
  fromPersisted,
  itemDirection,
  readSubmission,
  runItems,
  type ItemDirection,
  type TranslateType,
} from '@ssz/shared-kernel/translate';

/** One sentence of a `translate_*` submission as a reviewer sees it: the key beside the answer. */
export interface TranslateSubjectSentence {
  itemId: string;
  direction: ItemDirection;
  source: string;
  /** Accepted translations, inline `(a|b)` alternatives unexpanded. */
  refs: string[];
  answer: string;
  explanation?: string;
  teacherNote?: string;
}

/** What ai-service reviews a `translate_*` submission from (plan 79, step 1.3). */
export interface TranslateSubject {
  template: 'translate';
  langs: { explain: string; target: string };
  /** The author's AI block, as stored — ai-service decides what it allows. */
  ai: { on: boolean; checks: { grammar: boolean; order: boolean; lexis: boolean; register: boolean } };
  sentences: TranslateSubjectSentence[];
}

/**
 * The submission read through the template's own model, so the sentences are the ones the
 * learner was shown (`single` runs only the first) and each has its effective direction.
 */
export function translateSubject(
  code: TranslateType,
  content: unknown,
  expectedAnswers: unknown,
  submittedAnswer: unknown,
): TranslateSubject {
  const document = fromPersisted(
    // The envelope is the exercise row's business; the review needs none of it.
    { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' },
    code,
    content,
    expectedAnswers,
  );
  const answers = readSubmission(submittedAnswer);

  return {
    template: 'translate',
    langs: document.langs,
    ai: { on: document.ai.on, checks: document.ai.checks },
    sentences: runItems(document).map((item) => ({
      itemId: item.id,
      direction: itemDirection(document, item),
      source: item.source,
      refs: item.refs.filter((ref) => ref.trim() !== ''),
      answer: answers[item.id] ?? '',
      ...(item.explanation?.trim() ? { explanation: item.explanation } : {}),
      ...(item.teacherNote?.trim() ? { teacherNote: item.teacherNote } : {}),
    })),
  };
}
