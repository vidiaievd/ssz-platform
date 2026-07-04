import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { IContentRelationRepository } from '../../domain/repositories/content-relation.repository.interface.js';
import { ContentRelationEntity } from '../../domain/entities/content-relation.entity.js';
import { RelatableEntityType } from '../../domain/types/relatable-entity-type.js';
import { RelationKind } from '../../domain/types/relation-kind.js';
import { ContentRelationMapper } from './mappers/content-relation.mapper.js';
import {
  domainRelatableEntityTypeToPrisma,
  domainRelationKindToPrisma,
} from './mappers/content-relation-enum-converters.js';

@Injectable()
export class PrismaContentRelationRepository implements IContentRelationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ContentRelationEntity | null> {
    const raw = await this.prisma.contentRelation.findUnique({ where: { id } });
    return raw ? ContentRelationMapper.toDomain(raw) : null;
  }

  async findBySource(
    sourceType: RelatableEntityType,
    sourceId: string,
    relationKind?: RelationKind,
  ): Promise<ContentRelationEntity[]> {
    const rows = await this.prisma.contentRelation.findMany({
      where: {
        sourceType: domainRelatableEntityTypeToPrisma(sourceType),
        sourceId,
        ...(relationKind ? { relationKind: domainRelationKindToPrisma(relationKind) } : {}),
      },
    });
    return rows.map((r) => ContentRelationMapper.toDomain(r));
  }

  async findByTarget(
    targetType: RelatableEntityType,
    targetId: string,
    relationKind?: RelationKind,
  ): Promise<ContentRelationEntity[]> {
    const rows = await this.prisma.contentRelation.findMany({
      where: {
        targetType: domainRelatableEntityTypeToPrisma(targetType),
        targetId,
        ...(relationKind ? { relationKind: domainRelationKindToPrisma(relationKind) } : {}),
      },
    });
    return rows.map((r) => ContentRelationMapper.toDomain(r));
  }

  async findExact(
    sourceType: RelatableEntityType,
    sourceId: string,
    relationKind: RelationKind,
    targetType: RelatableEntityType,
    targetId: string,
  ): Promise<ContentRelationEntity | null> {
    const raw = await this.prisma.contentRelation.findUnique({
      where: {
        sourceType_sourceId_relationKind_targetType_targetId: {
          sourceType: domainRelatableEntityTypeToPrisma(sourceType),
          sourceId,
          relationKind: domainRelationKindToPrisma(relationKind),
          targetType: domainRelatableEntityTypeToPrisma(targetType),
          targetId,
        },
      },
    });
    return raw ? ContentRelationMapper.toDomain(raw) : null;
  }

  async save(entity: ContentRelationEntity): Promise<ContentRelationEntity> {
    const raw = await this.prisma.contentRelation.upsert({
      where: {
        sourceType_sourceId_relationKind_targetType_targetId: {
          sourceType: domainRelatableEntityTypeToPrisma(entity.sourceType),
          sourceId: entity.sourceId,
          relationKind: domainRelationKindToPrisma(entity.relationKind),
          targetType: domainRelatableEntityTypeToPrisma(entity.targetType),
          targetId: entity.targetId,
        },
      },
      create: ContentRelationMapper.toCreateData(entity),
      update: {},
    });
    return ContentRelationMapper.toDomain(raw);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.contentRelation.delete({ where: { id } });
  }
}
