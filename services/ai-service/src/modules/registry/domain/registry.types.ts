import type { ModelFeatures, ProviderKind } from '../../providers/domain/model-features.js';

export type AiRegion = 'eu' | 'us' | 'global' | 'local';
export type AiModelStatus = 'active' | 'deprecated' | 'disabled';

export interface AiProvider {
  id: string;
  code: string;
  kind: ProviderKind;
  displayName: string;
  baseUrl: string | null;
  apiVersion: string | null;
  credentialRef: string | null;
  region: AiRegion;
  enabled: boolean;
}

/**
 * Money stays a decimal string from the database to the response: these are prices per
 * million tokens, and a float would round the costs step 8 multiplies out of them.
 */
export interface AiModelPrice {
  effectiveFrom: Date;
  inputPerMtok: string;
  outputPerMtok: string;
  cacheReadPerMtok: string;
  cacheWritePerMtok: string;
  currency: string;
}

export interface AiModel {
  id: string;
  providerId: string;
  providerCode: string;
  providerModelId: string;
  displayName: string;
  features: ModelFeatures;
  status: AiModelStatus;
}
