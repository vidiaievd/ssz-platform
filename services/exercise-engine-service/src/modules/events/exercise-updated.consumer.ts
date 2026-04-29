import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../config/configuration.js';
import { ExerciseDefinitionCache } from '../../infrastructure/cache/exercise-definition-cache.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { ExerciseUpdatedPayload } from '@ssz/contracts';

interface EventEnvelope<T> {
  eventId: string;
  eventType: string;
  payload: T;
}

@Injectable()
export class ExerciseUpdatedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExerciseUpdatedConsumer.name);

  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  private readonly exchangeName: string;
  private readonly queueName = 'exercise-engine.content-exercise-updated';
  private readonly routingKey = 'content.exercise.updated';

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly cache: ExerciseDefinitionCache,
    private readonly prisma: PrismaService,
  ) {
    const rabbitmqConfig = this.config.get<AppConfig['rabbitmq']>('rabbitmq');
    this.exchangeName = rabbitmqConfig?.exchange ?? 'ssz.events';
  }

  onModuleInit(): void {
    const rabbitmqConfig = this.config.get<AppConfig['rabbitmq']>('rabbitmq');
    const url = rabbitmqConfig?.url;

    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — content.exercise.updated consumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(this.exchangeName, 'topic', { durable: true });
        await channel.assertQueue(this.queueName, { durable: true });
        await channel.bindQueue(this.queueName, this.exchangeName, this.routingKey);
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

    let eventId: string | undefined;
    let exerciseId: string | undefined;

    try {
      const envelope = JSON.parse(msg.content.toString()) as EventEnvelope<ExerciseUpdatedPayload>;
      eventId = envelope.eventId;
      exerciseId = envelope.payload?.exerciseId;

      if (!exerciseId) {
        this.logger.warn(`content.exercise.updated event missing exerciseId — discarding (eventId=${eventId})`);
        channel.ack(msg);
        return;
      }

      // Idempotency check
      const alreadyProcessed = await this.prisma.processedEvent.findUnique({
        where: { eventId: eventId! },
      });
      if (alreadyProcessed) {
        this.logger.debug(`content.exercise.updated already processed: eventId=${eventId}`);
        channel.ack(msg);
        return;
      }

      // Invalidate all language variants in Redis cache for this exercise
      await this.cache.invalidate(exerciseId);
      this.logger.log(`Cache invalidated for exercise ${exerciseId} (eventId=${eventId})`);

      // Mark event as processed
      await this.prisma.processedEvent.create({
        data: {
          eventId: eventId!,
          eventType: 'content.exercise.updated',
        },
      });

      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Failed to process content.exercise.updated (eventId=${eventId}, exerciseId=${exerciseId}): ${String(err)}`,
      );
      channel.nack(msg, false, false); // dead-letter, no requeue
    }
  }
}
