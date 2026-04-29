import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  CONTAINER_ITEM_LIST_CACHE,
  type IContainerItemListCache,
} from '../../../../shared/application/ports/container-item-list-cache.port.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';
import {
  PROGRESS_REPOSITORY,
  type IProgressRepository,
} from '../../domain/repositories/progress.repository.interface.js';

@Injectable()
export class ContainerCompletionService {
  private readonly logger = new Logger(ContainerCompletionService.name);

  constructor(
    @Inject(CONTAINER_ITEM_LIST_CACHE) private readonly cache: IContainerItemListCache,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(PROGRESS_REPOSITORY) private readonly progressRepo: IProgressRepository,
  ) {}

  // Returns true when the user has a COMPLETED progress record for every leaf item
  // in the container. Cache-aside: misses are populated from Content Service and
  // stored with TTL per ADR-007.
  async isComplete(userId: string, containerId: string): Promise<boolean> {
    let items = await this.cache.get(containerId);

    if (!items) {
      const result = await this.contentClient.getContainerLeafItems(containerId);
      if (result.isFail) {
        this.logger.warn(
          `Cannot fetch leaf items for container ${containerId}: ${result.error.message}`,
        );
        return false;
      }
      items = result.value;
      await this.cache.set(containerId, items);
    }

    if (items.length === 0) {
      return true;
    }

    const completedCount = await this.progressRepo.findCompletedCountForUser(userId, items);
    return completedCount >= items.length;
  }
}
