import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ContainerTag,
  ContainerTagCategory,
  IContainerTagReader,
} from '../../application/ports/container-tag-reader.port.js';

/** Prisma hands back enum member names (`SKILL`), not their `@map` values. */
const CATEGORY: Record<string, ContainerTagCategory> = {
  TOPIC: 'topic',
  SITUATION: 'situation',
  SKILL: 'skill',
  LEVEL: 'level',
  OTHER: 'other',
};

@Injectable()
export class PrismaContainerTagReader implements IContainerTagReader {
  constructor(private readonly prisma: PrismaService) {}

  async forContainers(containerIds: readonly string[]): Promise<Map<string, ContainerTag[]>> {
    const ids = [...new Set(containerIds)];
    const byContainer = new Map<string, ContainerTag[]>(ids.map((id) => [id, []]));
    if (ids.length === 0) return byContainer;

    const rows = await this.prisma.tagAssignment.findMany({
      where: { entityType: 'CONTAINER', entityId: { in: ids }, tag: { deletedAt: null } },
      select: { entityId: true, tag: { select: { id: true, name: true, category: true } } },
      orderBy: { tag: { name: 'asc' } },
    });
    for (const row of rows) {
      byContainer.get(row.entityId)?.push({
        id: row.tag.id,
        name: row.tag.name,
        category: CATEGORY[row.tag.category] ?? 'other',
      });
    }
    return byContainer;
  }
}
