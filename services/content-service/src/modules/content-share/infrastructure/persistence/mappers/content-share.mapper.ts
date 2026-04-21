import type { ContentShare } from '../../../../../../generated/prisma/client.js';
import { ContentShareEntity } from '../../../domain/entities/content-share.entity.js';
import {
  prismaSharePermissionToDomain,
  domainSharePermissionToPrisma,
} from './content-share-enum-converters.js';
import {
  prismaEntityTypeToDomain,
  domainEntityTypeToPrisma,
} from '../../../../tag/infrastructure/persistence/mappers/tag-enum-converters.js';

export class ContentShareMapper {
  static toDomain(raw: ContentShare): ContentShareEntity {
    return ContentShareEntity.reconstitute(raw.id, {
      entityType: prismaEntityTypeToDomain(raw.entityType),
      entityId: raw.entityId,
      sharedWithUserId: raw.sharedWithUserId,
      sharedByUserId: raw.sharedByUserId,
      permission: prismaSharePermissionToDomain(raw.permission),
      expiresAt: raw.expiresAt,
      revokedAt: raw.revokedAt,
      note: raw.note,
      createdAt: raw.createdAt,
    });
  }

  static toCreateData(entity: ContentShareEntity) {
    return {
      id: entity.id,
      entityType: domainEntityTypeToPrisma(entity.entityType),
      entityId: entity.entityId,
      sharedWithUserId: entity.sharedWithUserId,
      sharedByUserId: entity.sharedByUserId,
      permission: domainSharePermissionToPrisma(entity.permission),
      expiresAt: entity.expiresAt,
      revokedAt: entity.revokedAt,
      note: entity.note,
      createdAt: entity.createdAt,
    };
  }

  static toUpdateData(entity: ContentShareEntity) {
    return {
      revokedAt: entity.revokedAt,
    };
  }
}
