import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { AppConfig } from '../../config/configuration.js';
import { PrismaService } from '../database/prisma.service.js';
import { NudgeRequestedHandler } from '../../modules/notifications/handlers/nudge-requested.handler.js';

const QUEUE = 'notification-service.analytics';

@Injectable()
export class AnalyticsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsConsumerService.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
    private readonly nudgeHandler: NudgeRequestedHandler,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — AnalyticsConsumerService disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('AnalyticsConsumerService connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`AnalyticsConsumerService disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.ANALYTICS, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGES.ANALYTICS, this.nudgeHandler.routingKey);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`AnalyticsConsumerService listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: { eventId?: string; eventType?: string; occurredAt?: string; source?: string; payload?: unknown };
    try {
      envelope = JSON.parse(msg.content.toString()) as typeof envelope;
    } catch {
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType, occurredAt, source, payload } = envelope;
    if (!eventId || !eventType) { channel.nack(msg, false, false); return; }

    try {
      const alreadyProcessed = await this.prisma.processedEvent.findUnique({ where: { eventId } }).then((r) => !!r).catch(() => false);
      if (alreadyProcessed) { channel.ack(msg); return; }

      const handler = msg.fields.routingKey === this.nudgeHandler.routingKey ? this.nudgeHandler : null;
      if (handler) {
        await handler.handle(payload as any, { eventId, eventType, occurredAt: occurredAt ?? new Date().toISOString(), source: source ?? 'unknown' });
      }

      await this.prisma.processedEvent.create({ data: { eventId, eventType } });
      channel.ack(msg);
      this.logger.debug(`Processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(`Failed "${eventType}" [${eventId}]: ${String(err)}`);
      channel.nack(msg, false, !redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
