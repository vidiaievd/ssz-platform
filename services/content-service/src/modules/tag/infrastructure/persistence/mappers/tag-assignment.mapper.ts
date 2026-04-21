import type { TagAssignment } from '../../../../../../generated/prisma/client.js';
import { TagAssignmentEntity } from '../../../domain/entities/tag-assignment.entity.js';
import { prismaEntityTypeToDomain, domainEntityTypeToPrisma } from './tag-enum-converters.js';

export class TagAssignmentMapper {
  static toDomain(raw: TagAssignment): TagAssignmentEntity {
    return TagAssignmentEntity.reconstitute(raw.id, {
      tagId: raw.tagId,
      entityType: prismaEntityTypeToDomain(raw.entityType),
      entityId: raw.entityId,
      assignedAt: raw.assignedAt,
      assignedByUserId: raw.assignedByUserId,
    });
  }

  static toCreateData(entity: TagAssignmentEntity) {
    return {
      id: entity.id,
      tagId: entity.tagId,
      entityType: domainEntityTypeToPrisma(entity.entityType),
      entityId: entity.entityId,
      assignedAt: entity.assignedAt,
      assignedByUserId: entity.assignedByUserId,
    };
  }
}
