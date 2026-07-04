import type { ContentRelation } from '../../../../../../generated/prisma/client.js';
import { ContentRelationEntity } from '../../../domain/entities/content-relation.entity.js';
import {
  prismaRelatableEntityTypeToDomain,
  domainRelatableEntityTypeToPrisma,
  prismaRelationKindToDomain,
  domainRelationKindToPrisma,
} from './content-relation-enum-converters.js';

export class ContentRelationMapper {
  static toDomain(raw: ContentRelation): ContentRelationEntity {
    return ContentRelationEntity.reconstitute(raw.id, {
      sourceType: prismaRelatableEntityTypeToDomain(raw.sourceType),
      sourceId: raw.sourceId,
      targetType: prismaRelatableEntityTypeToDomain(raw.targetType),
      targetId: raw.targetId,
      relationKind: prismaRelationKindToDomain(raw.relationKind),
      ownerSchoolId: raw.ownerSchoolId,
      createdAt: raw.createdAt,
      createdByUserId: raw.createdByUserId,
    });
  }

  static toCreateData(entity: ContentRelationEntity) {
    return {
      id: entity.id,
      sourceType: domainRelatableEntityTypeToPrisma(entity.sourceType),
      sourceId: entity.sourceId,
      targetType: domainRelatableEntityTypeToPrisma(entity.targetType),
      targetId: entity.targetId,
      relationKind: domainRelationKindToPrisma(entity.relationKind),
      ownerSchoolId: entity.ownerSchoolId,
      createdAt: entity.createdAt,
      createdByUserId: entity.createdByUserId,
    };
  }
}
