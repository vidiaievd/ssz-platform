import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, ORGANIZATION_EVENT_TYPES } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

const QUEUE = 'learning-service.school-purged';
const ROUTING_KEY = ORGANIZATION_EVENT_TYPES.SCHOOL_PURGED;

interface EventEnvelope {
  eventId?: string;
  eventType?: string;
  payload?: { schoolId?: unknown };
}

/**
 * Plan 90, phase 5, step 8: a school's data is gone (`school.purged`), so what was filed under it
 * ends — its open enrolments and assignments become `COMPLETED`.
 *
 * **The learner's history is not touched**: progress, SRS cards, atom evidence stay as they are.
 * Written straight to the tables and with no event: a `completed` event per row would tell
 * notifications and analytics that thousands of learners finished a course, and none did.
 * An unfinished, unstarted row is closed too — there is nothing left to start.
 * Idempotent by its filter (only open rows move); `processed_events` records the event as well.
 */
@Injectable()
export class SchoolPurgedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchoolPurgedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — SchoolPurgedConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('SchoolPurgedConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`SchoolPurgedConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.ORGANIZATION!, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGES.ORGANIZATION!, ROUTING_KEY);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => {
          if (msg) void this.handleMessage(channel, msg);
        });
        this.logger.log(`SchoolPurgedConsumer listening on "${QUEUE}"`);
      },
    });
  }

  async handleMessage(channel: Pick<ConfirmChannel, 'ack' | 'nack'>, msg: ConsumeMessage): Promise<void> {
    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
    } catch {
      this.logger.error('Malformed message — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId } = envelope;
    const schoolId = envelope.payload?.schoolId;
    if (!eventId || typeof schoolId !== 'string' || schoolId.length === 0) {
      // Without a school id the filters below would drop out and close every school's rows.
      this.logger.error(`${ROUTING_KEY} [${String(eventId)}] carries no schoolId — discarding`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      if (await this.prisma.processedEvent.findUnique({ where: { eventId } })) {
        channel.ack(msg);
        return;
      }

      const now = new Date();
      const [enrollments, assignments] = await this.prisma.$transaction([
        this.prisma.enrollment.updateMany({
          where: { schoolId, status: 'ACTIVE', deletedAt: null },
          data: { status: 'COMPLETED', completedAt: now },
        }),
        this.prisma.assignment.updateMany({
          where: { schoolId, status: { in: ['ACTIVE', 'OVERDUE'] }, deletedAt: null },
          data: { status: 'COMPLETED', completedAt: now },
        }),
        this.prisma.processedEvent.create({ data: { eventId, eventType: ROUTING_KEY } }),
      ]);
      this.logger.log(
        `School ${schoolId} purged: ${enrollments.count} enrolment(s) and ${assignments.count} assignment(s) completed`,
      );
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Error handling ${ROUTING_KEY} [${eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, !msg.fields?.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
