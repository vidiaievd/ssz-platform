import type { GatewayRequest } from '../../../gateway/application/model-router.js';
import type { ReviewSubject } from '../../review-draft/prompts/prompts.js';
import { errorCorrectionDirectRequestV1 } from './error-correction.v1.js';
import { shortAnswerDirectRequestV1 } from './short-answer.v1.js';
import { translateDirectRequestV1 } from './translate.v1.js';
import { writingTaskDirectRequestV1 } from './writing-task.v1.js';

type Builders = { [T in ReviewSubject['template']]: (input: Extract<ReviewSubject, { template: T }>['input']) => GatewayRequest };

/**
 * Prompt versions of `review_direct`, as an admin names them on the binding. Its own line,
 * apart from `review_draft`'s: what a learner receives unchecked is versioned on its own, and
 * a draft prompt can change without moving what learners get. Same rule otherwise — a version
 * covers every template, and a change of wording is a new version.
 */
const VERSIONS: Record<string, Builders> = {
  'review_direct@1': {
    translate: translateDirectRequestV1,
    error_correction: errorCorrectionDirectRequestV1,
    writing_task: writingTaskDirectRequestV1,
    short_answer: shortAnswerDirectRequestV1,
  },
};

export const REVIEW_DIRECT_PROMPT_VERSIONS: readonly string[] = Object.keys(VERSIONS);

/** The request for a submission under a prompt version. The binding check keeps unknown versions out. */
export function directReviewRequest(promptVersion: string, subject: ReviewSubject): GatewayRequest {
  const builders = VERSIONS[promptVersion];
  if (!builders) throw new Error(`review_direct has no prompt version "${promptVersion}"`);
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
