import type { CapabilityDefinition } from '../domain/capability.js';
import { REVIEW_DIRECT_PROMPT_VERSIONS } from './prompts/prompts.js';

/**
 * A review of a free-form answer for the learner, with the verdict that closes the attempt,
 * where no teacher reviews (plan 79, part 2) — or first, before a school's teacher (plan 80;
 * `@2` opens the prompt by audience). The payer — learner or school — has the key
 * `ai.review_direct`. Its own binding, so learners can get a different model than teachers'
 * drafts. Same floor as the draft: the structured answer is the whole contract.
 */
export const REVIEW_DIRECT: CapabilityDefinition = {
  code: 'review_direct',
  description: 'Review and verdict on a free-form answer for a learner — alone, or a school\'s before its teacher',
  requiredFeatures: { structuredOutput: 'json_mode' },
  promptVersions: REVIEW_DIRECT_PROMPT_VERSIONS,
};
