/**
 * Answers whether a provider's key is available to this process, without ever handing
 * the key out. Kept behind a port so readiness can be unit-tested without touching env.
 */
export interface ICredentialPresence {
  isSet(credentialRef: string): boolean;
}

export const CREDENTIAL_PRESENCE = Symbol('CREDENTIAL_PRESENCE');
