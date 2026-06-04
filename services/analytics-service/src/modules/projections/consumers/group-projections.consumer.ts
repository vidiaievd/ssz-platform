import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { randomUUID } from 'crypto';

const PROCESSOR_ID = 'group-projections';
const QUEUE = 'analytics-service.projections.group';
const EXCHANGE = EXCHANGES.ORGANIZATION;

const BINDING_KEYS = [
  'school.group.published',
  'school.group.archived',
  'school.group.member.added',
  'school.group.member.removed',
] as const;

interface GroupPublishedPayload {
  schoolId: string;
  groupId: string;
  groupName: string;
  courseId: string | null;
  lang: string | null;
  level: string | null;
}

interface GroupArchivedPayload {
  schoolId: string;
  groupId: string;
}

interface GroupMemberAddedPayload {
  schoolId: string;
  groupId: string;
  userId: string;
  addedAt: string;
}

interface GroupMemberRemovedPayload {
  schoolId: string;
  groupId: string;
  userId: string;
}

@Injectable()
export class GroupProjectionsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GroupProjectionsConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — GroupProjectionsConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('GroupProjectionsConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`GroupProjectionsConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of BINDING_KEYS) {
          await channel.bindQueue(QUEUE, EXCHANGE, key);
        }
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`GroupProjectionsConsumer listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: BaseEvent<unknown>;
    try {
      envelope = JSON.parse(msg.content.toString()) as BaseEvent<unknown>;
    } catch {
      this.logger.error('GroupProjectionsConsumer: non-JSON message — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType } = envelope;
    if (!eventId || !eventType) {
      this.logger.warn('GroupProjectionsConsumer: missing eventId/eventType — discarding');
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

      await this.applyEvent(eventType, envelope.payload as Record<string, unknown>);

      await this.prisma.processedEvent.create({
        data: { eventId, processorId: PROCESSOR_ID, eventType },
      });

      channel.ack(msg);
      this.logger.debug(`GroupProjectionsConsumer: processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `GroupProjectionsConsumer: failed "${eventType}" [${eventId}]: ${err instanceof Error ? err.message : String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  private async applyEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    switch (eventType) {
      case 'school.group.published': {
        const p = payload as unknown as GroupPublishedPayload;
        await (this.prisma as any).groupDirectory.upsert({
          where: { groupId: p.groupId },
          create: {
            groupId: p.groupId,
            schoolId: p.schoolId,
            name: p.groupName,
            lang: p.lang ?? null,
            level: p.level ?? null,
            courseId: p.courseId ?? null,
            status: 'active',
          },
          update: {
            name: p.groupName,
            lang: p.lang ?? null,
            level: p.level ?? null,
            courseId: p.courseId ?? null,
            status: 'active',
          },
        });
        break;
      }

      case 'school.group.archived': {
        const p = payload as unknown as GroupArchivedPayload;
        await (this.prisma as any).groupDirectory.updateMany({
          where: { groupId: p.groupId },
          data: { status: 'archived' },
        });
        break;
      }

      case 'school.group.member.added': {
        const p = payload as unknown as GroupMemberAddedPayload;
        await (this.prisma as any).groupMembership.upsert({
          where: { groupId_userId: { groupId: p.groupId, userId: p.userId } },
          create: {
            id: randomUUID(),
            groupId: p.groupId,
            schoolId: p.schoolId,
            userId: p.userId,
          },
          update: {},
        });
        break;
      }

      case 'school.group.member.removed': {
        const p = payload as unknown as GroupMemberRemovedPayload;
        await (this.prisma as any).groupMembership.deleteMany({
          where: { groupId: p.groupId, userId: p.userId },
        });
        break;
      }

      default:
        this.logger.warn(`GroupProjectionsConsumer: unhandled event type "${eventType}"`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
