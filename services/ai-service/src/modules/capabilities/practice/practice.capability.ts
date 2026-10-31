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

/**
 * The same rehearsal of a reading aloud (plan 84, step 2c): each passage's take heard by a
 * speech model, the words with timings — and pronunciation scores where the model has them —
 * straight back to the learner. Hears, does not judge: no prompt. A separate agent only
 * because a binding holds models of one modality; sold under `ai.practice` and spending its
 * credits (access `SOLD_UNDER`).
 */
export const PRACTICE_VOICE: CapabilityDefinition = {
  code: 'practice_voice',
  modality: 'speech',
  description: 'Hears a reading aloud before hand-in; words with timings and scores where the model has them',
  requiredFeatures: { wordTimings: true },
};
