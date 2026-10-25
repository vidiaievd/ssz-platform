import type { GatewayRequest } from '../../../gateway/application/model-router.js';
import type { ReviewSubject } from '../../review-draft/prompts/prompts.js';
import { errorCorrectionDirectRequestV1 } from './error-correction.v1.js';
import { shortAnswerDirectRequestV1 } from './short-answer.v1.js';
import { translateDirectRequestV1 } from './translate.v1.js';
import { framingFor, type ReviewAudience } from './verdict-rules.js';
import { writingTaskDirectRequestV1 } from './writing-task.v1.js';

type Builders = {
  [T in ReviewSubject['template']]: (
    input: Extract<ReviewSubject, { template: T }>['input'],
    audience: ReviewAudience,
  ) => GatewayRequest;
};

/**
 * Prompt versions of `review_direct`, as an admin names them on the binding. Its own line,
 * apart from `review_draft`'s: what a learner receives unchecked is versioned on its own, and
 * a draft prompt can change without moving what learners get. Same rule otherwise — a version
 * covers every template, and a change of wording is a new version.
 */
const VERSIONS: Record<string, Builders> = {
  // Written for a learner studying alone, whoever the learner is.
  'review_direct@1': {
    translate: (input) => translateDirectRequestV1(input),
    error_correction: (input) => errorCorrectionDirectRequestV1(input),
    writing_task: (input) => writingTaskDirectRequestV1(input),
    short_answer: (input) => shortAnswerDirectRequestV1(input),
  },
  // The same rules, opened for the audience (plan 80, step 3d): a school's learner is told a
  // teacher may read the work after the model.
  'review_direct@2': {
    translate: (input, audience) => translateDirectRequestV1(input, framingFor(audience)),
    error_correction: (input, audience) => errorCorrectionDirectRequestV1(input, framingFor(audience)),
    writing_task: (input, audience) => writingTaskDirectRequestV1(input, framingFor(audience)),
    short_answer: (input, audience) => shortAnswerDirectRequestV1(input, framingFor(audience)),
  },
};

export const REVIEW_DIRECT_PROMPT_VERSIONS: readonly string[] = Object.keys(VERSIONS);

/**
 * The request for a submission under a prompt version, for its audience. The binding check
 * keeps unknown versions out.
 */
export function directReviewRequest(
  promptVersion: string,
  subject: ReviewSubject,
  audience: ReviewAudience = 'self_study',
): GatewayRequest {
  const builders = VERSIONS[promptVersion];
  if (!builders) throw new Error(`review_direct has no prompt version "${promptVersion}"`);
  switch (subject.template) {
    case 'translate':
      return builders.translate(subject.input, audience);
    case 'error_correction':
      return builders.error_correction(subject.input, audience);
    case 'writing_task':
      return builders.writing_task(subject.input, audience);
    case 'short_answer':
      return builders.short_answer(subject.input, audience);
  }
}
