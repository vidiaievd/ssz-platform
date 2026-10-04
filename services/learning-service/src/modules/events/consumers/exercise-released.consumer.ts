import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { ExerciseReleasedPayload } from '@ssz/contracts';
import { CONTENT_EVENT_TYPES, EXCHANGES } from '@ssz/contracts';
import { PruneGapCardsCommand } from '../../srs/application/commands/prune-gap-cards.command.js';

interface EventEnvelope {
  eventId: string;
  eventType: string;
  payload: unknown;
}

const QUEUE = 'learning-service.exercise-released';
const ROUTING_KEY = CONTENT_EVENT_TYPES.EXERCISE_RELEASED;

/**
 * An exercise's edit reached students; its gap cards follow the pieces it still has
 * (plan 68, SPEC_data_model §5: «review-queue rows … are closed, not orphaned»).
 *
 * `itemKeys: null` is a template that keeps nothing per piece — nothing to prune, and
 * reading it as an empty list would delete cards the event says nothing about.
 */
@Injectable()
export class ExerciseReleasedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExerciseReleasedConsumer.name);
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
      this.logger.warn('RABBITMQ_URL not configured — ExerciseReleasedConsumer disabled');
      return;
    }
    const exchange = EXCHANGES.CONTENT;

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
        await channel.prefetch(10);
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

    const { eventId, eventType, payload } = envelope;

    try {
      const existing = await this.prisma.processedEvent.findUnique({ where: { eventId } });
      if (existing) {
        this.logger.debug(`Duplicate event ${eventId} — skipping`);
        channel.ack(msg);
        return;
      }

      const p = payload as ExerciseReleasedPayload;
      if (Array.isArray(p.itemKeys)) {
        await this.commandBus.execute(new PruneGapCardsCommand(p.exerciseId, p.itemKeys));
      }

      await this.prisma.processedEvent.create({ data: { eventId, eventType } });
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Error handling ${eventType} [${eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, false);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
