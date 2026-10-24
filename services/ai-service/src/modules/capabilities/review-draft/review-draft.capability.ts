import type { CapabilityDefinition } from '../domain/capability.js';
import { REVIEW_DRAFT_PROMPT_VERSIONS } from './prompts/prompts.js';

/**
 * A draft review of a free-form answer for the teacher who reviews it (plan 79, part 1).
 * The school pays; the subscription key is `ai.review_draft`. A structured answer is the
 * whole contract, so `json_mode` is the floor — `SchemaGuard` checks the shape either way.
 */
export const REVIEW_DRAFT: CapabilityDefinition = {
  code: 'review_draft',
  description: 'Draft review of a free-form answer for the teacher',
  requiredFeatures: { structuredOutput: 'json_mode' },
  promptVersions: REVIEW_DRAFT_PROMPT_VERSIONS,
};
