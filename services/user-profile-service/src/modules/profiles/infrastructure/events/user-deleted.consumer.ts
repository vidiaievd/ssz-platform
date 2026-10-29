import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { AUTH_EVENT_TYPES, EXCHANGES } from '@ssz/contracts';
import type { UserDeletedPayload } from '@ssz/contracts';
import type { IProcessedEventsRepository } from '../../../../shared/application/ports/processed-events.repository.interface.js';
import { PROCESSED_EVENTS_REPOSITORY } from '../../../../shared/application/ports/processed-events.repository.interface.js';
import { EraseUserDataCommand } from '../../application/commands/erase-user-data/erase-user-data.command.js';

const EXCHANGE = EXCHANGES.AUTH;
const QUEUE = 'user_profile_service.auth.user_deleted';
const ROUTING_KEY = AUTH_EVENT_TYPES.USER_DELETED;

interface Envelope {
  eventId?: string;
  payload?: Partial<UserDeletedPayload>;
}

/**
 * VoxOrd plan 07, step 3c: the account's 30-day grace is over and auth has erased it.
 * A queue of its own, so a backlog of registrations never holds a deletion up.
 */
@Injectable()
export class UserDeletedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserDeletedConsumer.name);
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
      this.logger.log('RabbitMQ consumer connected (auth.user.deleted)'),
    );
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(
        `RabbitMQ consumer disconnected: ${err?.message ?? 'unknown'}`,
      ),
    );

    const channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => void this.handle(channel, msg));
        this.logger.log(
          `Consumer ready — queue "${QUEUE}" bound to "${EXCHANGE}/${ROUTING_KEY}"`,
        );
      },
    });

    channelWrapper.on('error', (err: Error) =>
      this.logger.error(`RabbitMQ channel error: ${err.message}`),
    );
  }

  private async handle(
    channel: ConfirmChannel,
    msg: ConsumeMessage | null,
  ): Promise<void> {
    if (!msg) return;

    let envelope: Envelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as Envelope;
    } catch {
      this.logger.error('Failed to parse auth.user.deleted — dropped');
      channel.nack(msg, false, false);
      return;
    }
    const userId = envelope.payload?.userId;
    if (!envelope.eventId || !userId) {
      channel.nack(msg, false, false);
      return;
    }

    try {
      if (await this.processedEvents.isProcessed(envelope.eventId)) {
        channel.ack(msg);
        return;
      }
      await this.commandBus.execute(new EraseUserDataCommand(userId));
      // Auth's `eventType` is its C# type name; the routing key is the event's name.
      await this.processedEvents.markProcessed(envelope.eventId, ROUTING_KEY);
      channel.ack(msg);
    } catch (err) {
      // One retry. The erase is idempotent, so a redelivery after a partial failure is safe.
      this.logger.error(
        `Failed to erase user ${userId} [${envelope.eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
