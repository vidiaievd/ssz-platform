import type {
  AiModel as PrismaModel,
  AiModelPrice as PrismaPrice,
  AiProvider as PrismaProvider,
} from '../../../../../generated/prisma/client.js';
import type { ModelFeatures } from '../../../providers/domain/model-features.js';
import type { AiModel, AiModelPrice, AiProvider } from '../../domain/registry.types.js';

// Enum members are declared in their wire form in schema.prisma, so the generated
// values are the domain's strings and pass through unchanged.

export function toProvider(row: PrismaProvider): AiProvider {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    displayName: row.displayName,
    baseUrl: row.baseUrl,
    apiVersion: row.apiVersion,
    credentialRef: row.credentialRef,
    region: row.region,
    enabled: row.enabled,
  };
}

export function toModel(row: PrismaModel & { provider: { code: string } }): AiModel {
  return {
    id: row.id,
    providerId: row.providerId,
    providerCode: row.provider.code,
    providerModelId: row.providerModelId,
    displayName: row.displayName,
    features: row.features as unknown as ModelFeatures,
    status: row.status,
  };
}

export function toPrice(row: PrismaPrice): AiModelPrice {
  return {
    effectiveFrom: row.effectiveFrom,
    inputPerMtok: row.inputPerMtok.toString(),
    outputPerMtok: row.outputPerMtok.toString(),
    cacheReadPerMtok: row.cacheReadPerMtok.toString(),
    cacheWritePerMtok: row.cacheWritePerMtok.toString(),
    currency: row.currency,
  };
}
