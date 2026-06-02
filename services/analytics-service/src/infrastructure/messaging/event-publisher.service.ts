import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { randomUUID } from 'crypto';
import { EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../config/configuration.js';

@Injectable()
export class EventPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPublisherService.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(private readonly config: ConfigService<AppConfig>) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — EventPublisherService disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('EventPublisherService connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`EventPublisherService disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.ANALYTICS, 'topic', { durable: true });
        this.logger.log('EventPublisherService ready — analytics.events exchange asserted');
      },
    });
  }

  async publish<T>(eventType: string, payload: T): Promise<void> {
    if (!this.channelWrapper) {
      this.logger.warn(`Cannot publish "${eventType}" — RabbitMQ not connected`);
      return;
    }

    const envelope: BaseEvent<T> = {
      eventId: randomUUID(),
      eventType,
      eventVersion: '1.0',
      occurredAt: new Date().toISOString(),
      source: 'analytics-service',
      payload,
    };

    await this.channelWrapper.publish(
      EXCHANGES.ANALYTICS,
      eventType,
      Buffer.from(JSON.stringify(envelope)),
      { contentType: 'application/json', persistent: true, messageId: envelope.eventId },
    );

    this.logger.debug(`Published "${eventType}" [${envelope.eventId}]`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
