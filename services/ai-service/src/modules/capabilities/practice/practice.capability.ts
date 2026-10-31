import type { CapabilityDefinition } from '../domain/capability.js';
import { PRACTICE_PROMPT_VERSIONS } from './prompts/prompts.js';

/**
 * A rehearsal before hand-in (plan 84): the learner asks for a check of the work still in
 * progress, reads hints, fixes it and may ask again. Nothing is closed, ruled or recorded on
 * the attempt — the work handed in is what counts. Sold as `ai.practice`, the school paying.
 * Same floor as the draft: the structured answer is the whole contract.
 */
export const PRACTICE: CapabilityDefinition = {
  code: 'practice',
  description: 'Hints on a free-form answer before the learner hands it in; no verdict, no corrected text',
  requiredFeatures: { structuredOutput: 'json_mode' },
  promptVersions: PRACTICE_PROMPT_VERSIONS,
};
