import type { ReviewAspect } from '../domain/review-aspect.js';
import type { TranslateReviewInput } from '../domain/translate-review.js';
import type { TranslateSubject } from './ports/review-attempts.client.js';

/**
 * The prompt's input from a submission as exercise-engine reads it — one shape for the
 * teacher's queue (1.3) and for a candidate's run over the set (1.6), so a model is
 * measured on exactly what it would be asked in the queue.
 */
export function toReviewInput(
  subject: TranslateSubject,
  aspects: ReviewAspect[],
  commentLanguage: string,
): TranslateReviewInput {
  return {
    langs: subject.langs,
    commentLanguage,
    aspects,
    sentences: subject.sentences.map((s) => ({
      itemId: s.itemId,
      direction: s.direction,
      source: s.source,
      refs: s.refs,
      answer: s.answer,
      ...(s.explanation ? { explanation: s.explanation } : {}),
      ...(s.teacherNote ? { teacherNote: s.teacherNote } : {}),
    })),
  };
}
