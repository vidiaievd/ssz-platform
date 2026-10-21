import { missingFeatures, type CapabilityDefinition } from '../../capabilities/domain/capability.js';
import type { BindingSettings } from '../domain/binding.js';
import type { ICredentialPresence } from './ports/credential-presence.js';
import type { ModelForCall } from './ports/registry.reader.js';
import { providerReadiness } from './provider-readiness.js';

/**
 * Everything that stops a binding from being written, in words an admin can act on.
 *
 * Both models must exist, not be `disabled`, sit on a configured provider, have what the
 * capability requires, and allow `maxOutputTokens`. A provider that is merely switched off
 * passes: `enabled` is the admin's runtime switch and the router steps over it to the
 * fallback — that is how a provider is taken out of service without rewriting bindings.
 */
export function bindingProblems(input: {
  capability: CapabilityDefinition;
  settings: BindingSettings;
  primary: ModelForCall | null;
  fallback: ModelForCall | null;
  credentials: ICredentialPresence;
}): string[] {
  const { capability, settings, credentials } = input;
  const problems: string[] = [];

  const checkModel = (role: 'primary' | 'fallback', modelId: string, found: ModelForCall | null) => {
    if (!found) {
      problems.push(`${role} model ${modelId} does not exist`);
      return;
    }
    const label = `${role} model "${found.provider.code}/${found.model.providerModelId}"`;
    if (found.model.status === 'disabled') problems.push(`${label} is disabled`);
    for (const missing of providerReadiness(found.provider, credentials).missing) {
      problems.push(`${label}: provider not configured — ${missing}`);
    }
    for (const feature of missingFeatures(found.model.features, capability.requiredFeatures)) {
      problems.push(`${label} lacks ${feature}, required by "${capability.code}"`);
    }
    if (settings.maxOutputTokens > found.model.features.maxOutput) {
      problems.push(
        `maxOutputTokens ${settings.maxOutputTokens} exceeds ${label}'s maxOutput ${found.model.features.maxOutput}`,
      );
    }
  };

  checkModel('primary', settings.primaryModelId, input.primary);
  if (settings.fallbackModelId) {
    if (settings.fallbackModelId === settings.primaryModelId) {
      problems.push('fallback model must differ from the primary');
    } else {
      checkModel('fallback', settings.fallbackModelId, input.fallback);
    }
  }
  return problems;
}
