import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { randomUUID } from 'crypto';
import type { AppConfig } from '../../config/configuration.js';

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

export interface IEventPublisher {
  publish<T>(eventType: string, payload: T, options?: { correlationId?: string }): Promise<void>;
}

@Injectable()
export class RabbitmqEventPublisher implements IEventPublisher, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqEventPublisher.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;
  private exchangeName = 'ssz.events';

  constructor(private readonly config: ConfigService<AppConfig>) {}

  onModuleInit(): void {
    const rmqConfig = this.config.get<AppConfig['rabbitmq']>('rabbitmq');
    const url = rmqConfig?.url;
    this.exchangeName = rmqConfig?.exchange ?? 'ssz.events';

    if (!url) {
      this.logger.warn('RABBITMQ_URL is not configured — event publishing is disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ publisher connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`RabbitMQ publisher disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(this.exchangeName, 'topic', { durable: true });
        this.logger.log(`Exchange "${this.exchangeName}" asserted — publisher ready`);
      },
    });
  }

  async publish<T>(eventType: string, payload: T, options?: { correlationId?: string }): Promise<void> {
    if (!this.channelWrapper) {
      this.logger.warn(`Cannot publish "${eventType}" — RabbitMQ not connected`);
      return;
    }

    const envelope = {
      eventId: randomUUID(),
      eventType,
      eventVersion: '1.0',
      occurredAt: new Date().toISOString(),
      source: 'notification-service',
      correlationId: options?.correlationId,
      payload,
    };

    const body = Buffer.from(JSON.stringify(envelope));

    try {
      await this.channelWrapper.publish(this.exchangeName, eventType, body, {
        contentType: 'application/json',
        persistent: true,
        messageId: envelope.eventId,
        timestamp: Math.floor(Date.now() / 1000),
        headers: { 'x-event-type': eventType, 'x-source': 'notification-service' },
      });
      this.logger.log(`Published "${eventType}" [${envelope.eventId}]`);
    } catch (err) {
      this.logger.error(`Failed to publish "${eventType}": ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
