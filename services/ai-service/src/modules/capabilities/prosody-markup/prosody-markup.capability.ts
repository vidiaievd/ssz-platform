import type { CapabilityDefinition } from '../domain/capability.js';
import { PROSODY_MARKUP_PROMPT_VERSIONS } from './prompts/prompts.js';

/**
 * A suggestion of a text's phrase marks for the prosody editor (plan 86, step 5c): intonation
 * groups with their end pitch and pause, the phrase accent of each, linked words. The teacher
 * asks for it by a button, fixes it and saves it; the saved layer is what learners see, without
 * any model. Sold under `ai.authoring` (access `SOLD_UNDER`), the school paying — or the author
 * without one under their own plan.
 */
export const PROSODY_MARKUP: CapabilityDefinition = {
  code: 'prosody_markup',
  description: "Suggests a text's intonation groups, phrase accents and linking for the teacher to correct",
  requiredFeatures: { structuredOutput: 'json_mode' },
  promptVersions: PROSODY_MARKUP_PROMPT_VERSIONS,
};
