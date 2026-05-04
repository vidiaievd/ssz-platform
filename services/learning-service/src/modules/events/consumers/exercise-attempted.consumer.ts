import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { UpsertProgressCommand } from '../../progress/application/commands/upsert-progress.command.js';
import { IntroduceCardCommand } from '../../srs/application/commands/introduce-card.command.js';
import { ReviewCardCommand } from '../../srs/application/commands/review-card.command.js';
import type { ReviewRatingValue } from '../../srs/domain/value-objects/review-rating.vo.js';
import type { ExerciseAttemptCompletedPayload } from '@ssz/contracts';

interface EventEnvelope {
  eventId: string;
  eventType: string;
  payload: unknown;
}

const QUEUE = 'learning-service.exercise-attempted';
const ROUTING_KEY = 'exercise.attempt.completed';

/**
 * Score → SRS rating mapping (MVP, for closed-form auto-scored exercises):
 *   score null or completed=false → no SRS update (free-form, awaiting human review)
 *   score < 60                   → AGAIN
 *   60 ≤ score < 80              → HARD
 *   80 ≤ score < 95              → GOOD
 *   score ≥ 95                   → EASY
 */
function scoreToRating(score: number): ReviewRatingValue {
  if (score < 60) return 'AGAIN';
  if (score < 80) return 'HARD';
  if (score < 95) return 'GOOD';
  return 'EASY';
}

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

      const p = payload as ExerciseAttemptCompletedPayload;

      // 1. Progress tracking (existing behaviour — unchanged).
      const progressResult = await this.commandBus.execute(
        new UpsertProgressCommand(
          p.userId,
          'EXERCISE',
          p.exerciseId,
          p.timeSpentSeconds ?? 0,
          p.score ?? null,
          p.completed ?? false,
        ),
      );
      if (progressResult.isFail) {
        this.logger.warn(`UpsertProgress failed for event ${eventId}: ${progressResult.error?.message}`);
      }

      // 2. SRS introduction (idempotent — all exercises are SRS-eligible by default in MVP).
      //    See docs/research/sprint-06-srs-content-flags.md for rationale.
      const introduceResult = await this.commandBus.execute(
        new IntroduceCardCommand(p.userId, 'EXERCISE', p.exerciseId),
      );

      // 3. SRS review — only for closed-form attempts that have a score.
      //    Free-form (completed=false, score=null) awaits human review; no auto-rating.
      //    We need the card's UUID (not the content ID) to call ReviewCardCommand.
      if (p.completed === true && p.score !== null && introduceResult.isOk) {
        const rating = scoreToRating(p.score);
        const cardId = introduceResult.value.id;
        const reviewResult = await this.commandBus.execute(
          new ReviewCardCommand(p.userId, cardId, rating),
        );
        if (reviewResult.isFail) {
          // Non-fatal: daily limit hit or card suspended. Log and continue.
          this.logger.debug(
            `SRS review skipped for exercise ${p.exerciseId} / user ${p.userId}: ${reviewResult.error?.message}`,
          );
        }
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
