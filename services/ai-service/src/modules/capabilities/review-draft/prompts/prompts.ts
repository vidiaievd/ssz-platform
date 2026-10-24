import type { GatewayRequest } from '../../../gateway/application/model-router.js';
import type { ErrorCorrectionReviewInput } from '../domain/error-correction-review.js';
import type { ShortAnswerReviewInput } from '../domain/short-answer-review.js';
import type { TranslateReviewInput } from '../domain/translate-review.js';
import type { WritingTaskReviewInput } from '../domain/writing-task-review.js';
import { errorCorrectionRequestV1 } from './error-correction.v1.js';
import { shortAnswerRequestV1 } from './short-answer.v1.js';
import { translateRequestV1 } from './translate.v1.js';
import { writingTaskRequestV1 } from './writing-task.v1.js';
import { writingTaskRequestV2 } from './writing-task.v2.js';

/** A submission to review, by template. */
export type ReviewSubject =
  | { template: 'translate'; input: TranslateReviewInput }
  | { template: 'error_correction'; input: ErrorCorrectionReviewInput }
  | { template: 'writing_task'; input: WritingTaskReviewInput }
  | { template: 'short_answer'; input: ShortAnswerReviewInput };

type Builders = { [T in ReviewSubject['template']]: (input: Extract<ReviewSubject, { template: T }>['input']) => GatewayRequest };

/**
 * Prompt versions of `review_draft`, as an admin names them on the binding. A version covers
 * every template, so switching a binding's version changes all of them at once; a template a
 * version does not know yet keeps the wording of the version it was introduced in.
 *
 * `error_correction`, `writing_task` and `short_answer` joined v1 rather than starting a new
 * version: no draft of any of them existed before, so nothing produced under v1 changes meaning.
 * `short_answer` arrived after v2 and has the same wording in both.
 *
 * v2 (step 1.7c) asks a `writing_task` for suggested rubric marks when the author's `draft`
 * switch is on; every other request is v1's unchanged.
 */
const VERSIONS: Record<string, Builders> = {
  'review_draft@1': {
    translate: translateRequestV1,
    error_correction: errorCorrectionRequestV1,
    writing_task: writingTaskRequestV1,
    short_answer: shortAnswerRequestV1,
  },
  'review_draft@2': {
    translate: translateRequestV1,
    error_correction: errorCorrectionRequestV1,
    writing_task: writingTaskRequestV2,
    short_answer: shortAnswerRequestV1,
  },
};

export const REVIEW_DRAFT_PROMPT_VERSIONS: readonly string[] = Object.keys(VERSIONS);

/** The request for a submission under a prompt version. The binding check keeps unknown versions out. */
export function reviewRequest(promptVersion: string, subject: ReviewSubject): GatewayRequest {
  const builders = VERSIONS[promptVersion];
  if (!builders) throw new Error(`review_draft has no prompt version "${promptVersion}"`);
  switch (subject.template) {
    case 'translate':
      return builders.translate(subject.input);
    case 'error_correction':
      return builders.error_correction(subject.input);
    case 'writing_task':
      return builders.writing_task(subject.input);
    case 'short_answer':
      return builders.short_answer(subject.input);
  }
}
