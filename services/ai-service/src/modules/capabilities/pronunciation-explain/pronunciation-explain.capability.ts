import type { CapabilityDefinition } from '../domain/capability.js';
import { PRONUNCIATION_EXPLAIN_PROMPT_VERSIONS } from './prompts/prompts.js';

/**
 * Explains the weak sounds of a reading aloud (plan 88, step 5b; Q8 = A). A language model
 * that never hears the recording: the speech model said where and how badly, the lexicon
 * which sound it was, and this agent says how to make it — from the inventory's articulation
 * notes, in the learner's explanation language. One call per check, every weak sound at once;
 * when it fails the remarks keep the inventory's English note.
 *
 * Sold under the key of the check it explains (access `SOLD_UNDER`): `ai.practice` in a
 * rehearsal. On hand-in the same agent runs as `VOICE_REVIEW_EXPLAIN`.
 */
export const PRONUNCIATION_EXPLAIN: CapabilityDefinition = {
  code: 'pronunciation_explain',
  description: 'Explains the weak sounds of a reading aloud from the articulation notes; never hears the audio',
  requiredFeatures: { structuredOutput: 'json_mode' },
  promptVersions: PRONUNCIATION_EXPLAIN_PROMPT_VERSIONS,
};

/**
 * The same explanation of a handed-in reading's sounds (plan 88, step 5c.2): sold under
 * `ai.voice_review_pronunciation`, the level that scored them. A second code rather than a pool
 * chosen by surface — the quota counter and the ledger sum by a static pool — at the price of a
 * second binding; the prompt versions are `pronunciation_explain`'s.
 */
export const VOICE_REVIEW_EXPLAIN: CapabilityDefinition = {
  code: 'voice_review_explain',
  description: 'Explains the weak sounds of a handed-in reading aloud from the articulation notes; never hears the audio',
  requiredFeatures: { structuredOutput: 'json_mode' },
  promptVersions: PRONUNCIATION_EXPLAIN_PROMPT_VERSIONS,
};
