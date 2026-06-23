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
const ROUTING_KEYS = ['profile.updated', 'profile.created'];

interface ProfileEventPayload {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  changedFields?: string[];
}

interface ProfileEventEnvelope {
  eventId: string;
  eventType: string;
  payload: ProfileEventPayload;
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
        for (const routingKey of ROUTING_KEYS) {
          await channel.bindQueue(QUEUE, EXCHANGE, routingKey);
        }
        await channel.prefetch(1);

        await channel.consume(QUEUE, (msg) => {
          void (async () => {
            if (!msg) return;

            let envelope: ProfileEventEnvelope;
            try {
              envelope = JSON.parse(msg.content.toString()) as ProfileEventEnvelope;
            } catch {
              this.logger.error('Failed to parse profile event — nacking');
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

        this.logger.log(`Consumer ready — queue "${QUEUE}" bound to "${EXCHANGE}/[${ROUTING_KEYS.join(', ')}]"`);
      },
    });

    channelWrapper.on('error', (err: Error) =>
      this.logger.error(`RabbitMQ channel error: ${err.message}`),
    );
  }

  private async handleEvent(envelope: ProfileEventEnvelope): Promise<void> {
    const { userId, displayName, avatarUrl, changedFields = [] } = envelope.payload;

    // Keep the roster's denormalized name/avatar in sync — this is what list/roster
    // reads use instead of calling profile-service live (see list-school-members.handler.ts).
    const isCreated = envelope.eventType === 'profile.created';
    const touchesDenormalizedFields =
      isCreated || changedFields.includes('displayName') || changedFields.includes('avatarUrl');
    if (touchesDenormalizedFields && displayName !== undefined) {
      await (this.prisma as any).schoolMember.updateMany({
        where: { userId },
        data: { name: displayName, avatarUrl: avatarUrl ?? null },
      });
    }

    if (isCreated) return;

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
