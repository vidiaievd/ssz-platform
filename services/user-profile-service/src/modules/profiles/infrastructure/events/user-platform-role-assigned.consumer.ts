import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import type { IProcessedEventsRepository } from '../../../../shared/application/ports/processed-events.repository.interface.js';
import { PROCESSED_EVENTS_REPOSITORY } from '../../../../shared/application/ports/processed-events.repository.interface.js';
import { CreateTutorProfileCommand } from '../../../tutors/application/commands/create-tutor-profile/create-tutor-profile.command.js';
import { TutorProfileAlreadyExistsException } from '../../../tutors/domain/exceptions/tutor-profile-already-exists.exception.js';

interface UserPlatformRoleAssignedPayload {
  userId: string;
  platformRole: string; // e.g. "Tutor"
}

interface UserPlatformRoleAssignedEnvelope {
  eventId: string;
  eventType: string;
  timestamp: string;
  version: number;
  source: string;
  payload: UserPlatformRoleAssignedPayload;
}

const EXCHANGE = 'organization.events';
const EXCHANGE_TYPE = 'topic';
const QUEUE = 'user_profile_service_platform_role_queue';
const ROUTING_KEY = 'user.platform.role.assigned';

@Injectable()
export class UserPlatformRoleAssignedConsumer
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(UserPlatformRoleAssignedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;

  constructor(
    private readonly commandBus: CommandBus,
    @Inject(PROCESSED_EVENTS_REPOSITORY)
    private readonly processedEvents: IProcessedEventsRepository,
    @Inject('RABBITMQ_URL')
    private readonly rabbitmqUrl: string,
  ) {}

  onModuleInit(): void {
    this.connection = amqp.connect([this.rabbitmqUrl]);

    this.connection.on('connect', () =>
      this.logger.log('RabbitMQ platform-role consumer connected'),
    );
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(
        `RabbitMQ platform-role consumer disconnected: ${err?.message ?? 'unknown'}`,
      ),
    );

    const channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, {
          durable: true,
        });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
        await channel.prefetch(1);

        await channel.consume(QUEUE, (msg) => {
          void (async () => {
            if (!msg) return;

            let data: UserPlatformRoleAssignedEnvelope;
            try {
              data = JSON.parse(
                msg.content.toString(),
              ) as UserPlatformRoleAssignedEnvelope;
            } catch {
              this.logger.error(
                'Failed to parse message — nacking without requeue',
              );
              channel.nack(msg, false, false);
              return;
            }

            if (await this.processedEvents.isProcessed(data.eventId)) {
              this.logger.warn(`Duplicate event ignored: ${data.eventId}`);
              channel.ack(msg);
              return;
            }

            try {
              const { userId, platformRole } = data.payload;
              this.logger.log(
                `Processing user.platform.role.assigned: userId=${userId}, role=${platformRole}`,
              );

              if (platformRole === 'Tutor') {
                try {
                  await this.commandBus.execute(
                    new CreateTutorProfileCommand(userId, undefined, undefined),
                  );
                  this.logger.log(`TutorProfile created for userId: ${userId}`);
                } catch (err) {
                  // Idempotent — if TutorProfile already exists, treat as success
                  if (err instanceof TutorProfileAlreadyExistsException) {
                    this.logger.log(
                      `TutorProfile already exists for userId: ${userId} — skipping`,
                    );
                  } else {
                    throw err;
                  }
                }
              }

              await this.processedEvents.markProcessed(
                data.eventId,
                data.eventType,
              );
              channel.ack(msg);
            } catch (err) {
              this.logger.error(
                `Failed to process event ${data.eventId}: ${err instanceof Error ? err.message : String(err)}`,
              );
              channel.nack(msg, false, false);
            }
          })();
        });

        this.logger.log(
          `Consumer ready — listening on queue "${QUEUE}" bound to "${EXCHANGE}" / "${ROUTING_KEY}"`,
        );
      },
    });

    channelWrapper.on('error', (err: Error) =>
      this.logger.error(`RabbitMQ platform-role channel error: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
