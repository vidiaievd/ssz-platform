import { TEMPLATE_CODE as ERROR_CORRECTION } from '@ssz/shared-kernel/error-correction';
import { TEMPLATE_CODE as READ_ALOUD } from '@ssz/shared-kernel/read-aloud';
import { TEMPLATE_CODE as SHORT_ANSWER } from '@ssz/shared-kernel/short-answer';
import { isTranslateCode } from '@ssz/shared-kernel/translate';
import { TEMPLATE_CODE as WRITING_TASK, type RubricSnapshot } from '@ssz/shared-kernel/writing-task';
import type { AiDraftCapability } from '../../../domain/entities/attempt-ai-draft.entity.js';
import { errorCorrectionSubject, type ErrorCorrectionSubject } from './error-correction-subject.js';
import { readAloudSubject, type ReadAloudSubject } from './read-aloud-subject.js';
import { shortAnswerSubject, type ShortAnswerSubject } from './short-answer-subject.js';
import { translateSubject, type TranslateSubject } from './translate-subject.js';
import { writingTaskSubject, type WritingTaskSubject } from './writing-task-subject.js';

/** A submission beside its key, in the shape of its template's review prompt. */
export type ReviewSubject =
  | TranslateSubject
  | ErrorCorrectionSubject
  | WritingTaskSubject
  | ShortAnswerSubject
  | ReadAloudSubject;

/**
 * Whether ai-service has a review prompt for the template (plan 79: translate 1.1,
 * error_correction 1.7a, writing_task 1.7b, short_answer 1.7e). A `short_answer` of the old
 * single-question form is admitted here and refused by `reviewSubject`: the two forms share
 * the code, and only the document tells them apart.
 */
export function hasReviewPrompt(templateCode: string): boolean {
  return (
    isTranslateCode(templateCode) ||
    templateCode === ERROR_CORRECTION ||
    templateCode === WRITING_TASK ||
    templateCode === SHORT_ANSWER
  );
}

/** Whether the machine checks the template by ear, not by a prompt over text (plan 82). */
export function hasVoiceCheck(templateCode: string): boolean {
  return templateCode === READ_ALOUD;
}

/**
 * Whether a capability reads the template at all. A text prompt never sees a recording, and
 * the voice check never sees text: ai-service's text capabilities would read a `read_aloud`
 * subject as a template they do not know, so it is not handed to them.
 */
export function capabilityReads(capability: AiDraftCapability, templateCode: string): boolean {
  return capability === 'voice_review' ? hasVoiceCheck(templateCode) : hasReviewPrompt(templateCode);
}

/**
 * Whether the template's verdict is given sentence by sentence. A `writing_task` is marked
 * by rubric over the whole text, and a `short_answer` verdict stands over the whole set (plan
 * 51 Q3): neither carries per-item decisions, and a draft of either is measured by what the
 * teacher did with the remarks alone.
 */
export function decidedPerItem(templateCode: string): boolean {
  return templateCode !== WRITING_TASK && templateCode !== SHORT_ANSWER;
}

/**
 * The subject for a template `hasReviewPrompt` or `hasVoiceCheck` admits; null for any other,
 * and for an old-form `short_answer`.
 */
export function reviewSubject(
  templateCode: string,
  exercise: { content: unknown; expectedAnswers: unknown },
  attempt: { submittedAnswer: unknown; targetLanguage: string; rubricSnapshot: RubricSnapshot | null },
): ReviewSubject | null {
  if (isTranslateCode(templateCode)) {
    return translateSubject(templateCode, exercise.content, exercise.expectedAnswers, attempt.submittedAnswer);
  }
  if (templateCode === ERROR_CORRECTION) {
    return errorCorrectionSubject(exercise.content, exercise.expectedAnswers, attempt.submittedAnswer, attempt.targetLanguage);
  }
  if (templateCode === WRITING_TASK) {
    return writingTaskSubject(
      exercise.content,
      exercise.expectedAnswers,
      attempt.submittedAnswer,
      attempt.targetLanguage,
      attempt.rubricSnapshot,
    );
  }
  if (templateCode === SHORT_ANSWER) {
    return shortAnswerSubject(exercise.content, exercise.expectedAnswers, attempt.submittedAnswer, attempt.targetLanguage);
  }
  if (templateCode === READ_ALOUD) {
    return readAloudSubject(exercise.content, exercise.expectedAnswers, attempt.submittedAnswer, attempt.targetLanguage);
  }
  return null;
}
