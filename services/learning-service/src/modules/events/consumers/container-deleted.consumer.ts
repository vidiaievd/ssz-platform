import { Injectable, Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { ContainerDeletedPayload } from '@ssz/contracts';
import { EXCHANGES } from '@ssz/contracts';
import {
  ASSIGNMENT_REPOSITORY,
  type IAssignmentRepository,
} from '../../assignments/domain/repositories/assignment.repository.interface.js';
import {
  ENROLLMENT_REPOSITORY,
  type IEnrollmentRepository,
} from '../../enrollments/domain/repositories/enrollment.repository.interface.js';
import {
  LEARNING_EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../shared/application/ports/event-publisher.port.js';
import {
  CONTAINER_ITEM_LIST_CACHE,
  type IContainerItemListCache,
} from '../../../shared/application/ports/container-item-list-cache.port.js';

interface EventEnvelope {
  eventId: string;
  eventType: string;
  payload: unknown;
}

/**
 * content-service's container repository publishes the whole domain event as the envelope's payload,
 * so the id sits one level down (`payload.payload.containerId`); a flat payload is read too.
 */
export function readDeletedContainerId(payload: unknown): string | null {
  const outer = (payload ?? {}) as Partial<ContainerDeletedPayload> & { payload?: Partial<ContainerDeletedPayload> };
  const id = typeof outer.containerId === 'string' ? outer.containerId : outer.payload?.containerId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * A school's purge deleted the container (plan 90, Q11): that school's enrolments and assignments
 * are `school.purged`'s to close — silently, as COMPLETED. Left alone here, so the outcome never
 * depends on which of the two queues is read first; rows of other schools and of none go on as usual.
 */
export function readPurgedSchoolId(payload: unknown): string | null {
  const outer = (payload ?? {}) as Partial<ContainerDeletedPayload> & { payload?: Partial<ContainerDeletedPayload> };
  const data = outer.reason !== undefined ? outer : (outer.payload ?? {});
  return data.reason === 'school_purged' && typeof data.schoolId === 'string' && data.schoolId.length > 0
    ? data.schoolId
    : null;
}

const QUEUE = 'learning-service.container-deleted';
const ROUTING_KEY = 'content.container.deleted';
const BATCH_SIZE = 50;

@Injectable()
export class ContainerDeletedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContainerDeletedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignmentRepo: IAssignmentRepository,
    @Inject(ENROLLMENT_REPOSITORY) private readonly enrollmentRepo: IEnrollmentRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CONTAINER_ITEM_LIST_CACHE) private readonly cache: IContainerItemListCache,
  ) {}

  onModuleInit(): void {
    const rabbitmqCfg = this.config.get<AppConfig['rabbitmq']>('rabbitmq');
    const url = rabbitmqCfg?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — ContainerDeletedConsumer disabled');
      return;
    }
    const exchange = EXCHANGES.CONTENT;

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(exchange, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, exchange, ROUTING_KEY);
        await channel.prefetch(10);
        await channel.consume(QUEUE, (msg) => {
          if (msg) void this.handleMessage(channel, msg);
        });
        this.logger.log(`Consumer ready — queue "${QUEUE}" bound to "${ROUTING_KEY}"`);
      },
    });
    // Without a listener an 'error' from the channel (a setup failing while the broker
    // restarts) is an unhandled event and takes the whole process down.
    this.channelWrapper.on('error', (err: unknown) =>
      this.logger.error(`RabbitMQ channel error: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage): Promise<void> {
    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
    } catch {
      this.logger.error('Malformed message — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType, payload } = envelope;

    try {
      const existing = await this.prisma.processedEvent.findUnique({ where: { eventId } });
      if (existing) {
        this.logger.debug(`Duplicate event ${eventId} — skipping`);
        channel.ack(msg);
        return;
      }

      const containerId = readDeletedContainerId(payload);
      if (!containerId) {
        // Without an id every repository filter below would drop out and the cascade would hit every
        // container on the platform — which is what this consumer did until plan 90, phase 5, step 4b.
        this.logger.error(`${eventType} [${eventId}] carries no containerId — discarding`);
        channel.nack(msg, false, false);
        return;
      }
      const purgedSchoolId = readPurgedSchoolId(payload);
      this.logger.log(
        `Container deleted: ${containerId} — starting cascade cancel` +
          (purgedSchoolId ? ` (school ${purgedSchoolId} purged: its rows are left to school.purged)` : ''),
      );

      await this.cascadeCancelAssignments(containerId, purgedSchoolId);
      await this.cascadeUnenrollEnrollments(containerId, purgedSchoolId);
      await this.cache.invalidate(containerId);

      await this.prisma.processedEvent.create({ data: { eventId, eventType } });
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Error handling ${eventType} [${eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, false);
    }
  }

  private async cascadeCancelAssignments(containerId: string, purgedSchoolId: string | null): Promise<void> {
    const assignments = (await this.assignmentRepo.findActiveByContent('CONTAINER', containerId)).filter(
      (a) => purgedSchoolId === null || a.schoolId !== purgedSchoolId,
    );
    this.logger.log(`Cancelling ${assignments.length} active assignment(s) for container ${containerId}`);

    for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
      const batch = assignments.slice(i, i + BATCH_SIZE);
      for (const assignment of batch) {
        const result = assignment.cancel('content_deleted');
        if (result.isFail) {
          this.logger.warn(`Could not cancel assignment ${assignment.id}: ${result.error.message}`);
          continue;
        }
        try {
          await this.assignmentRepo.save(assignment);
          for (const event of assignment.getDomainEvents()) {
            await this.publisher.publish(event.eventType, (event as any).payload);
          }
          assignment.clearDomainEvents();
        } catch (err) {
          this.logger.error(
            `Failed to persist cancellation for assignment ${assignment.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  private async cascadeUnenrollEnrollments(containerId: string, purgedSchoolId: string | null): Promise<void> {
    const enrollments = (await this.enrollmentRepo.findActiveByContainerId(containerId)).filter(
      (e) => purgedSchoolId === null || e.schoolId !== purgedSchoolId,
    );
    this.logger.log(`Unenrolling ${enrollments.length} active enrollment(s) for container ${containerId}`);

    for (let i = 0; i < enrollments.length; i += BATCH_SIZE) {
      const batch = enrollments.slice(i, i + BATCH_SIZE);
      for (const enrollment of batch) {
        const result = enrollment.unenroll('content_deleted');
        if (result.isFail) {
          this.logger.warn(`Could not unenroll enrollment ${enrollment.id}: ${result.error.message}`);
          continue;
        }
        try {
          await this.enrollmentRepo.save(enrollment);
          for (const event of enrollment.getDomainEvents()) {
            await this.publisher.publish(event.eventType, (event as any).payload);
          }
          enrollment.clearDomainEvents();
        } catch (err) {
          this.logger.error(
            `Failed to persist unenrollment for enrollment ${enrollment.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
