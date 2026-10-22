import { DIAGNOSTIC } from './diagnostic/diagnostic.capability.js';
import type { CapabilityDefinition } from './domain/capability.js';
import { REVIEW_DRAFT } from './review-draft/review-draft.capability.js';

/**
 * Every capability the service knows. An agent joins this list in its own plan (79–82),
 * together with its requirements; until then nothing can be bound to its code.
 */
export const CAPABILITIES: readonly CapabilityDefinition[] = [DIAGNOSTIC, REVIEW_DRAFT];

export function findCapability(code: string): CapabilityDefinition | null {
  return CAPABILITIES.find((c) => c.code === code) ?? null;
}
