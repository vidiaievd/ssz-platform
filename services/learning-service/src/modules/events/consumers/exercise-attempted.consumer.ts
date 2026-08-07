import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
import { CanDoEvaluatorService } from '../../can-do/application/services/can-do-evaluator.service.js';
import type { ReviewCardDto } from '../../srs/application/dto/srs.dto.js';
import {
  LEARNING_EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../shared/application/ports/event-publisher.port.js';
import type { AttemptRatedPayload, ExerciseAttemptCompletedPayload } from '@ssz/contracts';
import { EXCHANGES, LEARNING_EVENT_TYPES } from '@ssz/contracts';

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How long the card sat before this review, in whole-ish days.
 *
 * Read off the card as it was *before* the review — the introduce step returns the
 * card untouched, so `lastReviewedAt` here is still the previous review, not this
 * one. Null on the first review, where there is no previous one to measure from.
 */
function daysSince(lastReviewedAt: string | null | undefined, now: Date): number | null {
  if (!lastReviewedAt) return null;
  const elapsed = now.getTime() - new Date(lastReviewedAt).getTime();
  return elapsed > 0 ? elapsed / MS_PER_DAY : 0;
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
    private readonly canDoEvaluator: CanDoEvaluatorService,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  onModuleInit(): void {
    const rabbitmqCfg = this.config.get<AppConfig['rabbitmq']>('rabbitmq');
    const url = rabbitmqCfg?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — ExerciseAttemptedConsumer disabled');
      return;
    }
    const exchange = EXCHANGES.EXERCISE_ENGINE;

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
        const card = introduceResult.value as ReviewCardDto;
        const cardId = card.id;
        const reviewResult = await this.commandBus.execute(
          new ReviewCardCommand(p.userId, cardId, rating),
        );
        if (reviewResult.isFail) {
          // Non-fatal: daily limit hit or card suspended. Log and continue.
          this.logger.debug(
            `SRS review skipped for exercise ${p.exerciseId} / user ${p.userId}: ${reviewResult.error?.message}`,
          );
        } else {
          // 3a. Calibration record (plan 36 §A.1) — the attempt as it reached FSRS.
          //     Published only when a rating was actually applied: a review refused
          //     by the daily limit changed no schedule, and recording it as though
          //     it had would poison the baseline the evidence scale is judged against.
          await this.publishRatingRecord(p, rating, card);
        }

        // 4. Fan-out (plan 21 §3) — rate the VOCABULARY_WORD atoms this exercise
        // practices, snapshotted by Exercise Engine at attempt start. Grammar rule
        // atoms are skipped: their mastery is derived from pool-exercise
        // retrievability (plan 21 §2), not tracked as a separate SRS card.
        const vocabAtomIds = (p.practicedAtoms ?? [])
          .filter((atom) => atom.atomType === 'vocabulary_item')
          .map((atom) => atom.atomId);

        for (const vocabularyItemId of vocabAtomIds) {
          const atomIntroduceResult = await this.commandBus.execute(
            new IntroduceCardCommand(p.userId, 'VOCABULARY_WORD', vocabularyItemId),
          );
          if (atomIntroduceResult.isFail) {
            this.logger.debug(
              `SRS fan-out introduce skipped for vocab ${vocabularyItemId} / user ${p.userId}: ${atomIntroduceResult.error?.message}`,
            );
            continue;
          }

          const atomReviewResult = await this.commandBus.execute(
            new ReviewCardCommand(p.userId, atomIntroduceResult.value.id, rating),
          );
          if (atomReviewResult.isFail) {
            this.logger.debug(
              `SRS fan-out review skipped for vocab ${vocabularyItemId} / user ${p.userId}: ${atomReviewResult.error?.message}`,
            );
          }
        }
      }

      // 5. Can-do progress evaluation — recompute descriptor achievement
      //    for any modules whose atoms were practiced.
      if (p.completed === true && p.practicedAtoms && p.practicedAtoms.length > 0) {
        await this.canDoEvaluator.evaluateForAtoms(p.userId, p.practicedAtoms);
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

  /**
   * Record what this attempt was and what it did to the schedule (plan 36 §A.1).
   *
   * Fails soft: telemetry must not nack an attempt whose progress and SRS updates
   * have already been written. A lost row costs a sample; a nack costs a redelivery
   * that the idempotency key will then skip, dropping the SRS update instead.
   */
  private async publishRatingRecord(
    p: ExerciseAttemptCompletedPayload,
    ratingApplied: ReviewRatingValue,
    cardBeforeReview: ReviewCardDto,
  ): Promise<void> {
    const payload: AttemptRatedPayload = {
      userId: p.userId,
      exerciseId: p.exerciseId,
      templateCode: p.templateCode ?? null,
      answerForm: p.answerForm ?? null,
      score: p.score as number,
      passed: p.passed ?? null,
      attemptOrdinal: (cardBeforeReview.reps ?? 0) + 1,
      daysSinceLastReview: daysSince(cardBeforeReview.lastReviewedAt, new Date()),
      // Both null until cards are per-gap (§C.1): one card stands for the whole
      // exercise today, so there is no position within a block to report.
      gapPosition: null,
      gapCount: null,
      ratingApplied,
    };

    try {
      await this.publisher.publish(LEARNING_EVENT_TYPES.ATTEMPT_RATED, payload);
    } catch (err) {
      this.logger.warn(
        `Failed to publish ${LEARNING_EVENT_TYPES.ATTEMPT_RATED} for exercise ${p.exerciseId} / user ${p.userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
