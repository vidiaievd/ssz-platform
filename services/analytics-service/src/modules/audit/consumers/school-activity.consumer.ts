import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { randomUUID } from 'crypto';
import { EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

const PROCESSOR_ID = 'school-activity';

// Queue per exchange so we can bind to multiple exchanges
const QUEUES = {
  [EXCHANGES.ORGANIZATION]: 'analytics-service.audit.organization',
  [EXCHANGES.CONTENT]: 'analytics-service.audit.content',
  [EXCHANGES.LEARNING]: 'analytics-service.audit.learning',
  [EXCHANGES.EXERCISE_ENGINE]: 'analytics-service.audit.exercise-engine',
} as const;

const BINDINGS: Record<string, string[]> = {
  [EXCHANGES.ORGANIZATION]: ['school.member.added'],
  [EXCHANGES.CONTENT]: ['content.container.published'],
  [EXCHANGES.LEARNING]: ['learning.enrollment.created'],
  // Review moved to the exercise engine in plan 44: an attempt is the submission now,
  // and both events carry the school themselves, so the feed needs no copy of its own.
  [EXCHANGES.EXERCISE_ENGINE]: [
    'exercise.attempt.routed_for_review',
    'exercise.attempt.reviewed',
  ],
};

@Injectable()
export class SchoolActivityConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchoolActivityConsumer.name);
  private connections: ReturnType<typeof amqp.connect>[] = [];
  private channels: ReturnType<ReturnType<typeof amqp.connect>['createChannel']>[] = [];

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — SchoolActivityConsumer disabled');
      return;
    }

    for (const [exchange, queue] of Object.entries(QUEUES)) {
      const conn = amqp.connect([url]);
      conn.on('connect', () => this.logger.log(`SchoolActivityConsumer[${exchange}] connected`));
      conn.on('disconnect', ({ err }: { err?: Error }) =>
        this.logger.warn(`SchoolActivityConsumer[${exchange}] disconnected: ${err?.message ?? 'unknown'}`),
      );
      this.connections.push(conn);

      const keys = BINDINGS[exchange] ?? [];
      const ch = conn.createChannel({
        setup: async (channel: ConfirmChannel) => {
          await channel.assertExchange(exchange, 'topic', { durable: true });
          await channel.assertQueue(queue, { durable: true });
          for (const key of keys) {
            await channel.bindQueue(queue, exchange, key);
          }
          await channel.consume(queue, (msg) => this.handleMessage(channel, exchange, msg));
          this.logger.log(`SchoolActivityConsumer: listening on "${queue}"`);
        },
      });
      this.channels.push(ch);
    }
  }

  private async handleMessage(
    channel: ConfirmChannel,
    exchange: string,
    msg: ConsumeMessage | null,
  ): Promise<void> {
    if (!msg) return;

    let envelope: BaseEvent<unknown>;
    try {
      envelope = JSON.parse(msg.content.toString()) as BaseEvent<unknown>;
    } catch {
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType } = envelope;
    if (!eventId || !eventType) { channel.nack(msg, false, false); return; }

    try {
      const alreadyProcessed = await this.prisma.processedEvent.findUnique({
        where: { eventId_processorId: { eventId, processorId: PROCESSOR_ID } },
      });
      if (alreadyProcessed) { channel.ack(msg); return; }

      const activity = await this.buildActivity(
        eventType,
        envelope.payload as Record<string, unknown>,
        envelope.occurredAt,
      );

      if (activity) {
        await this.prisma.schoolActivity.create({ data: activity });
      }

      await this.prisma.processedEvent.create({
        data: { eventId, processorId: PROCESSOR_ID, eventType },
      });
      channel.ack(msg);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(`SchoolActivityConsumer: failed "${eventType}" [${eventId}]: ${String(err)}`);
      channel.nack(msg, false, !redelivered);
    }
  }

  private async buildActivity(
    eventType: string,
    payload: Record<string, unknown>,
    occurredAt: string,
  ): Promise<Parameters<typeof this.prisma.schoolActivity.create>[0]['data'] | null> {
    const ts = new Date(occurredAt);

    switch (eventType) {
      case 'school.member.added': {
        const p = payload as unknown as { schoolId: string; userId: string; role: string };
        const actorName = await this.resolveDisplayName(p.userId);
        return {
          id: randomUUID(),
          schoolId: p.schoolId,
          actorId: p.userId,
          actorName,
          eventType,
          tag: 'people',
          what: `joined as ${p.role.toLowerCase()}`,
          occurredAt: ts,
        };
      }

      case 'content.container.published': {
        const p = payload as unknown as { containerId: string; publishedBy: string };
        const [actorName, container] = await Promise.all([
          this.resolveDisplayName(p.publishedBy),
          this.prisma.containerDirectory.findUnique({
            where: { containerId: p.containerId },
            select: { title: true, ownerSchoolId: true },
          }),
        ]);
        if (!container?.ownerSchoolId) return null;
        return {
          id: randomUUID(),
          schoolId: container.ownerSchoolId,
          actorId: p.publishedBy,
          actorName,
          eventType,
          tag: 'content',
          what: 'published',
          target: container.title,
          targetId: p.containerId,
          occurredAt: ts,
        };
      }

      case 'learning.enrollment.created': {
        const p = payload as unknown as { enrollmentId: string; userId: string; containerId: string; schoolId: string | null };
        if (!p.schoolId) return null;
        const [actorName, container] = await Promise.all([
          this.resolveDisplayName(p.userId),
          this.prisma.containerDirectory.findUnique({
            where: { containerId: p.containerId },
            select: { title: true },
          }),
        ]);
        return {
          id: randomUUID(),
          schoolId: p.schoolId,
          actorId: p.userId,
          actorName,
          eventType,
          tag: 'people',
          what: 'enrolled in',
          target: container?.title ?? p.containerId,
          targetId: p.containerId,
          occurredAt: ts,
        };
      }

      case 'exercise.attempt.routed_for_review': {
        const p = payload as unknown as {
          attemptId: string;
          userId: string;
          exerciseId: string;
          schoolId: string | null;
        };
        if (!p.schoolId) return null;
        const actorName = await this.resolveDisplayName(p.userId);
        return {
          id: randomUUID(),
          schoolId: p.schoolId,
          actorId: p.userId,
          actorName,
          eventType,
          tag: 'review',
          what: 'submitted for review',
          targetId: p.attemptId,
          occurredAt: ts,
        };
      }

      case 'exercise.attempt.reviewed': {
        const p = payload as unknown as {
          attemptId: string;
          reviewerId: string;
          userId: string;
          outcome: string;
          schoolId: string | null;
        };
        // The verdict carries its own school (plan 44 §44.14): practice outside a school,
        // and work that predates the snapshot, simply do not belong to any feed.
        if (!p.schoolId) return null;
        const actorName = await this.resolveDisplayName(p.reviewerId);
        return {
          id: randomUUID(),
          schoolId: p.schoolId,
          actorId: p.reviewerId,
          actorName,
          eventType,
          tag: 'review',
          what: `reviewed submission — ${p.outcome.toLowerCase()}`,
          targetId: p.attemptId,
          occurredAt: ts,
        };
      }

      default:
        return null;
    }
  }

  private async resolveDisplayName(userId: string): Promise<string | null> {
    const entry = await this.prisma.userDirectory.findUnique({
      where: { userId },
      select: { displayName: true },
    });
    return entry?.displayName ?? null;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.channels.map((ch) => ch.close()));
    await Promise.all(this.connections.map((conn) => conn.close()));
  }
}
