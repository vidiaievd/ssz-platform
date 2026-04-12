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
import { CreateProfileCommand } from '../../application/commands/create-profile/create-profile.command.js';
import { CreateStudentProfileCommand } from '../../../students/application/commands/create-student-profile/create-student-profile.command.js';
import { CreateTutorProfileCommand } from '../../../tutors/application/commands/create-tutor-profile/create-tutor-profile.command.js';

// Envelope shape published by Auth Service (snake_case JSON)
interface UserRegisteredPayload {
  user_id: string;
  email: string;
  roles?: string[]; // v2 — array of lowercase role names
  role?: string;    // v1 — kept for backward compatibility
}

interface UserRegisteredEnvelope {
  event_id: string;
  event_type: string;
  routing_key: string;
  occurred_at: string;
  version: number;
  source: string;
  payload: UserRegisteredPayload;
}

const EXCHANGE = 'auth.events';
const EXCHANGE_TYPE = 'topic';
const QUEUE = 'user_profile_service_queue';
const ROUTING_KEY = 'auth.user.registered';

@Injectable()
export class UserRegisteredConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserRegisteredConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;

  constructor(
    private readonly commandBus: CommandBus,
    @Inject(PROCESSED_EVENTS_REPOSITORY)
    private readonly processedEvents: IProcessedEventsRepository,
    @Inject('RABBITMQ_URL')
    private readonly rabbitmqUrl: string,
  ) {}

  onModuleInit(): void {
    // Connect using amqp-connection-manager — reconnects automatically on failure
    this.connection = amqp.connect([this.rabbitmqUrl]);

    this.connection.on('connect', () =>
      this.logger.log('RabbitMQ consumer connected'),
    );
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(
        `RabbitMQ consumer disconnected: ${err?.message ?? 'unknown'}`,
      ),
    );

    const channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        // Declare exchange — safe to call every startup (idempotent)
        await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, {
          durable: true,
        });

        // Declare durable queue
        await channel.assertQueue(QUEUE, { durable: true });

        // Bind queue to exchange with routing key
        await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);

        // Process one message at a time
        await channel.prefetch(1);

        // Start consuming — amqplib types the callback as void, so we wrap
        // the async logic in a void IIFE to avoid the ESLint warning
        await channel.consume(QUEUE, (msg) => {
          void (async () => {
            if (!msg) return;

            let data: UserRegisteredEnvelope;
            try {
              data = JSON.parse(
                msg.content.toString(),
              ) as UserRegisteredEnvelope;
            } catch {
              this.logger.error(
                'Failed to parse message — nacking without requeue',
              );
              channel.nack(msg, false, false);
              return;
            }

            // Idempotency check
            if (await this.processedEvents.isProcessed(data.event_id)) {
              this.logger.warn(`Duplicate event ignored: ${data.event_id}`);
              channel.ack(msg);
              return;
            }

            try {
              this.logger.log(
                `Processing user.registered for userId: ${data.payload.user_id}`,
              );

              // Determine roles — support both v2 (roles array) and v1 (single role) formats
              const roles: string[] =
                data.payload.roles ??
                (data.payload.role ? [data.payload.role] : ['student']);

              const normalizedRoles = roles.map((r) => r.toLowerCase());

              // Always create the base profile — use email prefix as initial display name
              await this.commandBus.execute(
                new CreateProfileCommand(
                  data.payload.user_id,
                  data.payload.email.split('@')[0],
                ),
              );

              // Create student profile if user has the student role
              if (normalizedRoles.includes('student')) {
                await this.commandBus.execute(
                  new CreateStudentProfileCommand(data.payload.user_id, undefined),
                );
              }

              // Create tutor profile if user has the tutor role
              if (normalizedRoles.includes('tutor')) {
                await this.commandBus.execute(
                  new CreateTutorProfileCommand(data.payload.user_id, undefined, undefined),
                );
              }

              await this.processedEvents.markProcessed(
                data.event_id,
                data.event_type,
              );

              channel.ack(msg);
              this.logger.log(
                `Profiles created for userId: ${data.payload.user_id} with roles: [${normalizedRoles.join(', ')}]`,
              );
            } catch (err) {
              this.logger.error(
                `Failed to process event ${data.event_id}: ${err instanceof Error ? err.message : String(err)}`,
              );
              // Nack without requeue — prevents poison message loops
              channel.nack(msg, false, false);
            }
          })();
        });

        this.logger.log(
          `Consumer ready — listening on queue "${QUEUE}" bound to "${EXCHANGE}" / "${ROUTING_KEY}"`,
        );
      },
    });

    // Surface channel setup errors
    channelWrapper.on('error', (err: Error) =>
      this.logger.error(`RabbitMQ channel error: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
