import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { randomUUID } from 'crypto';
import type { Env } from '../../config/configuration.js';
import type { IDomainEvent } from '../../shared/domain/domain-event.interface.js';
import type { IEventPublisher } from '../../shared/application/ports/event-publisher.interface.js';

// Routing key map — each domain event type maps to a RabbitMQ routing key.
// Add new entries here as new domain events are introduced.
const ROUTING_KEYS: Record<string, string> = {
  'school.created': 'school.created',
  'school.member.added': 'school.member.added',
  'school.member.removed': 'school.member.removed',
};

const EXCHANGE = 'organization.events';
const EXCHANGE_TYPE = 'topic';

@Injectable()
export class RabbitMqEventPublisher
  implements IEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqEventPublisher.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<
    ReturnType<typeof amqp.connect>['createChannel']
  > | null = null;

  constructor(private readonly config: ConfigService<Env>) {}

  onModuleInit(): void {
    const url = this.config.get('RABBITMQ_URL') as string;
    this.connection = amqp.connect([url]);

    this.connection.on('connect', () =>
      this.logger.log('RabbitMQ publisher connected'),
    );
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(
        `RabbitMQ publisher disconnected: ${err?.message ?? 'unknown'}`,
      ),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });
        this.logger.log(`Publisher ready — exchange: "${EXCHANGE}"`);
      },
    });
  }

  async publish(event: IDomainEvent): Promise<void> {
    const routingKey = ROUTING_KEYS[event.eventType];
    if (!routingKey) {
      this.logger.debug(
        `No routing key for event type "${event.eventType}" — skipping publish`,
      );
      return;
    }

    const envelope = {
      eventId: event.eventId,
      eventType: event.eventType,
      timestamp: event.occurredAt.toISOString(),
      version: 1,
      source: 'organization-service',
      payload: event,
    };

    const body = Buffer.from(JSON.stringify(envelope));

    try {
      await this.channelWrapper!.publish(EXCHANGE, routingKey, body, {
        contentType: 'application/json',
        persistent: true,
        messageId: randomUUID(),
        timestamp: Math.floor(Date.now() / 1000),
        headers: {
          'event-type': event.eventType,
          source: 'organization-service',
        },
      });

      this.logger.log(
        `Published "${event.eventType}" [${event.eventId}] to "${EXCHANGE}/${routingKey}"`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to publish "${event.eventType}" [${event.eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
