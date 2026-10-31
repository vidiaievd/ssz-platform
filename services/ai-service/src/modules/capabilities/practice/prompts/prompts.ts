import type { GatewayRequest } from '../../../gateway/application/model-router.js';
import type { ReviewSubject } from '../../review-draft/prompts/prompts.js';
import {
  errorCorrectionPracticeRequestV1,
  shortAnswerPracticeRequestV1,
  translatePracticeRequestV1,
  writingTaskPracticeRequestV1,
} from './practice.v1.js';

type Builders = { [T in ReviewSubject['template']]: (input: Extract<ReviewSubject, { template: T }>['input']) => GatewayRequest };

/**
 * Prompt versions of `practice`, as an admin names them on the binding. Its own line, apart
 * from the draft's and the direct review's: what a learner reads before hand-in is versioned
 * on its own. A version covers every template.
 */
const VERSIONS: Record<string, Builders> = {
  'practice@1': {
    translate: translatePracticeRequestV1,
    error_correction: errorCorrectionPracticeRequestV1,
    writing_task: writingTaskPracticeRequestV1,
    short_answer: shortAnswerPracticeRequestV1,
  },
};

export const PRACTICE_PROMPT_VERSIONS: readonly string[] = Object.keys(VERSIONS);

/** The request for work in progress under a prompt version. The binding check keeps unknown versions out. */
export function practiceRequest(promptVersion: string, subject: ReviewSubject): GatewayRequest {
  const builders = VERSIONS[promptVersion];
  if (!builders) throw new Error(`practice has no prompt version "${promptVersion}"`);
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
