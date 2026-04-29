import { Injectable, Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { ContainerDeletedPayload } from '@ssz/contracts';
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
    const exchange = rabbitmqCfg?.exchange ?? 'ssz.events';

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

      const p = payload as ContainerDeletedPayload;
      this.logger.log(`Container deleted: ${p.containerId} — starting cascade cancel`);

      await this.cascadeCancelAssignments(p.containerId);
      await this.cascadeUnenrollEnrollments(p.containerId);
      await this.cache.invalidate(p.containerId);

      await this.prisma.processedEvent.create({ data: { eventId, eventType } });
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Error handling ${eventType} [${eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, false);
    }
  }

  private async cascadeCancelAssignments(containerId: string): Promise<void> {
    const assignments = await this.assignmentRepo.findActiveByContent('CONTAINER', containerId);
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

  private async cascadeUnenrollEnrollments(containerId: string): Promise<void> {
    const enrollments = await this.enrollmentRepo.findActiveByContainerId(containerId);
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
