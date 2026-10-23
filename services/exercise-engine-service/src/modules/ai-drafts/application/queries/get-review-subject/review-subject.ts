import { TEMPLATE_CODE as ERROR_CORRECTION } from '@ssz/shared-kernel/error-correction';
import { isTranslateCode } from '@ssz/shared-kernel/translate';
import { TEMPLATE_CODE as WRITING_TASK } from '@ssz/shared-kernel/writing-task';
import { errorCorrectionSubject, type ErrorCorrectionSubject } from './error-correction-subject.js';
import { translateSubject, type TranslateSubject } from './translate-subject.js';
import { writingTaskSubject, type WritingTaskSubject } from './writing-task-subject.js';

/** A submission beside its key, in the shape of its template's review prompt. */
export type ReviewSubject = TranslateSubject | ErrorCorrectionSubject | WritingTaskSubject;

/**
 * Whether ai-service has a review prompt for the template (plan 79: translate 1.1,
 * error_correction 1.7a, writing_task 1.7b).
 */
export function hasReviewPrompt(templateCode: string): boolean {
  return isTranslateCode(templateCode) || templateCode === ERROR_CORRECTION || templateCode === WRITING_TASK;
}

/**
 * Whether the template's verdict is given sentence by sentence. A `writing_task` is marked
 * by rubric over the whole text: its verdict carries no per-item decisions, and a draft of
 * it is measured by what the teacher did with the remarks alone.
 */
export function decidedPerItem(templateCode: string): boolean {
  return templateCode !== WRITING_TASK;
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
  if (templateCode === WRITING_TASK) {
    return writingTaskSubject(exercise.content, exercise.expectedAnswers, attempt.submittedAnswer, attempt.targetLanguage);
  }
  return null;
}
