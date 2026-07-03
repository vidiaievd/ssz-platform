import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetLeafItemsQuery } from './get-leaf-items.query.js';

export interface LeafItem {
  itemType: string;
  itemId: string;
}

@QueryHandler(GetLeafItemsQuery)
export class GetLeafItemsHandler
  implements IQueryHandler<GetLeafItemsQuery, LeafItem[]>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetLeafItemsQuery): Promise<LeafItem[]> {
    return this.collectLeafItems(query.containerId, new Set());
  }

  private async collectLeafItems(
    containerId: string,
    visited: Set<string>,
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
      select: { itemType: true, itemId: true },
    });

    const leafItems: LeafItem[] = [];
    const nestedContainerIds: string[] = [];

    for (const item of items) {
      if (item.itemType === 'CONTAINER') {
        nestedContainerIds.push(item.itemId);
      } else {
        leafItems.push({ itemType: item.itemType, itemId: item.itemId });
      }
    }

    // Recurse into nested containers (e.g. COURSE → MODULEs) in parallel.
    if (nestedContainerIds.length > 0) {
      const nested = await Promise.all(
        nestedContainerIds.map((id) => this.collectLeafItems(id, visited)),
      );
      for (const batch of nested) leafItems.push(...batch);
    }

    return leafItems;
  }
}
