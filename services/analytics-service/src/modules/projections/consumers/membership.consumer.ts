import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

const PROCESSOR_ID = 'membership';
const QUEUE = 'analytics-service.projections.membership';
const EXCHANGE = EXCHANGES.ORGANIZATION;

const BINDING_KEYS = [
  'school.created',
  'school.member.added',
  'school.member.removed',
] as const;

interface SchoolCreatedPayload {
  eventId: string;
  schoolId: string;
  ownerId: string;
  occurredAt: string;
}

interface SchoolMemberAddedPayload {
  eventId: string;
  schoolId: string;
  userId: string;
  role: string;
  occurredAt: string;
}

interface SchoolMemberRemovedPayload {
  eventId: string;
  schoolId: string;
  userId: string;
}

@Injectable()
export class MembershipConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MembershipConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — MembershipConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('MembershipConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`MembershipConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of BINDING_KEYS) {
          await channel.bindQueue(QUEUE, EXCHANGE, key);
        }
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`MembershipConsumer listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: BaseEvent<unknown>;
    try {
      envelope = JSON.parse(msg.content.toString()) as BaseEvent<unknown>;
    } catch {
      this.logger.error('MembershipConsumer: non-JSON message — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType } = envelope;
    if (!eventId || !eventType) {
      this.logger.warn('MembershipConsumer: missing eventId/eventType — discarding');
      channel.nack(msg, false, false);
      return;
    }

    try {
      const alreadyProcessed = await this.prisma.processedEvent.findUnique({
        where: { eventId_processorId: { eventId, processorId: PROCESSOR_ID } },
      });
      if (alreadyProcessed) {
        channel.ack(msg);
        return;
      }

      await this.applyEvent(eventType, envelope.payload as Record<string, unknown>, envelope.occurredAt);

      await this.prisma.processedEvent.create({
        data: { eventId, processorId: PROCESSOR_ID, eventType },
      });

      channel.ack(msg);
      this.logger.debug(`MembershipConsumer: processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `MembershipConsumer: failed "${eventType}" [${eventId}]: ${err instanceof Error ? err.message : String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  private async applyEvent(
    eventType: string,
    payload: Record<string, unknown>,
    occurredAt: string,
  ): Promise<void> {
    switch (eventType) {
      case 'school.created': {
        const p = payload as unknown as SchoolCreatedPayload;
        await this.prisma.schoolMembership.upsert({
          where: { schoolId_userId: { schoolId: p.schoolId, userId: p.ownerId } },
          create: {
            schoolId: p.schoolId,
            userId: p.ownerId,
            role: 'OWNER',
            joinedAt: new Date(p.occurredAt ?? occurredAt),
          },
          update: { role: 'OWNER' },
        });
        break;
      }

      case 'school.member.added': {
        const p = payload as unknown as SchoolMemberAddedPayload;
        await this.prisma.schoolMembership.upsert({
          where: { schoolId_userId: { schoolId: p.schoolId, userId: p.userId } },
          create: {
            schoolId: p.schoolId,
            userId: p.userId,
            role: p.role,
            joinedAt: new Date(p.occurredAt ?? occurredAt),
          },
          update: { role: p.role },
        });
        break;
      }

      case 'school.member.removed': {
        const p = payload as unknown as SchoolMemberRemovedPayload;
        await this.prisma.schoolMembership.deleteMany({
          where: { schoolId: p.schoolId, userId: p.userId },
        });
        break;
      }

      default:
        this.logger.warn(`MembershipConsumer: unhandled event type "${eventType}"`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
