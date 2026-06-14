import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { randomUUID } from 'crypto';
import { EXCHANGES } from '@ssz/contracts';
import {
  PROCESSED_EVENTS_REPOSITORY,
  type IProcessedEventsRepository,
} from '../../../../shared/application/ports/processed-events.repository.interface.js';
import { OutboxEventPublisherService } from '../../../../infrastructure/messaging/outbox-event-publisher.service.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { Env } from '../../../../config/configuration.js';
import { TeacherProfileChangedEvent } from '../../domain/events/teacher-profile-changed.event.js';

const SENSITIVE_FIELDS = new Set(['displayName', 'firstName', 'lastName', 'contactEmail', 'contactPhone']);

const EXCHANGE = EXCHANGES.PROFILE;
const EXCHANGE_TYPE = 'topic';
const QUEUE = 'organization_service.profile.updated';
const ROUTING_KEY = 'profile.updated';

interface ProfileUpdatedPayload {
  userId: string;
  changedFields?: string[];
}

interface ProfileUpdatedEnvelope {
  eventId: string;
  eventType: string;
  payload: ProfileUpdatedPayload;
}

@Injectable()
export class ProfileUpdatedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfileUpdatedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;

  constructor(
    @Inject(PROCESSED_EVENTS_REPOSITORY)
    private readonly processedEvents: IProcessedEventsRepository,
    private readonly config: ConfigService<Env>,
    private readonly eventPublisher: OutboxEventPublisherService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const rabbitmqUrl = this.config.get('RABBITMQ_URL') as string;
    this.connection = amqp.connect([rabbitmqUrl]);

    this.connection.on('connect', () => this.logger.log('RabbitMQ consumer connected (profile.updated)'));
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ consumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    const channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
        await channel.prefetch(1);

        await channel.consume(QUEUE, (msg) => {
          void (async () => {
            if (!msg) return;

            let envelope: ProfileUpdatedEnvelope;
            try {
              envelope = JSON.parse(msg.content.toString()) as ProfileUpdatedEnvelope;
            } catch {
              this.logger.error('Failed to parse profile.updated — nacking');
              channel.nack(msg, false, false);
              return;
            }

            if (await this.processedEvents.isProcessed(envelope.eventId)) {
              this.logger.warn(`Duplicate event ignored: ${envelope.eventId}`);
              channel.ack(msg);
              return;
            }

            try {
              await this.handleEvent(envelope);
              await this.processedEvents.markProcessed(envelope.eventId, envelope.eventType);
              channel.ack(msg);
            } catch (err) {
              this.logger.error(
                `Failed to process event ${envelope.eventId}: ${err instanceof Error ? err.message : String(err)}`,
              );
              channel.nack(msg, false, false);
            }
          })();
        });

        this.logger.log(`Consumer ready — queue "${QUEUE}" bound to "${EXCHANGE}/${ROUTING_KEY}"`);
      },
    });

    channelWrapper.on('error', (err: Error) =>
      this.logger.error(`RabbitMQ channel error: ${err.message}`),
    );
  }

  private async handleEvent(envelope: ProfileUpdatedEnvelope): Promise<void> {
    const { userId, changedFields = [] } = envelope.payload;

    const sensitiveDiff = changedFields.filter((f) => SENSITIVE_FIELDS.has(f));
    if (sensitiveDiff.length === 0) return;

    // Find schools where userId is an active TEACHER member.
    const teacherMemberships = await (this.prisma as any).schoolMember.findMany({
      where: { userId, role: 'TEACHER' },
      select: { schoolId: true },
    });

    if (teacherMemberships.length === 0) return;

    const occurredAt = new Date().toISOString();

    for (const { schoolId } of teacherMemberships) {
      // Resolve OWNER + ADMIN recipients for this school.
      const adminMembers = await (this.prisma as any).schoolMember.findMany({
        where: { schoolId, role: { in: ['OWNER', 'ADMIN'] } },
        select: { userId: true },
      });

      for (const admin of adminMembers) {
        await this.eventPublisher.publish(
          new TeacherProfileChangedEvent(
            randomUUID(),
            schoolId,
            admin.userId,
            userId,
            sensitiveDiff,
          ),
        );
      }
    }

    this.logger.log(`Fan-out teacher profile change for userId ${userId}: [${sensitiveDiff.join(', ')}]`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
