import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { RabbitmqEventPublisher } from '../../../infrastructure/messaging/rabbitmq-event-publisher.js';

@Injectable()
export class RabbitmqHealthIndicator extends HealthIndicator {
  constructor(private readonly publisher: RabbitmqEventPublisher) {
    super();
  }

  isHealthy(key: string): HealthIndicatorResult {
    if (this.publisher.isConnected()) {
      return this.getStatus(key, true);
    }

    throw new HealthCheckError(
      'RabbitMQ check failed',
      this.getStatus(key, false, { error: 'Not connected' }),
    );
  }
}
