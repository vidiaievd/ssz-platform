import { LlmError } from '../domain/llm-error.js';
import type { ProviderConnection } from '../domain/model-features.js';

/**
 * The provider's key, read from the environment at call time — so a key added to the env
 * is picked up on restart without touching the registry. Null for a keyless provider.
 * A missing key is `auth`: not retryable, and not something the fallback model shares.
 */
export function readCredential(provider: ProviderConnection): string | null {
  if (!provider.credentialRef) return null;
  const value = process.env[provider.credentialRef]?.trim();
  if (!value) {
    throw new LlmError('auth', `Provider "${provider.code}" is not configured: ${provider.credentialRef} is not set`);
  }
  return value;
}
