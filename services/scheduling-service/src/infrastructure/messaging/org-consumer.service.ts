import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, ORGANIZATION_EVENT_TYPES } from '@ssz/contracts';
import type { AppConfig } from '../../config/configuration.js';
import { PrismaService } from '../database/prisma.service.js';
import { LessonGeneratorService } from '../../modules/slots/application/services/lesson-generator.service.js';
import { OrgServiceHttpClient } from '../org/org-service.http-client.js';
import type { WeekDay } from '../../modules/slots/domain/entities/slot.entity.js';

const QUEUE = 'scheduling-service.org-groups';

@Injectable()
export class OrgConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrgConsumerService.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
    private readonly lessonGenerator: LessonGeneratorService,
    private readonly orgClient: OrgServiceHttpClient,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — OrgConsumerService disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('OrgConsumerService connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`Disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.ORGANIZATION, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGES.ORGANIZATION, ORGANIZATION_EVENT_TYPES.GROUP_PUBLISHED);
        await channel.bindQueue(QUEUE, EXCHANGES.ORGANIZATION, ORGANIZATION_EVENT_TYPES.GROUP_ARCHIVED);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`OrgConsumerService listening on "${QUEUE}"`);
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
      if (eventType === ORGANIZATION_EVENT_TYPES.GROUP_PUBLISHED) {
        await this.handleGroupPublished(p);
      } else if (eventType === ORGANIZATION_EVENT_TYPES.GROUP_ARCHIVED) {
        await this.handleGroupArchived(p);
      }

      await this.prisma.processedEvent.create({ data: { eventId, eventType } });
      channel.ack(msg);
    } catch (err) {
      this.logger.error(`Failed "${eventType}" [${eventId}]: ${String(err)}`);
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  private async handleGroupPublished(payload: Record<string, unknown>): Promise<void> {
    const groupId = payload['groupId'] as string | undefined;
    const schoolId = payload['schoolId'] as string | undefined;
    if (!groupId || !schoolId) return;

    // The event says the group is published; the group's own facts say what to
    // plan. Reading term dates and course off the payload silently did nothing
    // for as long as this handler has existed — the published event has never
    // carried either of them.
    const [group, slots, teachers] = await Promise.all([
      this.orgClient.getGroup(schoolId, groupId),
      this.prisma.slot.findMany({ where: { groupId } }),
      this.orgClient.getGroupTeachers(schoolId, groupId),
    ]);

    if (!group?.startDate || !slots.length) return;

    const primaryTeacher = teachers.find((t) => t.role === 'primary');
    const planned = await this.lessonGenerator.regenerateTail({
      groupId,
      schoolId,
      teacherId: primaryTeacher?.userId ?? null,
      slots: slots.map((s) => ({
        id: s.id,
        groupId: s.groupId,
        schoolId: s.schoolId,
        weekday: s.weekday as WeekDay,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room,
        createdAt: s.createdAt,
      })),
      courseId: group.courseId ?? null,
      startDate: new Date(group.startDate),
    });

    this.logger.log(`Planned ${planned.length} sessions for published group ${groupId}`);
  }

  private async handleGroupArchived(payload: Record<string, unknown>): Promise<void> {
    const groupId = payload['groupId'] as string | undefined;
    if (!groupId) return;

    await this.prisma.lesson.updateMany({
      where: { groupId, date: { gte: new Date() }, status: 'scheduled' },
      data: { status: 'cancelled' },
    });

    this.logger.log(`Cancelled future lessons for archived group ${groupId}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
