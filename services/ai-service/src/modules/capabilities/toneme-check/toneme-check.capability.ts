import type { CapabilityDefinition } from '../domain/capability.js';

/**
 * A learner's word heard against its reference clip (plan 88, step 8, Q14–Q16): the learner says
 * the reference's carrier sentence, Pronunciation Assessment times the word's sounds, and the
 * stressed vowel's F0 is compared with the reference's. Hears, does not judge: no prompt. Sold
 * under `ai.practice` (access `SOLD_UNDER`), the school paying, or the learner without one.
 */
export const TONEME_CHECK: CapabilityDefinition = {
  code: 'toneme_check',
  modality: 'speech',
  description:
    "Hears a learner's word in a carrier sentence, sound by sound, so its toneme can be compared with a reference",
  requiredFeatures: { languages: ['nb'], wordTimings: true, pronunciation: true },
};
