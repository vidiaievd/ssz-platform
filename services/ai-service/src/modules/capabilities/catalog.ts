import { DIAGNOSTIC } from './diagnostic/diagnostic.capability.js';
import type { CapabilityDefinition } from './domain/capability.js';
import { REVIEW_DIRECT } from './review-direct/review-direct.capability.js';
import { REVIEW_DRAFT } from './review-draft/review-draft.capability.js';
import { STUDENT_ASSIST } from './student-assist/student-assist.capability.js';
import { VOICE_REVIEW, VOICE_REVIEW_PRONUNCIATION } from './voice-review/voice-review.capability.js';

/**
 * Every capability the service knows. An agent joins this list in its own plan (79–83),
 * together with its requirements; until then nothing can be bound to its code.
 */
export const CAPABILITIES: readonly CapabilityDefinition[] = [
  DIAGNOSTIC,
  REVIEW_DRAFT,
  REVIEW_DIRECT,
  VOICE_REVIEW,
  VOICE_REVIEW_PRONUNCIATION,
  STUDENT_ASSIST,
];

export function findCapability(code: string): CapabilityDefinition | null {
  return CAPABILITIES.find((c) => c.code === code) ?? null;
}
