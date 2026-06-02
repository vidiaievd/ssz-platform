import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

// One durable queue per exchange so we don't miss events published to exchanges
// we weren't bound to yet. Each queue uses routing key '#' (wildcard — all events).
const QUEUE_PREFIX = 'analytics-service.archive';

const ALL_EXCHANGES = Object.values(EXCHANGES);

@Injectable()
export class ArchiveAllConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArchiveAllConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;

    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — ArchiveAllConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ archive consumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`RabbitMQ archive consumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        for (const exchange of ALL_EXCHANGES) {
          const queue = `${QUEUE_PREFIX}.${exchange}`;

          await channel.assertExchange(exchange, 'topic', { durable: true });
          await channel.assertQueue(queue, { durable: true });
          await channel.bindQueue(queue, exchange, '#');

          await channel.consume(queue, (msg) => this.handleMessage(channel, exchange, msg));
          this.logger.log(`Archiving exchange "${exchange}" via queue "${queue}"`);
        }
      },
    });
  }

  private async handleMessage(
    channel: ConfirmChannel,
    exchange: string,
    msg: ConsumeMessage | null,
  ): Promise<void> {
    if (!msg) return;

    let envelope: Partial<BaseEvent>;

    try {
      envelope = JSON.parse(msg.content.toString()) as Partial<BaseEvent>;
    } catch {
      this.logger.error(`Non-JSON message on ${exchange} — dead-lettering`);
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType, occurredAt, source, payload } = envelope;

    if (!eventId || !eventType) {
      this.logger.warn(`Message on ${exchange} missing eventId/eventType — discarding`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      // Idempotent upsert: duplicate eventId is silently ignored via unique constraint.
      await this.prisma.eventArchive.upsert({
        where: { eventId },
        create: {
          eventId,
          eventType,
          exchange,
          routingKey: msg.fields.routingKey,
          source: source ?? 'unknown',
          payload: (payload ?? {}) as object,
          occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        },
        update: {},
      });

      channel.ack(msg);
      this.logger.debug(`Archived "${eventType}" [${eventId}] from ${exchange}`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `Failed to archive "${eventType}" [${eventId}]: ${err instanceof Error ? err.message : String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
