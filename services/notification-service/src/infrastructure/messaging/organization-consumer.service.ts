import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { AppConfig } from '../../config/configuration.js';
import { PrismaService } from '../database/prisma.service.js';
import { SchoolInvitationSentHandler } from '../../modules/notifications/handlers/school-invitation-sent.handler.js';
import type { IMessageHandler } from './message-handler.interface.js';

const QUEUE = 'notification-service.organization';

@Injectable()
export class OrganizationConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrganizationConsumerService.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  private readonly handlers: IMessageHandler<any>[];

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
    private readonly schoolInvitationSentHandler: SchoolInvitationSentHandler,
  ) {
    this.handlers = [schoolInvitationSentHandler];
  }

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — OrganizationConsumerService disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('OrganizationConsumerService connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`OrganizationConsumerService disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.ORGANIZATION, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const handler of this.handlers) {
          await channel.bindQueue(QUEUE, EXCHANGES.ORGANIZATION, handler.routingKey);
        }
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`OrganizationConsumerService listening on queue "${QUEUE}"`);
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
      const alreadyProcessed = await this.prisma.processedEvent
        .findUnique({ where: { eventId } })
        .then((r) => !!r)
        .catch(() => false);
      if (alreadyProcessed) { channel.ack(msg); return; }

      const handler = this.handlers.find((h) => h.routingKey === msg.fields.routingKey);
      if (handler) {
        await handler.handle(payload as any, {
          eventId,
          eventType,
          occurredAt: occurredAt ?? new Date().toISOString(),
          source: source ?? 'unknown',
        });
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
