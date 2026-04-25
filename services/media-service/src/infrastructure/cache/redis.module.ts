import { Global, Module } from '@nestjs/common';
import { CACHE_SERVICE } from '../../shared/application/ports/cache.port.js';
import { RedisCacheService } from './redis-cache.service.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [
    RedisService,
    RedisCacheService,
    {
      provide: CACHE_SERVICE,
      useExisting: RedisCacheService,
    },
  ],
  exports: [CACHE_SERVICE, RedisService],
})
export class RedisModule {}
