import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, AUTH_EVENT_TYPES } from '@ssz/contracts';
import type { UserDeletedPayload } from '@ssz/contracts';
import {
  PROCESSED_EVENTS_REPOSITORY,
  type IProcessedEventsRepository,
} from '../../../../shared/application/ports/processed-events.repository.interface.js';
import { EraseDeletedUserCommand } from '../../application/commands/erase-deleted-user/erase-deleted-user.command.js';
import type { Env } from '../../../../config/configuration.js';

const EXCHANGE = EXCHANGES.AUTH;
const QUEUE = 'organization_service.auth.user_deleted';
const ROUTING_KEY = AUTH_EVENT_TYPES.USER_DELETED;

interface Envelope {
  eventId?: string;
  payload?: Partial<UserDeletedPayload>;
}

/** VoxOrd plan 07, step 3c: a learner's account is erased in auth; it leaves every school here. */
@Injectable()
export class UserDeletedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserDeletedConsumer.name);
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
      this.logger.warn('RABBITMQ_URL not configured — UserDeletedConsumer disabled');
      return;
    }

    this.connection = amqp.connect([rabbitmqUrl]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ consumer connected (auth.user.deleted)'));
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ consumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    const channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => void this.handle(channel, msg));
        this.logger.log(`Consumer ready — queue "${QUEUE}" bound to "${EXCHANGE}/${ROUTING_KEY}"`);
      },
    });

    channelWrapper.on('error', (err: Error) =>
      this.logger.error(`RabbitMQ channel error: ${err.message}`),
    );
  }

  private async handle(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
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
      await this.commandBus.execute(new EraseDeletedUserCommand(userId, envelope.payload?.email || null));
      // Auth's `eventType` is its C# type name; the routing key is the event's name.
      await this.processedEvents.markProcessed(envelope.eventId, ROUTING_KEY);
      channel.ack(msg);
    } catch (err) {
      // One retry; the erase is idempotent and its events are announced again.
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
