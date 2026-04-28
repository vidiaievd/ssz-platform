import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { DatabaseHealthIndicator } from './indicators/database.health-indicator.js';
import { RedisHealthIndicator } from './indicators/redis.health-indicator.js';
import { RabbitmqHealthIndicator } from './indicators/rabbitmq.health-indicator.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RedisHealthIndicator, RabbitmqHealthIndicator],
})
export class HealthModule {}
