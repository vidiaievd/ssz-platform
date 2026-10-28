import type { LlmModelRef, ProviderConnection, SpeechModelRef } from '../../providers/domain/model-features.js';
import type { ModelForCall } from './ports/registry.reader.js';

/** The registry row as an adapter sees it — nothing secret, nothing the adapter does not use. */
export function connectionOf({ provider }: ModelForCall): ProviderConnection {
  return {
    code: provider.code,
    baseUrl: provider.baseUrl,
    apiVersion: provider.apiVersion,
    credentialRef: provider.credentialRef,
  };
}

/** Null for a speech model: it is never handed to a language-model adapter. */
export function llmModelRef(found: ModelForCall): LlmModelRef | null {
  const { model } = found;
  if (model.modality !== 'llm') return null;
  return { providerModelId: model.providerModelId, features: model.features, provider: connectionOf(found) };
}

/** Null for a language model. */
export function speechModelRef(found: ModelForCall): SpeechModelRef | null {
  const { model } = found;
  if (model.modality !== 'speech') return null;
  return { providerModelId: model.providerModelId, features: model.features, provider: connectionOf(found) };
}
