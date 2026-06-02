import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

const PROCESSOR_ID = 'submission';
const QUEUE = 'analytics-service.metrics.submission';
const EXCHANGE = EXCHANGES.LEARNING;

const BINDING_KEYS = [
  'learning.submission.created',
  'learning.submission.reviewed',
  'learning.submission.resubmitted',
] as const;

interface SubmissionCreatedPayload {
  submissionId: string;
  userId: string;
  exerciseId: string;
  assignmentId: string | null;
  schoolId: string | null;
}

interface SubmissionReviewedPayload {
  submissionId: string;
  userId: string;
  exerciseId: string;
  assignmentId: string | null;
  reviewerId: string;
  decision: string;
  feedback: string | null;
  score: number | null;
}

interface SubmissionResubmittedPayload {
  submissionId: string;
  userId: string;
  exerciseId: string;
  revisionNumber: number;
}

@Injectable()
export class SubmissionConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubmissionConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — SubmissionConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('SubmissionConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`SubmissionConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of BINDING_KEYS) {
          await channel.bindQueue(QUEUE, EXCHANGE, key);
        }
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`SubmissionConsumer listening on queue "${QUEUE}"`);
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
      this.logger.debug(`SubmissionConsumer: processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(`SubmissionConsumer: failed "${eventType}" [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`);
      channel.nack(msg, false, !redelivered);
    }
  }

  private async applyEvent(
    eventType: string,
    payload: Record<string, unknown>,
    occurredAt: string,
  ): Promise<void> {
    switch (eventType) {
      case 'learning.submission.created': {
        const p = payload as unknown as SubmissionCreatedPayload;
        await this.prisma.submissionProjection.upsert({
          where: { submissionId: p.submissionId },
          create: {
            submissionId: p.submissionId,
            userId: p.userId,
            exerciseId: p.exerciseId,
            assignmentId: p.assignmentId ?? null,
            schoolId: p.schoolId ?? null,
            status: 'PENDING_REVIEW',
            submittedAt: new Date(occurredAt),
          },
          update: {},
        });
        break;
      }

      case 'learning.submission.reviewed': {
        const p = payload as unknown as SubmissionReviewedPayload;
        const status =
          p.decision === 'APPROVED' ? 'APPROVED'
          : p.decision === 'REJECTED' ? 'REJECTED'
          : 'REVISION_REQUESTED';
        await this.prisma.submissionProjection.updateMany({
          where: { submissionId: p.submissionId },
          data: { status, reviewedAt: new Date(occurredAt) },
        });
        break;
      }

      case 'learning.submission.resubmitted': {
        const p = payload as unknown as SubmissionResubmittedPayload;
        await this.prisma.submissionProjection.updateMany({
          where: { submissionId: p.submissionId },
          data: { status: 'RESUBMITTED' },
        });
        break;
      }

      default:
        this.logger.warn(`SubmissionConsumer: unhandled event type "${eventType}"`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
