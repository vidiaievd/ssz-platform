import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetPublishStatesQuery } from './get-publish-states.query.js';
import { PublishStateReader } from '../../services/publish-state.reader.js';
import type { ContainerPublishState } from '../../services/publish-state.reader.js';

export interface ContainerPublishSummary {
  containerId: string;
  publishState: ContainerPublishState;
  /**
   * Modules this container's draft places whose own draft is ahead of what
   * students see — or that were never published at all.
   *
   * A course can be perfectly up to date itself while holding a module nobody
   * can open, because modules are versioned independently and publishing does
   * not cascade. Counting them is the only way a list row can say so.
   */
  pendingModuleCount: number;
}

@QueryHandler(GetPublishStatesQuery)
export class GetPublishStatesHandler
  implements IQueryHandler<GetPublishStatesQuery, ContainerPublishSummary[]>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly publishStateReader: PublishStateReader,
  ) {}

  async execute(query: GetPublishStatesQuery): Promise<ContainerPublishSummary[]> {
    const containerIds = [...new Set(query.containerIds)];
    if (containerIds.length === 0) return [];

    const moduleIdsByContainerId = await this.resolveModuleIds(containerIds);
    const allModuleIds = [...moduleIdsByContainerId.values()].flat();

    // One pass over the containers and every module they hold.
    const states = await this.publishStateReader.resolve([...containerIds, ...allModuleIds]);

    return containerIds.map((containerId) => ({
      containerId,
      publishState: states.get(containerId) ?? 'draft',
      pendingModuleCount: (moduleIdsByContainerId.get(containerId) ?? []).filter(
        (moduleId) => (states.get(moduleId) ?? 'draft') !== 'published',
      ).length,
    }));
  }

  /**
   * Modules placed by each container's draft version — the version an author
   * is working in. Falling back to the published one would report the shape of
   * a course the author has already moved on from.
   */
  private async resolveModuleIds(containerIds: string[]): Promise<Map<string, string[]>> {
    const byContainerId = new Map<string, string[]>();

    const drafts = await this.prisma.containerVersion.findMany({
      where: { containerId: { in: containerIds }, status: 'DRAFT' },
      select: { id: true, containerId: true },
    });
    if (drafts.length === 0) return byContainerId;

    const containerIdByVersionId = new Map(drafts.map((d) => [d.id, d.containerId]));

    const moduleItems = await this.prisma.containerItem.findMany({
      where: {
        containerVersionId: { in: drafts.map((d) => d.id) },
        itemType: 'CONTAINER',
      },
      select: { containerVersionId: true, itemId: true },
    });

    for (const item of moduleItems) {
      const containerId = containerIdByVersionId.get(item.containerVersionId);
      if (!containerId) continue;
      const bucket = byContainerId.get(containerId) ?? [];
      bucket.push(item.itemId);
      byContainerId.set(containerId, bucket);
    }

    return byContainerId;
  }
}
