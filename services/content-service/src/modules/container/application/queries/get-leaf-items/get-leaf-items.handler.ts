import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetLeafItemsQuery } from './get-leaf-items.query.js';

export interface LeafItem {
  itemType: string;
  itemId: string;
  // Nearest top-level MODULE (sub-lesson) ancestor under the course, or null
  // when the leaf sits directly under the course. Drives per-sub-lesson
  // completion/gating in Learning Service.
  moduleId: string | null;
  isRequired: boolean;
}

@QueryHandler(GetLeafItemsQuery)
export class GetLeafItemsHandler
  implements IQueryHandler<GetLeafItemsQuery, LeafItem[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetLeafItemsQuery): Promise<LeafItem[]> {
    return this.collectLeafItems(query.containerId, new Set(), null);
  }

  private async collectLeafItems(
    containerId: string,
    visited: Set<string>,
    // The top-level module this recursion has descended into (null at the
    // course root). Once set, it stays fixed for everything beneath — deeper
    // nesting still attributes to the first module under the course.
    moduleId: string | null,
  ): Promise<LeafItem[]> {
    if (visited.has(containerId)) return [];
    visited.add(containerId);

    const container = await this.prisma.container.findUnique({
      where: { id: containerId, deletedAt: null },
      select: { currentPublishedVersionId: true },
    });
    if (!container?.currentPublishedVersionId) return [];

    const items = await this.prisma.containerItem.findMany({
      where: { containerVersionId: container.currentPublishedVersionId },
      select: { itemType: true, itemId: true, isRequired: true },
    });

    const leafItems: LeafItem[] = [];
    const nestedContainerIds: string[] = [];

    for (const item of items) {
      if (item.itemType === 'CONTAINER') {
        nestedContainerIds.push(item.itemId);
      } else {
        leafItems.push({
          itemType: item.itemType,
          itemId: item.itemId,
          moduleId,
          isRequired: item.isRequired,
        });
      }
    }

    // Recurse into nested containers (e.g. COURSE → MODULEs) in parallel. The
    // first level below the course fixes the moduleId attribution.
    if (nestedContainerIds.length > 0) {
      const nested = await Promise.all(
        nestedContainerIds.map((id) => this.collectLeafItems(id, visited, moduleId ?? id)),
      );
      for (const batch of nested) leafItems.push(...batch);
    }

    return leafItems;
  }
}
