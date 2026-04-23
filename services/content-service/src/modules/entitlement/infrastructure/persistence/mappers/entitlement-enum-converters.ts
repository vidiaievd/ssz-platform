import { $Enums } from '../../../../../../generated/prisma/client.js';
import { EntitlementType } from '../../../domain/value-objects/entitlement-type.vo.js';

const PRISMA_TO_DOMAIN: Record<$Enums.EntitlementType, EntitlementType> = {
  MANUAL: EntitlementType.MANUAL,
  SUBSCRIPTION: EntitlementType.SUBSCRIPTION,
  ONE_TIME_PURCHASE: EntitlementType.ONE_TIME_PURCHASE,
  PROMOTIONAL: EntitlementType.PROMOTIONAL,
  FREE_GRANTED: EntitlementType.FREE_GRANTED,
};

const DOMAIN_TO_PRISMA: Record<EntitlementType, $Enums.EntitlementType> = {
  [EntitlementType.MANUAL]: 'MANUAL',
  [EntitlementType.SUBSCRIPTION]: 'SUBSCRIPTION',
  [EntitlementType.ONE_TIME_PURCHASE]: 'ONE_TIME_PURCHASE',
  [EntitlementType.PROMOTIONAL]: 'PROMOTIONAL',
  [EntitlementType.FREE_GRANTED]: 'FREE_GRANTED',
};

export function prismaEntitlementTypeToDomain(v: $Enums.EntitlementType): EntitlementType {
  return PRISMA_TO_DOMAIN[v];
}

export function domainEntitlementTypeToPrisma(v: EntitlementType): $Enums.EntitlementType {
  return DOMAIN_TO_PRISMA[v];
}
