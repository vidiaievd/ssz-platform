import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { UpsertProgressCommand } from '../../progress/application/commands/upsert-progress.command.js';

interface EventEnvelope {
  eventId: string;
  eventType: string;
  payload: unknown;
}

interface ExerciseAttemptedPayload {
  userId: string;
  exerciseId: string;
  score: number | null;
  timeSpentSeconds: number;
  completed: boolean;
}

const QUEUE = 'learning-service.exercise-attempted';
const ROUTING_KEY = 'exercise.attempt.completed';

@Injectable()
export class ExerciseAttemptedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExerciseAttemptedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly commandBus: CommandBus,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  onModuleInit(): void {
    const rabbitmqCfg = this.config.get<AppConfig['rabbitmq']>('rabbitmq');
    const url = rabbitmqCfg?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — ExerciseAttemptedConsumer disabled');
      return;
    }
    const exchange = rabbitmqCfg?.exchange ?? 'ssz.events';

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

      const p = payload as ExerciseAttemptedPayload;
      const result = await this.commandBus.execute(
        new UpsertProgressCommand(
          p.userId,
          'EXERCISE',
          p.exerciseId,
          p.timeSpentSeconds ?? 0,
          p.score ?? null,
          p.completed ?? false,
        ),
      );

      if (result.isFail) {
        this.logger.warn(`UpsertProgress failed for event ${eventId}: ${result.error?.message}`);
      }

      await this.prisma.processedEvent.create({ data: { eventId, eventType } });
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Error handling ${eventType} [${eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      // nack without requeue — goes to DLQ if configured, otherwise discarded
      channel.nack(msg, false, false);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
