import type { ModelFeatures, ModelModality, ProviderKind, SpeechFeatures } from '../../providers/domain/model-features.js';

export type { ModelModality };

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
 *
 * A language model is priced by the token fields, a speech model by `audioPerHour` (plan 82,
 * step 3); the fields that do not apply are zero, so a call is simply the sum of both.
 */
export interface AiModelPrice {
  effectiveFrom: Date;
  inputPerMtok: string;
  outputPerMtok: string;
  cacheReadPerMtok: string;
  cacheWritePerMtok: string;
  /** Per hour of audio in. */
  audioPerHour: string;
  currency: string;
}

interface AiModelBase {
  id: string;
  providerId: string;
  providerCode: string;
  providerModelId: string;
  displayName: string;
  status: AiModelStatus;
}

/** `features` follows `modality`: what a language model can do is not what a recognizer can. */
export type AiModel =
  | (AiModelBase & { modality: 'llm'; features: ModelFeatures })
  | (AiModelBase & { modality: 'speech'; features: SpeechFeatures });
