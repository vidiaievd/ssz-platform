import { Injectable, Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import {
  ENROLLMENT_REPOSITORY,
  type IEnrollmentRepository,
} from '../../enrollments/domain/repositories/enrollment.repository.interface.js';
import {
  LEARNING_EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../shared/application/ports/event-publisher.port.js';
import { Enrollment } from '../../enrollments/domain/entities/enrollment.entity.js';

const QUEUE = 'learning-service.group-enrollments';
const EXCHANGE = EXCHANGES.ORGANIZATION;

const BINDING_KEYS = [
  'school.group.member.added',
  'school.group.material.added',
] as const;

interface GroupMemberAddedPayload {
  schoolId: string;
  groupId: string;
  userId: string;
  courseId: string | null;
  groupStatus: string;
}

interface GroupMaterialAddedPayload {
  schoolId: string;
  groupId: string;
  userId: string;
  courseId: string;
  groupStatus: string;
}

interface EventEnvelope {
  eventId: string;
  eventType: string;
  payload: unknown;
}

@Injectable()
export class GroupEnrollmentConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GroupEnrollmentConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
    @Inject(ENROLLMENT_REPOSITORY) private readonly enrollmentRepo: IEnrollmentRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — GroupEnrollmentConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('GroupEnrollmentConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`GroupEnrollmentConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of BINDING_KEYS) {
          await channel.bindQueue(QUEUE, EXCHANGE, key);
        }
        await channel.prefetch(10);
        await channel.consume(QUEUE, (msg) => {
          if (msg) void this.handleMessage(channel, msg);
        });
        this.logger.log(`GroupEnrollmentConsumer listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage): Promise<void> {
    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
    } catch {
      this.logger.error('GroupEnrollmentConsumer: malformed message — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType, payload } = envelope;
    if (!eventId || !eventType) {
      channel.nack(msg, false, false);
      return;
    }

    try {
      const existing = await this.prisma.processedEvent.findUnique({ where: { eventId } });
      if (existing) {
        this.logger.debug(`Duplicate event ${eventId} — skipping`);
        channel.ack(msg);
        return;
      }

      await this.applyEvent(eventType, payload as Record<string, unknown>);

      await this.prisma.processedEvent.create({ data: { eventId, eventType } });
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `GroupEnrollmentConsumer: failed "${eventType}" [${eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, false);
    }
  }

  private async applyEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    switch (eventType) {
      case 'school.group.member.added': {
        const p = payload as unknown as GroupMemberAddedPayload;
        if (!p.courseId || p.groupStatus !== 'active') return;
        await this.ensureEnrolled(p.userId, p.courseId, p.schoolId);
        break;
      }

      case 'school.group.material.added': {
        const p = payload as unknown as GroupMaterialAddedPayload;
        if (p.groupStatus !== 'active') return;
        await this.ensureEnrolled(p.userId, p.courseId, p.schoolId);
        break;
      }

      default:
        break;
    }
  }

  // Only auto-enrolls when there's no enrollment record at all — a student who
  // explicitly unenrolled or completed the course keeps that status.
  private async ensureEnrolled(userId: string, containerId: string, schoolId: string): Promise<void> {
    const existing = await this.enrollmentRepo.findByUserAndContainer(userId, containerId);
    if (existing) return;

    const enrollment = Enrollment.create({ userId, containerId, schoolId }, new Date());
    await this.enrollmentRepo.save(enrollment);

    for (const event of enrollment.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    enrollment.clearDomainEvents();

    this.logger.log(`GroupEnrollmentConsumer: enrolled ${userId} → ${containerId} (school ${schoolId})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
