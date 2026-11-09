import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { AUTH_EVENT_TYPES, EXCHANGES, type UserDeletedPayload } from '@ssz/contracts';
import type { AppConfig } from '../../../../config/configuration.js';
import { EraseDeletedUserCommand } from '../../application/commands/erase-deleted-user.command.js';

interface Envelope {
  eventId?: string;
  payload?: Partial<UserDeletedPayload>;
}

const QUEUE = 'ai-service.auth.user-deleted';
const ROUTING_KEY = AUTH_EVENT_TYPES.USER_DELETED;

/**
 * VoxOrd plan 07, step 3e: the account's 30-day grace is over and auth has erased it.
 * No processed-events table: the erase leaves nothing to redo, so a redelivery is a no-op.
 */
@Injectable()
export class UserDeletedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserDeletedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — UserDeletedConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('UserDeletedConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`UserDeletedConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.AUTH, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGES.AUTH, ROUTING_KEY);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => void this.handle(channel, msg));
        this.logger.log(`UserDeletedConsumer listening on "${QUEUE}"`);
      },
    });
  }

  private async handle(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: Envelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as Envelope;
    } catch {
      this.logger.error('Malformed message — dropped');
      channel.nack(msg, false, false);
      return;
    }
    const userId = envelope.payload?.userId;
    if (typeof userId !== 'string' || !userId) {
      channel.nack(msg, false, false);
      return;
    }

    try {
      await this.commandBus.execute(new EraseDeletedUserCommand(userId));
      channel.ack(msg);
    } catch (err) {
      // One retry; the erase is idempotent.
      this.logger.error(
        `Failed to erase user ${userId} [${envelope.eventId ?? '?'}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
