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

  /**
   * Rewrites the order of a version's items.
   *
   * In two passes, both inside one transaction. `unique(containerVersionId,
   * position)` is a plain unique index, and Postgres checks those per row as
   * they are written — a transaction does not postpone that, whatever grouping
   * the statements arrive in. So swapping two neighbours by writing their final
   * positions straight away fails the moment the first row lands on a position
   * the second still holds.
   *
   * The first pass parks every row on a negative position, which nothing else
   * can occupy, leaving the whole range free for the second pass to write into.
   */
  async reorder(
    versionId: string,
    items: { id: string; position: number; sectionId?: string | null }[],
  ): Promise<void> {
    if (items.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const [index, item] of items.entries()) {
        await tx.containerItem.update({
          where: { id: item.id, containerVersionId: versionId },
          data: { position: -(index + 1) },
        });
      }

      for (const item of items) {
        await tx.containerItem.update({
          where: { id: item.id, containerVersionId: versionId },
          data: {
            position: item.position,
            // 'sectionId' in item distinguishes "omitted" (keep current section)
            // from "explicitly set to null" (ungroup).
            ...('sectionId' in item ? { sectionId: item.sectionId ?? null } : {}),
          },
        });
      }
    });
  }

  async copyCompositionToVersion(sourceVersionId: string, targetVersionId: string): Promise<void> {
    const [sourceSections, sourceItems] = await Promise.all([
      this.prisma.containerSection.findMany({
        where: { containerVersionId: sourceVersionId },
        orderBy: { position: 'asc' },
      }),
      this.prisma.containerItem.findMany({
        where: { containerVersionId: sourceVersionId },
        orderBy: { position: 'asc' },
      }),
    ]);

    if (sourceSections.length === 0 && sourceItems.length === 0) return;

    // Sections belong to a version, so the target needs its own rows and the
    // copied items have to point at those. Dropping them instead — as this did
    // until 2026-08-03 — silently ungrouped the draft the moment a container
    // was published, which both read as "unpublished changes" forever and
    // would have pushed a section-less version to students on the next publish.
    const targetSectionIdBySourceId = new Map(sourceSections.map((s) => [s.id, randomUUID()]));

    await this.prisma.$transaction([
      this.prisma.containerSection.createMany({
        data: sourceSections.map((section) => ({
          id: targetSectionIdBySourceId.get(section.id) as string,
          containerVersionId: targetVersionId,
          title: section.title,
          position: section.position,
        })),
      }),
      this.prisma.containerItem.createMany({
        data: sourceItems.map((item) => ({
          id: randomUUID(),
          containerVersionId: targetVersionId,
          position: item.position,
          itemType: item.itemType,
          itemId: item.itemId,
          isRequired: item.isRequired,
          sectionId:
            item.sectionId === null
              ? null
              : (targetSectionIdBySourceId.get(item.sectionId) ?? null),
          sectionLabel: item.sectionLabel,
          xpReward: item.xpReward,
          addedAt: new Date(),
        })),
      }),
    ]);
  }
}
