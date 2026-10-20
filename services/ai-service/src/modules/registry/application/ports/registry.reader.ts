import type { AiModel, AiModelPrice, AiProvider } from '../../domain/registry.types.js';

export interface ProviderWithModelCount extends AiProvider {
  modelCount: number;
}

export interface ModelWithCurrentPrice extends AiModel {
  /** The latest price whose `effectiveFrom` is not in the future; null when none is recorded. */
  currentPrice: AiModelPrice | null;
}

export interface IRegistryReader {
  listProviders(): Promise<ProviderWithModelCount[]>;
  listModels(filter: { providerId?: string }, at: Date): Promise<ModelWithCurrentPrice[]>;
  /** Null when the model does not exist; newest first. */
  listPrices(modelId: string): Promise<AiModelPrice[] | null>;
}

export const REGISTRY_READER = Symbol('REGISTRY_READER');
