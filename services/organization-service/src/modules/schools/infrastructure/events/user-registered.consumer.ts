import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { EXCHANGES, AUTH_EVENT_TYPES } from '@ssz/contracts';
import type { UserRegisteredPayload } from '@ssz/contracts';
import {
  PROCESSED_EVENTS_REPOSITORY,
  type IProcessedEventsRepository,
} from '../../../../shared/application/ports/processed-events.repository.interface.js';
import { ProvisionSoloWorkspaceCommand } from '../../application/commands/provision-solo-workspace/provision-solo-workspace.command.js';
import type { Env } from '../../../../config/configuration.js';

const EXCHANGE = EXCHANGES.AUTH;
const QUEUE = 'organization_service.auth.user_registered';
const ROUTING_KEY = AUTH_EVENT_TYPES.USER_REGISTERED;
const TUTOR_ROLE = 'tutor';

interface UserRegisteredEnvelope {
  eventId: string;
  eventType: string;
  payload: UserRegisteredPayload;
}

/**
 * A tutor who registers gets their workspace at once (plan 59, phase 1), so that
 * assignments, review and analytics — all of which ask which workspace a learner
 * belongs to — have an answer from the first minute of the account's life.
 *
 * Tutors who registered before this existed are provisioned by the backfill script
 * (scripts/backfill-solo-workspaces.ts), not here.
 */
@Injectable()
export class UserRegisteredConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserRegisteredConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;

  constructor(
    @Inject(PROCESSED_EVENTS_REPOSITORY)
    private readonly processedEvents: IProcessedEventsRepository,
    private readonly config: ConfigService<Env>,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    const rabbitmqUrl = this.config.get('RABBITMQ_URL') as string;
    if (!rabbitmqUrl) {
      this.logger.warn('RABBITMQ_URL not configured — UserRegisteredConsumer disabled');
      return;
    }

    this.connection = amqp.connect([rabbitmqUrl]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ consumer connected (auth.user.registered)'));
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ consumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    const channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
        await channel.prefetch(1);

        await channel.consume(QUEUE, (msg) => {
          void (async () => {
            if (!msg) return;

            let envelope: UserRegisteredEnvelope;
            try {
              envelope = JSON.parse(msg.content.toString()) as UserRegisteredEnvelope;
            } catch {
              this.logger.error('Failed to parse auth.user.registered — nacking');
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

  private async handleEvent(envelope: UserRegisteredEnvelope): Promise<void> {
    const { userId, roles } = envelope.payload;
    if (!userId || !Array.isArray(roles)) return;
    if (!roles.some((r) => r.toLowerCase() === TUTOR_ROLE)) return;

    const result = await this.commandBus.execute(new ProvisionSoloWorkspaceCommand(userId));
    this.logger.log(
      `Tutor ${userId} registered — solo workspace ${result.schoolId} (${result.created ? 'created' : 'already existed'})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
