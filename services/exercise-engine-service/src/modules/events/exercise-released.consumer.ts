import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../config/configuration.js';
import { ExerciseDefinitionCache } from '../../infrastructure/cache/exercise-definition-cache.js';
import { CONTENT_EVENT_TYPES, EXCHANGES } from '@ssz/contracts';
import type { ExerciseReleasedPayload } from '@ssz/contracts';

interface EventEnvelope {
  eventId?: string;
  payload?: Partial<ExerciseReleasedPayload> & { payload?: Partial<ExerciseReleasedPayload> };
}

/**
 * Drops the cached definition of an exercise whose draft a publish just released.
 *
 * The definition cache holds the answer key next to the document. Without this, the
 * runner (which reads content directly) shows the released document at once while every
 * grading path here keeps checking against the old key until the TTL runs out — and the
 * wrong verdict is stored on the attempt and rated into SRS.
 *
 * No `processed_events` row: dropping a cache entry twice is harmless, and a row per
 * exercise per publish would only pile up. A failure (Redis) is retried once, then dropped
 * — the TTL is the backstop.
 */
@Injectable()
export class ExerciseReleasedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExerciseReleasedConsumer.name);

  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  private readonly queueName = 'exercise-engine.content-exercise-released';
  private readonly routingKey = CONTENT_EVENT_TYPES.EXERCISE_RELEASED;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly cache: ExerciseDefinitionCache,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn(`RABBITMQ_URL not configured — ${this.routingKey} consumer disabled`);
      return;
    }

    this.connection = amqp.connect([url]);
    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.CONTENT, 'topic', { durable: true });
        await channel.assertQueue(this.queueName, { durable: true });
        await channel.bindQueue(this.queueName, EXCHANGES.CONTENT, this.routingKey);
        await channel.prefetch(1);
        await channel.consume(this.queueName, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`Consumer ready: queue=${this.queueName}`);
      },
    });
    // Without a listener an 'error' from the channel is an unhandled event and takes the
    // whole process down.
    this.channelWrapper.on('error', (err: unknown) =>
      this.logger.error(`RabbitMQ channel error: ${err instanceof Error ? err.message : String(err)}`),
    );
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
      this.logger.error(`Malformed ${this.routingKey} message — discarding`);
      channel.nack(msg, false, false);
      return;
    }

    // Flat since content 05133a2e; the nested form (`payload.payload`) is what content
    // published before it, and may still sit in a queue or an outbox replay.
    const exerciseId = envelope.payload?.exerciseId ?? envelope.payload?.payload?.exerciseId;
    if (!exerciseId) {
      this.logger.warn(`${this.routingKey} without exerciseId — discarding (eventId=${envelope.eventId})`);
      channel.ack(msg);
      return;
    }

    try {
      await this.cache.invalidate(exerciseId);
      this.logger.log(`Cache invalidated for released exercise ${exerciseId} (eventId=${envelope.eventId})`);
      channel.ack(msg);
    } catch (err) {
      const retry = !msg.fields.redelivered;
      this.logger.error(
        `Failed to invalidate cache for released exercise ${exerciseId} (eventId=${envelope.eventId}, ` +
          `${retry ? 'requeued once' : 'dropped, TTL applies'}): ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, retry);
    }
  }
}
