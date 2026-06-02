import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

const PROCESSOR_ID = 'enrollment';
const QUEUE = 'analytics-service.metrics.enrollment';
const EXCHANGE = EXCHANGES.LEARNING;

const BINDING_KEYS = [
  'learning.enrollment.created',
  'learning.enrollment.completed',
  'learning.enrollment.unenrolled',
] as const;

interface EnrollmentCreatedPayload {
  enrollmentId: string;
  userId: string;
  containerId: string;
  schoolId: string | null;
}

interface EnrollmentCompletedPayload {
  enrollmentId: string;
  userId: string;
  containerId: string;
  schoolId: string | null;
  completedAt: string;
}

interface EnrollmentUnenrolledPayload {
  enrollmentId: string;
  userId: string;
  containerId: string;
  reason: string | null;
}

@Injectable()
export class EnrollmentConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnrollmentConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — EnrollmentConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('EnrollmentConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`EnrollmentConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of BINDING_KEYS) {
          await channel.bindQueue(QUEUE, EXCHANGE, key);
        }
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`EnrollmentConsumer listening on queue "${QUEUE}"`);
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
      this.logger.debug(`EnrollmentConsumer: processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(`EnrollmentConsumer: failed "${eventType}" [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`);
      channel.nack(msg, false, !redelivered);
    }
  }

  private async applyEvent(
    eventType: string,
    payload: Record<string, unknown>,
    occurredAt: string,
  ): Promise<void> {
    switch (eventType) {
      case 'learning.enrollment.created': {
        const p = payload as unknown as EnrollmentCreatedPayload;
        await this.prisma.enrollmentProjection.upsert({
          where: { enrollmentId: p.enrollmentId },
          create: {
            enrollmentId: p.enrollmentId,
            userId: p.userId,
            containerId: p.containerId,
            schoolId: p.schoolId ?? null,
            status: 'ACTIVE',
            enrolledAt: new Date(occurredAt),
          },
          update: {},
        });
        break;
      }

      case 'learning.enrollment.completed': {
        const p = payload as unknown as EnrollmentCompletedPayload;
        await this.prisma.enrollmentProjection.updateMany({
          where: { enrollmentId: p.enrollmentId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(p.completedAt),
          },
        });
        break;
      }

      case 'learning.enrollment.unenrolled': {
        const p = payload as unknown as EnrollmentUnenrolledPayload;
        await this.prisma.enrollmentProjection.updateMany({
          where: { enrollmentId: p.enrollmentId },
          data: {
            status: 'UNENROLLED',
            unenrolledAt: new Date(occurredAt),
          },
        });
        break;
      }

      default:
        this.logger.warn(`EnrollmentConsumer: unhandled event type "${eventType}"`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
