import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { IContainerItemRepository } from '../../domain/repositories/container-item.repository.interface.js';
import { ContainerItemEntity } from '../../domain/entities/container-item.entity.js';
import { ContainerItemMapper } from './mappers/container-item.mapper.js';

@Injectable()
export class PrismaContainerItemRepository implements IContainerItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ContainerItemEntity | null> {
    const raw = await this.prisma.containerItem.findUnique({ where: { id } });
    return raw ? ContainerItemMapper.toDomain(raw) : null;
  }

  async findByVersionId(versionId: string): Promise<ContainerItemEntity[]> {
    const rows = await this.prisma.containerItem.findMany({
      where: { containerVersionId: versionId },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => ContainerItemMapper.toDomain(row));
  }

  async save(entity: ContainerItemEntity): Promise<ContainerItemEntity> {
    const exists = await this.prisma.containerItem.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.containerItem.update({
          where: { id: entity.id },
          data: ContainerItemMapper.toUpdateData(entity),
        })
      : await this.prisma.containerItem.create({
          data: ContainerItemMapper.toCreateData(entity),
        });

    return ContainerItemMapper.toDomain(raw);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.containerItem.delete({ where: { id } });
  }

  async getMaxPosition(versionId: string): Promise<number> {
    const result = await this.prisma.containerItem.aggregate({
      where: { containerVersionId: versionId },
      _max: { position: true },
    });
    // Returns -1 when no items exist so that (maxPosition + 1) yields position 0.
    return result._max.position ?? -1;
  }

  async reorder(versionId: string, items: { id: string; position: number }[]): Promise<void> {
    // Use a transaction so the unique(containerVersionId, position) constraint
    // is not violated mid-update. Prisma defers constraint checks to commit
    // when all updates are grouped in a single interactive transaction.
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.containerItem.update({
          where: { id: item.id, containerVersionId: versionId },
          data: { position: item.position },
        }),
      ),
    );
  }

  async copyItemsToVersion(sourceVersionId: string, targetVersionId: string): Promise<void> {
    const sourceItems = await this.prisma.containerItem.findMany({
      where: { containerVersionId: sourceVersionId },
      orderBy: { position: 'asc' },
    });

    if (sourceItems.length === 0) return;

    await this.prisma.containerItem.createMany({
      data: sourceItems.map((item) => ({
        id: randomUUID(),
        containerVersionId: targetVersionId,
        position: item.position,
        itemType: item.itemType,
        itemId: item.itemId,
        isRequired: item.isRequired,
        sectionLabel: item.sectionLabel,
        addedAt: new Date(),
      })),
    });
  }
}
