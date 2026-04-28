import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { RedisService } from '../../../infrastructure/cache/redis.service.js';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redis: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const client = this.redis.getClient();

    if (!client) {
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { error: 'Redis client not initialised' }),
      );
    }

    try {
      const pong = await client.ping();
      const healthy = pong === 'PONG';

      if (!healthy) {
        throw new HealthCheckError(
          'Redis check failed',
          this.getStatus(key, false, { response: pong }),
        );
      }

      return this.getStatus(key, true);
    } catch (err) {
      if (err instanceof HealthCheckError) throw err;

      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}
