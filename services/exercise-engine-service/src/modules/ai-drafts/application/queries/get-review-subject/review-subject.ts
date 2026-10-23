import { TEMPLATE_CODE as ERROR_CORRECTION } from '@ssz/shared-kernel/error-correction';
import { isTranslateCode } from '@ssz/shared-kernel/translate';
import { errorCorrectionSubject, type ErrorCorrectionSubject } from './error-correction-subject.js';
import { translateSubject, type TranslateSubject } from './translate-subject.js';

/** A submission beside its key, in the shape of its template's review prompt. */
export type ReviewSubject = TranslateSubject | ErrorCorrectionSubject;

/** Whether ai-service has a review prompt for the template (plan 79: translate 1.1, error_correction 1.7). */
export function hasReviewPrompt(templateCode: string): boolean {
  return isTranslateCode(templateCode) || templateCode === ERROR_CORRECTION;
}

/** The subject for a template `hasReviewPrompt` admits; null for any other. */
export function reviewSubject(
  templateCode: string,
  exercise: { content: unknown; expectedAnswers: unknown },
  attempt: { submittedAnswer: unknown; targetLanguage: string },
): ReviewSubject | null {
  if (isTranslateCode(templateCode)) {
    return translateSubject(templateCode, exercise.content, exercise.expectedAnswers, attempt.submittedAnswer);
  }
  if (templateCode === ERROR_CORRECTION) {
    return errorCorrectionSubject(exercise.content, exercise.expectedAnswers, attempt.submittedAnswer, attempt.targetLanguage);
  }
  return null;
}
