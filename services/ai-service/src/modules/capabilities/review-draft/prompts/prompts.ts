import type { GatewayRequest } from '../../../gateway/application/model-router.js';
import type { ErrorCorrectionReviewInput } from '../domain/error-correction-review.js';
import type { TranslateReviewInput } from '../domain/translate-review.js';
import type { WritingTaskReviewInput } from '../domain/writing-task-review.js';
import { errorCorrectionRequestV1 } from './error-correction.v1.js';
import { translateRequestV1 } from './translate.v1.js';
import { writingTaskRequestV1 } from './writing-task.v1.js';

/** A submission to review, by template. `short_answer` joins later in step 1.7. */
export type ReviewSubject =
  | { template: 'translate'; input: TranslateReviewInput }
  | { template: 'error_correction'; input: ErrorCorrectionReviewInput }
  | { template: 'writing_task'; input: WritingTaskReviewInput };

type Builders = { [T in ReviewSubject['template']]: (input: Extract<ReviewSubject, { template: T }>['input']) => GatewayRequest };

/**
 * Prompt versions of `review_draft`, as an admin names them on the binding. A version covers
 * every template, so switching a binding's version changes all of them at once; a template a
 * version does not know yet keeps the wording of the version it was introduced in.
 *
 * `error_correction` and `writing_task` joined v1 rather than starting v2: no draft of either
 * existed before, so nothing produced under v1 changes meaning.
 */
const VERSIONS: Record<string, Builders> = {
  'review_draft@1': {
    translate: translateRequestV1,
    error_correction: errorCorrectionRequestV1,
    writing_task: writingTaskRequestV1,
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
  }
}
