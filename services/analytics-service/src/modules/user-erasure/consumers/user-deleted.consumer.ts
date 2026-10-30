import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { AUTH_EVENT_TYPES, EXCHANGES } from '@ssz/contracts';
import type { UserDeletedPayload } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { EraseDeletedUserCommand } from '../application/commands/erase-deleted-user.command.js';

interface EventEnvelope {
  eventId?: string;
  payload?: Partial<UserDeletedPayload>;
}

const PROCESSOR_ID = 'user-deleted';
const QUEUE = 'analytics-service.auth.user-deleted';
const ROUTING_KEY = AUTH_EVENT_TYPES.USER_DELETED;

/**
 * VoxOrd plan 07, step 3e: the account's 30-day grace is over and auth has erased it.
 *
 * Events organization publishes for the same deletion (`school.student.removed` and the
 * like) can reach the archive after this ran; they hold ids only and nothing joins them to
 * a person any more.
 */
@Injectable()
export class UserDeletedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserDeletedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
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
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`UserDeletedConsumer listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
    } catch {
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
      const alreadyProcessed = await this.prisma.processedEvent.findUnique({
        where: { eventId_processorId: { eventId, processorId: PROCESSOR_ID } },
      });
      if (alreadyProcessed) {
        channel.ack(msg);
        return;
      }

      await this.commandBus.execute(new EraseDeletedUserCommand(userId));

      // Auth's `eventType` is its C# type name; the routing key is the event's name.
      await this.prisma.processedEvent.create({
        data: { eventId, processorId: PROCESSOR_ID, eventType: ROUTING_KEY },
      });
      channel.ack(msg);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      // One retry; the erase is idempotent.
      this.logger.error(
        `UserDeletedConsumer: failed to erase ${userId} [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
