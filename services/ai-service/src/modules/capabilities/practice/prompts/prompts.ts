import type { GatewayRequest } from '../../../gateway/application/model-router.js';
import type { ReviewSubject } from '../../review-draft/prompts/prompts.js';
import { EMPTY_CATALOG, GRAMMAR_ASPECTS, withAtomCatalog, type AtomCatalog } from '../../grammar-atoms/domain/atom-catalog.js';
import {
  errorCorrectionPracticeRequestV1,
  shortAnswerPracticeRequestV1,
  translatePracticeRequestV1,
  writingTaskPracticeRequestV1,
} from './practice.v1.js';

type Builders = { [T in ReviewSubject['template']]: (input: Extract<ReviewSubject, { template: T }>['input']) => GatewayRequest };

const V1: Builders = {
  translate: translatePracticeRequestV1,
  error_correction: errorCorrectionPracticeRequestV1,
  writing_task: writingTaskPracticeRequestV1,
  short_answer: shortAnswerPracticeRequestV1,
};

/**
 * Prompt versions of `practice`, as an admin names them on the binding. Its own line, apart
 * from the draft's and the direct review's: what a learner reads before hand-in is versioned
 * on its own. A version covers every template.
 *
 * v2 (plan 85, step 3a) is v1 with the learner's grammar atoms: the line-up at the end of the
 * system prompt and an `atomId` on every remark. A learner who has reached none, or work no
 * grammar aspect is checked on, is asked v1's request unchanged.
 */
const VERSIONS: Record<string, { builders: Builders; atoms: boolean }> = {
  'practice@1': { builders: V1, atoms: false },
  'practice@2': { builders: V1, atoms: true },
};

export const PRACTICE_PROMPT_VERSIONS: readonly string[] = Object.keys(VERSIONS);

/** The request for work in progress under a prompt version. The binding check keeps unknown versions out. */
export function practiceRequest(promptVersion: string, subject: ReviewSubject, catalog: AtomCatalog = EMPTY_CATALOG): GatewayRequest {
  const version = VERSIONS[promptVersion];
  if (!version) throw new Error(`practice has no prompt version "${promptVersion}"`);
  const request = build(version.builders, subject);
  const grammarChecked = subject.input.aspects.some((aspect) => GRAMMAR_ASPECTS.has(aspect));
  return version.atoms && grammarChecked ? withAtomCatalog(request, catalog) : request;
}

function build(builders: Builders, subject: ReviewSubject): GatewayRequest {
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
