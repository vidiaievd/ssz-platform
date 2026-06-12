import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, ORGANIZATION_EVENT_TYPES } from '@ssz/contracts';
import type { AppConfig } from '../../config/configuration.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

const QUEUE = 'scheduling-service.org-projections';

@Injectable()
export class SchoolMembershipConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchoolMembershipConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — SchoolMembershipConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('SchoolMembershipConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`Disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.ORGANIZATION, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGES.ORGANIZATION, ORGANIZATION_EVENT_TYPES.SCHOOL_MEMBER_ADDED);
        await channel.bindQueue(QUEUE, EXCHANGES.ORGANIZATION, ORGANIZATION_EVENT_TYPES.SCHOOL_MEMBER_REMOVED);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`SchoolMembershipConsumer listening on "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: { eventId?: string; eventType?: string; payload?: unknown };
    try {
      envelope = JSON.parse(msg.content.toString()) as typeof envelope;
    } catch {
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType, payload } = envelope;
    if (!eventId || !eventType) { channel.nack(msg, false, false); return; }

    try {
      const alreadyProcessed = await this.prisma.processedEvent
        .findUnique({ where: { eventId } })
        .then((r) => !!r)
        .catch(() => false);
      if (alreadyProcessed) { channel.ack(msg); return; }

      const p = payload as Record<string, unknown>;

      if (eventType === ORGANIZATION_EVENT_TYPES.SCHOOL_MEMBER_ADDED) {
        await this.prisma.schoolMembership.upsert({
          where: { schoolId_userId: { schoolId: p['schoolId'] as string, userId: p['userId'] as string } },
          create: { schoolId: p['schoolId'] as string, userId: p['userId'] as string, role: p['role'] as string },
          update: { role: p['role'] as string },
        });
      } else if (eventType === ORGANIZATION_EVENT_TYPES.SCHOOL_MEMBER_REMOVED) {
        await this.prisma.schoolMembership
          .deleteMany({ where: { schoolId: p['schoolId'] as string, userId: p['userId'] as string } })
          .catch(() => null);
      }

      await this.prisma.processedEvent.create({ data: { eventId, eventType } });
      channel.ack(msg);
    } catch (err) {
      this.logger.error(`Failed "${eventType}" [${eventId}]: ${String(err)}`);
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
