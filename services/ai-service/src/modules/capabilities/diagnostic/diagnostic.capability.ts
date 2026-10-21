import type { CapabilityDefinition } from '../domain/capability.js';

/**
 * Not an agent: an echo through the full gateway path, so an admin can check that a
 * binding routes where they expect — primary, fallback, breaker — without any product
 * surface. Asks for nothing beyond what every registered model has.
 */
export const DIAGNOSTIC: CapabilityDefinition = {
  code: 'diagnostic',
  description: 'Echo through the gateway, for checking a binding',
  requiredFeatures: {},
};

export const DIAGNOSTIC_SCHEMA = {
  type: 'object',
  required: ['echo'],
  additionalProperties: false,
  properties: { echo: { type: 'string' } },
};

export const DIAGNOSTIC_SYSTEM = 'You are a connectivity check. Repeat the user\'s text in the field "echo", unchanged.';
