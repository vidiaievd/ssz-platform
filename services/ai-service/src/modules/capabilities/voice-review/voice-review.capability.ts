import type { CapabilityDefinition } from '../domain/capability.js';

/**
 * A reading aloud heard by a speech model (plan 82): the recording of each prompt → the words
 * heard, which exercise-engine checks against the passage and rules from. The model hears, it
 * does not judge — so no prompt and any prompt-version label. Sold as `ai.voice_review`; bound
 * to the NB-Whisper sidecar (`whisper_local`) or `fake-speech` on dev.
 */
export const VOICE_REVIEW: CapabilityDefinition = {
  code: 'voice_review',
  modality: 'speech',
  description: 'Hears a reading aloud prompt by prompt; exercise-engine rules from what was heard',
  requiredFeatures: { wordTimings: true },
};

/**
 * The same hearing with pronunciation scores beside it (`ai.voice_review_pronunciation`, plan
 * 82 step 9 — Azure Pronunciation Assessment). Scores are feedback only, so a fallback without
 * them still serves: the reading is ruled from the words alone either way.
 */
export const VOICE_REVIEW_PRONUNCIATION: CapabilityDefinition = {
  code: 'voice_review_pronunciation',
  modality: 'speech',
  description: 'Hears a reading aloud with pronunciation scores as feedback; the verdict is the same reading check',
  requiredFeatures: { wordTimings: true },
};
