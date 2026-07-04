import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ICanDoDescriptorRepository,
  CanDoDescriptorFilter,
} from '../../domain/repositories/can-do-descriptor.repository.interface.js';
import { CanDoDescriptorEntity } from '../../domain/entities/can-do-descriptor.entity.js';
import type { CanDoSkill } from '../../domain/value-objects/can-do-skill.vo.js';
import type { CanDoScope } from '../../domain/value-objects/can-do-scope.vo.js';
import { CanDoDescriptorMapper } from './mappers/can-do-descriptor.mapper.js';

@Injectable()
export class PrismaCanDoDescriptorRepository implements ICanDoDescriptorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CanDoDescriptorEntity | null> {
    const row = await this.prisma.canDoDescriptor.findUnique({
      where: { id },
      include: { localizations: true },
    });
    return row ? CanDoDescriptorMapper.toDomain(row) : null;
  }

  async findByIds(ids: string[]): Promise<CanDoDescriptorEntity[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.canDoDescriptor.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: { localizations: true },
    });
    return rows.map(CanDoDescriptorMapper.toDomain);
  }

  async findAll(filter: CanDoDescriptorFilter): Promise<CanDoDescriptorEntity[]> {
    const rows = await this.prisma.canDoDescriptor.findMany({
      where: {
        deletedAt: null,
        ...(filter.scope && { scope: filter.scope as unknown as never }),
        ...(filter.ownerSchoolId !== undefined && { ownerSchoolId: filter.ownerSchoolId }),
        ...(filter.cefrLevel && { cefrLevel: filter.cefrLevel as never }),
        ...(filter.skill && { skill: filter.skill as unknown as never }),
      },
      include: { localizations: true },
      orderBy: [{ cefrLevel: 'asc' }, { skill: 'asc' }],
    });
    return rows.map(CanDoDescriptorMapper.toDomain);
  }

  async findByModuleId(moduleContainerId: string): Promise<CanDoDescriptorEntity[]> {
    const relations = await this.prisma.contentRelation.findMany({
      where: {
        sourceType: 'CONTAINER',
        sourceId: moduleContainerId,
        relationKind: 'TARGETS',
        targetType: 'CAN_DO_DESCRIPTOR',
      },
    });
    if (relations.length === 0) return [];

    const rows = await this.prisma.canDoDescriptor.findMany({
      where: {
        id: { in: relations.map((r) => r.targetId) },
        deletedAt: null,
      },
      include: { localizations: true },
      orderBy: [{ cefrLevel: 'asc' }, { skill: 'asc' }],
    });
    return rows.map(CanDoDescriptorMapper.toDomain);
  }

  async save(entity: CanDoDescriptorEntity): Promise<void> {
    const exists = await this.prisma.canDoDescriptor.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    if (exists) {
      await this.prisma.canDoDescriptor.update({
        where: { id: entity.id },
        data: CanDoDescriptorMapper.toUpdateData(entity),
      });
    } else {
      await this.prisma.canDoDescriptor.create({
        data: CanDoDescriptorMapper.toCreateData(entity),
      });
    }
  }
}
