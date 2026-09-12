import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import { randomUUID } from 'crypto';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

const PROCESSOR_ID = 'progress-activity';
const QUEUE = 'analytics-service.metrics.progress-activity';
const EXCHANGE = EXCHANGES.LEARNING;

const BINDING_KEYS = [
  'learning.progress.updated',
  'learning.progress.completed',
] as const;

interface ProgressUpdatedPayload {
  userId: string;
  contentType: string;
  contentId: string;
  status: string;
  attemptsCount: number;
  score: number | null;
}

interface ProgressCompletedPayload {
  userId: string;
  contentType: string;
  contentId: string;
  completedAt: string;
  score: number | null;
}

@Injectable()
export class ProgressActivityConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProgressActivityConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — ProgressActivityConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('ProgressActivityConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`ProgressActivityConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        // One at a time: `item_progress` below is last-write-wins per item, and a batch
        // delivered at once would let an older status land after a newer one.
        await channel.prefetch(1);
        for (const key of BINDING_KEYS) {
          await channel.bindQueue(QUEUE, EXCHANGE, key);
        }
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`ProgressActivityConsumer listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
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

      await this.applyEvent(eventType, envelope.payload as Record<string, unknown>, envelope.occurredAt);

      await this.prisma.processedEvent.create({
        data: { eventId, processorId: PROCESSOR_ID, eventType },
      });
      channel.ack(msg);
      this.logger.debug(`ProgressActivityConsumer: processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(`ProgressActivityConsumer: failed "${eventType}" [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`);
      channel.nack(msg, false, !redelivered);
    }
  }

  private async applyEvent(
    eventType: string,
    payload: Record<string, unknown>,
    occurredAt: string,
  ): Promise<void> {
    const ts = new Date(occurredAt);

    switch (eventType) {
      case 'learning.progress.updated': {
        const p = payload as unknown as ProgressUpdatedPayload;
        await this.prisma.progressActivity.create({
          data: {
            id: randomUUID(),
            userId: p.userId,
            contentType: p.contentType,
            contentId: p.contentId,
            kind: 'updated',
            occurredAt: ts,
          },
        });
        await this.rememberState(p.userId, p.contentType, p.contentId, p.status, ts);
        break;
      }

      case 'learning.progress.completed': {
        const p = payload as unknown as ProgressCompletedPayload;
        await this.prisma.progressActivity.create({
          data: {
            id: randomUUID(),
            userId: p.userId,
            contentType: p.contentType,
            contentId: p.contentId,
            kind: 'completed',
            occurredAt: new Date(p.completedAt ?? occurredAt),
          },
        });
        await this.rememberState(
          p.userId,
          p.contentType,
          p.contentId,
          'COMPLETED',
          new Date(p.completedAt ?? occurredAt),
        );
        break;
      }

      default:
        this.logger.warn(`ProgressActivityConsumer: unhandled event type "${eventType}"`);
    }
  }

  /**
   * The current state of one item for one learner — plan 58, phase 1.
   *
   * Written beside the activity log rather than instead of it: the log answers "when did
   * this person last do anything" and cannot answer "how much of unit 4 is passed"
   * without replaying itself, which is the question every group screen asks.
   *
   * Last write wins, guarded by the timestamp. Events for one item arrive in order today,
   * but a redelivery after a restart does not have to, and an older `IN_PROGRESS`
   * overwriting a newer `COMPLETED` would silently subtract from a learner's progress.
   */
  private async rememberState(
    userId: string,
    contentType: string,
    contentId: string,
    status: string,
    at: Date,
  ): Promise<void> {
    const key = {
      userId_contentType_contentId: { userId, contentType, contentId },
    };
    const known = await this.prisma.itemProgress.findUnique({ where: key });
    if (known && known.updatedAt > at) return;

    await this.prisma.itemProgress.upsert({
      where: key,
      create: { userId, contentType, contentId, status, updatedAt: at },
      update: { status, updatedAt: at },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
