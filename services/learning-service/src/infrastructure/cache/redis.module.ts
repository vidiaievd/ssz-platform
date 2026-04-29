import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';
import { RedisContainerItemListCache } from './container-item-list-cache.service.js';
import { CONTAINER_ITEM_LIST_CACHE } from '../../shared/application/ports/container-item-list-cache.port.js';

@Global()
@Module({
  providers: [
    RedisService,
    RedisContainerItemListCache,
    { provide: CONTAINER_ITEM_LIST_CACHE, useExisting: RedisContainerItemListCache },
  ],
  exports: [RedisService, CONTAINER_ITEM_LIST_CACHE],
})
export class RedisModule {}
