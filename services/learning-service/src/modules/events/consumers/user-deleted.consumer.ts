import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { UserDeletedPayload } from '@ssz/contracts';
import { AUTH_EVENT_TYPES, EXCHANGES } from '@ssz/contracts';
import { EraseDeletedUserCommand } from '../../user-erasure/application/commands/erase-deleted-user.command.js';

interface EventEnvelope {
  eventId?: string;
  payload?: Partial<UserDeletedPayload>;
}

const QUEUE = 'learning-service.auth.user-deleted';
const ROUTING_KEY = AUTH_EVENT_TYPES.USER_DELETED;

/**
 * VoxOrd plan 07, step 3d: the account's 30-day grace is over and auth has erased it.
 * A queue of its own, so a backlog of attempts never holds a deletion up.
 */
@Injectable()
export class UserDeletedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserDeletedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — UserDeletedConsumer disabled');
      return;
    }
    const exchange = EXCHANGES.AUTH;

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
        await channel.prefetch(1);
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

    const eventId = envelope.eventId;
    const userId = envelope.payload?.userId;
    if (!eventId || !userId) {
      channel.nack(msg, false, false);
      return;
    }

    try {
      const existing = await this.prisma.processedEvent.findUnique({ where: { eventId } });
      if (existing) {
        channel.ack(msg);
        return;
      }

      await this.commandBus.execute(new EraseDeletedUserCommand(userId));

      // Auth's `eventType` is its C# type name; the routing key is the event's name.
      await this.prisma.processedEvent.create({ data: { eventId, eventType: ROUTING_KEY } });
      channel.ack(msg);
    } catch (err) {
      // One retry; the erase is idempotent.
      this.logger.error(
        `Failed to erase user ${userId} [${eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
