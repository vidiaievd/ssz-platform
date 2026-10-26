import type { AiProvider } from '../domain/registry.types.js';
import type { ICredentialPresence } from './ports/credential-presence.js';

export interface ProviderReadiness {
  /** Everything a call to this provider needs is in place (it may still be disabled). */
  configured: boolean;
  /** What is missing, in words an admin can act on; empty when configured. */
  missing: string[];
}

/** Kinds with no fixed endpoint: the registry row says where the server is. */
const NEEDS_BASE_URL: ReadonlySet<AiProvider['kind']> = new Set(['openai_compatible', 'azure_openai', 'whisper_local', 'azure_speech']);

/**
 * `configured` is about the environment, `enabled` about the admin's choice — a provider
 * can be either without the other, and the admin screen needs to tell them apart.
 *
 * A null `credentialRef` means the provider needs no key (`fake`, a keyless local server).
 */
export function providerReadiness(provider: AiProvider, credentials: ICredentialPresence): ProviderReadiness {
  const missing: string[] = [];

  if (provider.credentialRef && !credentials.isSet(provider.credentialRef)) {
    missing.push(`environment variable ${provider.credentialRef} is not set`);
  }
  if (NEEDS_BASE_URL.has(provider.kind) && !provider.baseUrl) {
    missing.push('baseUrl is not set');
  }
  if (provider.kind === 'azure_openai' && !provider.apiVersion) {
    missing.push('apiVersion is not set');
  }

  return { configured: missing.length === 0, missing };
}
