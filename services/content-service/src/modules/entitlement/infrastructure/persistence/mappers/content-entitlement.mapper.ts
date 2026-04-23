import type { ContentEntitlement } from '../../../../../../generated/prisma/client.js';
import { Prisma } from '../../../../../../generated/prisma/client.js';
import { ContentEntitlementEntity } from '../../../domain/entities/content-entitlement.entity.js';
import {
  prismaEntitlementTypeToDomain,
  domainEntitlementTypeToPrisma,
} from './entitlement-enum-converters.js';

export class ContentEntitlementMapper {
  static toDomain(raw: ContentEntitlement): ContentEntitlementEntity {
    return ContentEntitlementEntity.reconstitute(raw.id, {
      userId: raw.userId,
      containerId: raw.containerId,
      entitlementType: prismaEntitlementTypeToDomain(raw.entitlementType),
      grantedAt: raw.grantedAt,
      expiresAt: raw.expiresAt,
      revokedAt: raw.revokedAt,
      grantedByUserId: raw.grantedByUserId,
      sourceReference: raw.sourceReference,
      metadata: raw.metadata as Record<string, unknown> | null,
    });
  }

  static toCreateData(
    entity: ContentEntitlementEntity,
  ): Prisma.ContentEntitlementUncheckedCreateInput {
    return {
      id: entity.id,
      userId: entity.userId,
      containerId: entity.containerId,
      entitlementType: domainEntitlementTypeToPrisma(entity.entitlementType),
      grantedAt: entity.grantedAt,
      expiresAt: entity.expiresAt,
      revokedAt: entity.revokedAt,
      grantedByUserId: entity.grantedByUserId,
      sourceReference: entity.sourceReference,
      metadata:
        entity.metadata !== null
          ? (entity.metadata as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    };
  }

  static toUpdateData(entity: ContentEntitlementEntity) {
    return {
      revokedAt: entity.revokedAt,
    };
  }
}
