import type { CapabilityDefinition } from '../domain/capability.js';

/**
 * A reference clip of a word in a carrier sentence, spoken by a synthesizer (plan 88, step 6b,
 * Q10–Q13) — what a learner's toneme is compared with. No prompt, any prompt-version label;
 * not sold under any key: the platform pays (surface `authoring`), and a clip is made once
 * per word and kept. Bound to Azure TTS (`azure_speech`, the synthesis host) or `fake-tts` on dev.
 */
export const REFERENCE_SYNTHESIS: CapabilityDefinition = {
  code: 'reference_synthesis',
  modality: 'tts',
  description: 'Speaks a reference word in a carrier sentence; its toneme is checked before the clip is kept',
  requiredFeatures: { languages: ['nb'] },
};

/**
 * The same clip heard back before it is kept (plan 88, step 6b.2): Pronunciation Assessment
 * times its sounds, so the stressed vowel's F0 can be checked against the lexicon's toneme. Paid
 * by the platform like the synthesis; bound to `azure-speech` (sounds need `pronunciation`).
 */
export const REFERENCE_CHECK: CapabilityDefinition = {
  code: 'reference_check',
  modality: 'speech',
  description: 'Hears a synthesized reference clip back, sound by sound, so its toneme can be checked',
  requiredFeatures: { languages: ['nb'], wordTimings: true, pronunciation: true },
};
