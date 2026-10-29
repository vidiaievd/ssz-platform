import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../config/configuration.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { EraseDeletedUserCommand } from '../user-erasure/application/commands/erase-deleted-user.command.js';
import type { UserDeletedPayload } from '@ssz/contracts';
import { AUTH_EVENT_TYPES, EXCHANGES } from '@ssz/contracts';

interface EventEnvelope {
  eventId?: string;
  payload?: Partial<UserDeletedPayload>;
}

/** VoxOrd plan 07, step 3d: the account's 30-day grace is over and auth has erased it. */
@Injectable()
export class UserDeletedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserDeletedConsumer.name);

  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  private readonly exchangeName = EXCHANGES.AUTH;
  private readonly queueName = 'exercise-engine.auth-user-deleted';
  private readonly routingKey = AUTH_EVENT_TYPES.USER_DELETED;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;

    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — auth.user.deleted consumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(this.exchangeName, 'topic', { durable: true });
        await channel.assertQueue(this.queueName, { durable: true });
        await channel.bindQueue(this.queueName, this.exchangeName, this.routingKey);
        await channel.prefetch(1);
        await channel.consume(this.queueName, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`Consumer ready: queue=${this.queueName}`);
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
    } catch {
      this.logger.error('auth.user.deleted is not JSON — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const eventId = envelope.eventId;
    const userId = envelope.payload?.userId;
    if (!eventId || !userId) {
      this.logger.warn(`auth.user.deleted without eventId or userId — discarding (eventId=${eventId})`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      const alreadyProcessed = await this.prisma.processedEvent.findUnique({ where: { eventId } });
      if (alreadyProcessed) {
        channel.ack(msg);
        return;
      }

      await this.commandBus.execute(new EraseDeletedUserCommand(userId));

      // Auth's `eventType` is its C# type name; the routing key is the event's name.
      await this.prisma.processedEvent.create({ data: { eventId, eventType: this.routingKey } });
      channel.ack(msg);
    } catch (err) {
      // One retry; the erase is idempotent.
      this.logger.error(`Failed to erase user ${userId} (eventId=${eventId}): ${String(err)}`);
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }
}
