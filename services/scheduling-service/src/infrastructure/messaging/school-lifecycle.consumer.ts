import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, ORGANIZATION_EVENT_TYPES } from '@ssz/contracts';
import type { AppConfig } from '../../config/configuration.js';
import { PrismaService } from '../database/prisma.service.js';

const QUEUE = 'scheduling-service.school-lifecycle';
const HANDLED = [
  ORGANIZATION_EVENT_TYPES.SCHOOL_SUSPENDED,
  ORGANIZATION_EVENT_TYPES.SCHOOL_CLOSED,
  ORGANIZATION_EVENT_TYPES.SCHOOL_PURGED,
] as const;
type Handled = (typeof HANDLED)[number];

interface Envelope {
  eventId?: string;
  payload?: { schoolId?: unknown };
}

const DAY_MS = 86_400_000;

/**
 * Plan 90, phase 5, step 8. A school's timetable follows its lifecycle:
 *
 * - `suspended` / `closed` — the future is cancelled: lessons from today on that were still
 *   `scheduled` or `moved` become `cancelled` (the note says why), review blocks that start
 *   from today on are removed and a series already running is cut off yesterday. Past lessons,
 *   held ones and the log are left as they are. A school reactivated later gets no lessons
 *   back — its timetable is planned again.
 * - `purged` — everything the school has here is deleted: lessons (with their exam scores),
 *   slots, absences and substitutions, curriculum plans, review blocks, alerts, policies and the
 *   membership projection.
 *
 * Written straight to the tables, without a `lesson.changed` event per row: the school is frozen,
 * and thousands of cancellation notices would tell learners of a closed school nothing they can use.
 * Idempotent by its filters; `processed_events` records the event too.
 */
@Injectable()
export class SchoolLifecycleConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchoolLifecycleConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — SchoolLifecycleConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('SchoolLifecycleConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`SchoolLifecycleConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.ORGANIZATION!, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of HANDLED) await channel.bindQueue(QUEUE, EXCHANGES.ORGANIZATION!, key);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => {
          if (msg) void this.handleMessage(channel, msg);
        });
        this.logger.log(`SchoolLifecycleConsumer listening on "${QUEUE}"`);
      },
    });
  }

  async handleMessage(
    channel: Pick<ConfirmChannel, 'ack' | 'nack'>,
    msg: ConsumeMessage,
    now: Date = new Date(),
  ): Promise<void> {
    let envelope: Envelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as Envelope;
    } catch {
      channel.nack(msg, false, false);
      return;
    }

    const eventType = msg.fields.routingKey as Handled;
    const { eventId } = envelope;
    const schoolId = envelope.payload?.schoolId;
    if (!HANDLED.includes(eventType) || !eventId || typeof schoolId !== 'string' || schoolId.length === 0) {
      // Without a school id every filter below would drop out and hit every school.
      this.logger.error(`Malformed ${eventType} [${String(eventId)}] — discarding`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      if (await this.prisma.processedEvent.findUnique({ where: { eventId } })) {
        channel.ack(msg);
        return;
      }
      if (eventType === ORGANIZATION_EVENT_TYPES.SCHOOL_PURGED) await this.purge(schoolId);
      else await this.cancelFuture(schoolId, eventType === ORGANIZATION_EVENT_TYPES.SCHOOL_CLOSED ? 'closed' : 'suspended', now);
      await this.prisma.processedEvent.create({ data: { eventId, eventType } });
      channel.ack(msg);
    } catch (err) {
      this.logger.error(`Failed ${eventType} for school ${schoolId} [${eventId}]: ${String(err)}`);
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  private async cancelFuture(schoolId: string, why: 'suspended' | 'closed', now: Date): Promise<void> {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterday = new Date(today.getTime() - DAY_MS);

    const [lessons, removed, cut] = await this.prisma.$transaction([
      this.prisma.lesson.updateMany({
        where: { schoolId, date: { gte: today }, status: { in: ['scheduled', 'moved'] } },
        data: { status: 'cancelled', note: `School ${why}` },
      }),
      this.prisma.reviewBlock.deleteMany({ where: { schoolId, startsOn: { gte: today } } }),
      this.prisma.reviewBlock.updateMany({
        where: { schoolId, startsOn: { lt: today }, OR: [{ endsOn: null }, { endsOn: { gte: today } }] },
        data: { endsOn: yesterday },
      }),
    ]);
    this.logger.log(
      `School ${schoolId} ${why}: ${lessons.count} lesson(s) cancelled, ${removed.count} review block(s) removed, ${cut.count} series cut`,
    );
  }

  private async purge(schoolId: string): Promise<void> {
    // Children before parents: substitutions point at lessons and absences without a cascade.
    await this.prisma.$transaction([
      this.prisma.substituteAssignment.deleteMany({ where: { request: { schoolId } } }),
      this.prisma.substituteRequest.deleteMany({ where: { schoolId } }),
      this.prisma.lesson.deleteMany({ where: { schoolId } }),
      this.prisma.teacherAbsence.deleteMany({ where: { schoolId } }),
      this.prisma.slot.deleteMany({ where: { schoolId } }),
      this.prisma.curriculumPlan.deleteMany({ where: { schoolId } }),
      this.prisma.reviewBlock.deleteMany({ where: { schoolId } }),
      this.prisma.alert.deleteMany({ where: { schoolId } }),
      this.prisma.gradingPolicy.deleteMany({ where: { schoolId } }),
      this.prisma.workloadPolicy.deleteMany({ where: { schoolId } }),
      this.prisma.schoolMembership.deleteMany({ where: { schoolId } }),
    ]);
    this.logger.log(`School ${schoolId} purged: its timetable data deleted`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
