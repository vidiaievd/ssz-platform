import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ITagAssignmentRepository } from '../../domain/repositories/tag-assignment.repository.interface.js';
import { TagAssignmentEntity } from '../../domain/entities/tag-assignment.entity.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { TagAssignmentMapper } from './mappers/tag-assignment.mapper.js';
import { domainEntityTypeToPrisma } from './mappers/tag-enum-converters.js';

@Injectable()
export class PrismaTagAssignmentRepository implements ITagAssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEntity(
    entityType: TaggableEntityType,
    entityId: string,
  ): Promise<TagAssignmentEntity[]> {
    const rows = await this.prisma.tagAssignment.findMany({
      where: {
        entityType: domainEntityTypeToPrisma(entityType),
        entityId,
      },
    });
    return rows.map((r) => TagAssignmentMapper.toDomain(r));
  }

  async findByTagAndEntity(
    tagId: string,
    entityType: TaggableEntityType,
    entityId: string,
  ): Promise<TagAssignmentEntity | null> {
    const raw = await this.prisma.tagAssignment.findUnique({
      where: {
        tagId_entityType_entityId: {
          tagId,
          entityType: domainEntityTypeToPrisma(entityType),
          entityId,
        },
      },
    });
    return raw ? TagAssignmentMapper.toDomain(raw) : null;
  }

  async save(entity: TagAssignmentEntity): Promise<TagAssignmentEntity> {
    const raw = await this.prisma.tagAssignment.upsert({
      where: {
        tagId_entityType_entityId: {
          tagId: entity.tagId,
          entityType: domainEntityTypeToPrisma(entity.entityType),
          entityId: entity.entityId,
        },
      },
      create: TagAssignmentMapper.toCreateData(entity),
      update: {},
    });
    return TagAssignmentMapper.toDomain(raw);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.tagAssignment.delete({ where: { id } });
  }
}
