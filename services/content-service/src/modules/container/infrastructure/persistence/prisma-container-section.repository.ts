import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { IContainerSectionRepository } from '../../domain/repositories/container-section.repository.interface.js';
import { ContainerSectionEntity } from '../../domain/entities/container-section.entity.js';
import { ContainerSectionMapper } from './mappers/container-section.mapper.js';

@Injectable()
export class PrismaContainerSectionRepository implements IContainerSectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ContainerSectionEntity | null> {
    const raw = await this.prisma.containerSection.findUnique({ where: { id } });
    return raw ? ContainerSectionMapper.toDomain(raw) : null;
  }

  async findByVersionId(versionId: string): Promise<ContainerSectionEntity[]> {
    const rows = await this.prisma.containerSection.findMany({
      where: { containerVersionId: versionId },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => ContainerSectionMapper.toDomain(row));
  }

  async save(entity: ContainerSectionEntity): Promise<ContainerSectionEntity> {
    const exists = await this.prisma.containerSection.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.containerSection.update({
          where: { id: entity.id },
          data: ContainerSectionMapper.toUpdateData(entity),
        })
      : await this.prisma.containerSection.create({
          data: ContainerSectionMapper.toCreateData(entity),
        });

    return ContainerSectionMapper.toDomain(raw);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.containerSection.delete({ where: { id } });
  }

  async getMaxPosition(versionId: string): Promise<number> {
    const result = await this.prisma.containerSection.aggregate({
      where: { containerVersionId: versionId },
      _max: { position: true },
    });
    // Returns -1 when no sections exist so that (maxPosition + 1) yields position 0.
    return result._max.position ?? -1;
  }

  /**
   * Two passes inside one transaction, for the same reason as
   * `PrismaContainerItemRepository.reorder`: `unique(containerVersionId,
   * position)` is checked row by row, so the new positions can only be written
   * once the old ones have been vacated onto negatives.
   */
  async reorder(versionId: string, sections: { id: string; position: number }[]): Promise<void> {
    if (sections.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const [index, section] of sections.entries()) {
        await tx.containerSection.update({
          where: { id: section.id, containerVersionId: versionId },
          data: { position: -(index + 1) },
        });
      }

      for (const section of sections) {
        await tx.containerSection.update({
          where: { id: section.id, containerVersionId: versionId },
          data: { position: section.position },
        });
      }
    });
  }

  async unassignItems(sectionId: string): Promise<void> {
    await this.prisma.containerItem.updateMany({
      where: { sectionId },
      data: { sectionId: null },
    });
  }
}
