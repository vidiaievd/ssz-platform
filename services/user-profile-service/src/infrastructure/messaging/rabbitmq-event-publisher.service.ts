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
  'profile.created': 'profile.created',
  'profile.updated': 'profile.updated',
  'student.profile.completed': 'student.profile.completed',
  'tutor.profile.completed': 'tutor.profile.completed',
};

const EXCHANGE = 'profile.events';
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
        // Declare the outgoing exchange — idempotent
        await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, {
          durable: true,
        });
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

    // Envelope follows the platform convention from CLAUDE.md
    const envelope = {
      eventId: event.eventId,
      eventType: event.eventType,
      timestamp: event.occurredAt.toISOString(),
      version: 1,
      source: 'user-profile-service',
      payload: event,
    };

    const body = Buffer.from(JSON.stringify(envelope));

    try {
      await this.channelWrapper!.publish(EXCHANGE, routingKey, body, {
        contentType: 'application/json',
        persistent: true, // message survives broker restart
        messageId: randomUUID(),
        timestamp: Math.floor(Date.now() / 1000),
        headers: {
          'event-type': event.eventType,
          source: 'user-profile-service',
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
