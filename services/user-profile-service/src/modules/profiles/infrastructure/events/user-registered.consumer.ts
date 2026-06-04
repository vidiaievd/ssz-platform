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
import { EXCHANGES } from '@ssz/contracts';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

// Envelope shape published by Auth Service (camelCase JSON via JsonNamingPolicy.CamelCase)
interface UserRegisteredPayload {
  userId: string;
  email: string;
  roles?: string[]; // v2 — array of lowercase role names
  role?: string; // v1 — kept for backward compatibility
}

interface UserRegisteredEnvelope {
  eventId: string;
  eventType: string;
  routingKey: string;
  occurredAt: string;
  version: number;
  source: string;
  payload: UserRegisteredPayload;
}

const EXCHANGE = EXCHANGES.AUTH;
const EXCHANGE_TYPE = 'topic';
const QUEUE = 'user_profile_service_queue';
const ROUTING_KEY = 'auth.user.registered';

@Injectable()
export class UserRegisteredConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserRegisteredConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;

  constructor(
    private readonly commandBus: CommandBus,
    private readonly prisma: PrismaService,
    @Inject(PROCESSED_EVENTS_REPOSITORY)
    private readonly processedEvents: IProcessedEventsRepository,
    @Inject('RABBITMQ_URL')
    private readonly rabbitmqUrl: string,
  ) {}

  onModuleInit(): void {
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
        await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, {
          durable: true,
        });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
        await channel.prefetch(1);

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

            if (await this.processedEvents.isProcessed(data.eventId)) {
              this.logger.warn(`Duplicate event ignored: ${data.eventId}`);
              channel.ack(msg);
              return;
            }

            try {
              this.logger.log(
                `Processing user.registered for userId: ${data.payload.userId}`,
              );

              await this.commandBus.execute(
                new CreateProfileCommand(
                  data.payload.userId,
                  data.payload.email.split('@')[0],
                ),
              );

              // Upsert email index for lookup endpoint
              const roles = data.payload.roles ?? (data.payload.role ? [data.payload.role] : []);
              await (this.prisma as any).userEmailIndex.upsert({
                where: { userId: data.payload.userId },
                create: { userId: data.payload.userId, email: data.payload.email, roles },
                update: { email: data.payload.email, roles },
              });

              await this.processedEvents.markProcessed(
                data.eventId,
                data.eventType,
              );
              channel.ack(msg);

              this.logger.log(
                `Base profile created for userId: ${data.payload.userId}`,
              );
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
      this.logger.error(`RabbitMQ channel error: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
