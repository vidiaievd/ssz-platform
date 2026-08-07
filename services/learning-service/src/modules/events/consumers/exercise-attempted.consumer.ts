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
import { clampByEvidence, evidenceStrength } from '../../srs/domain/evidence-strength.js';
import { gapCardContentId } from '../../srs/domain/gap-card-id.js';
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
 *
 * How well it went, and nothing about how it was answered — that is the ceiling's
 * job, applied on top (plan 36 §B.2).
 */
function scoreToRating(score: number): ReviewRatingValue {
  if (score < 60) return 'AGAIN';
  if (score < 80) return 'HARD';
  if (score < 95) return 'GOOD';
  return 'EASY';
}

/**
 * The rating this attempt has earned, once the form of the answer is taken into
 * account (plan 36 §B.2).
 *
 * Scoring 100 by picking a word out of five given ones used to stretch the interval
 * exactly as far as scoring 100 by typing it from memory. It no longer does.
 *
 * Backward compatibility is the point of the fallbacks in `evidenceStrength`, not of
 * anything here: an event carrying neither an answer form nor a template code — every
 * one already in the queue — comes back unclamped and rates exactly as it did before.
 * No existing card is migrated; the scale reaches new attempts only.
 */
function ratingForAttempt(
  p: ExerciseAttemptCompletedPayload,
  score: number,
  /** Where in its block the gap sat, so a spent bank can decay across it (§B.3). */
  gapPosition: number | null = null,
): ReviewRatingValue {
  return clampByEvidence(
    scoreToRating(score),
    evidenceStrength({
      answerForm: p.answerForm,
      templateCode: p.templateCode,
      gapPosition,
    }),
  );
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

      // 2 & 3. SRS. An attempt is rated only when it is closed-form and scored —
      //    free-form (completed=false, score=null) awaits human review.
      //
      //    Which cards get rated depends on how the attempt was graded. A gap-graded
      //    template holds a card per gap (plan 36 §C.1) and no card for the exercise
      //    as a whole; everything else keeps the single exercise card it has always
      //    had. All exercises are SRS-eligible by default in MVP — see
      //    docs/research/sprint-06-srs-content-flags.md.
      const gapResults = p.gapResults ?? [];
      const rated = p.completed === true && p.score !== null;

      if (gapResults.length > 0) {
        if (rated) await this.reviewGapCards(p, gapResults);
      } else {
        const introduceResult = await this.commandBus.execute(
          new IntroduceCardCommand(p.userId, 'EXERCISE', p.exerciseId),
        );
        if (rated && introduceResult.isOk) {
          await this.reviewExerciseCard(p, introduceResult.value as ReviewCardDto);
        }
      }

      if (rated) {
        const rating = ratingForAttempt(p, p.score as number);

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
   * The one card standing for the whole exercise — how every template that is not
   * graded gap by gap has always been scheduled.
   */
  private async reviewExerciseCard(
    p: ExerciseAttemptCompletedPayload,
    card: ReviewCardDto,
  ): Promise<void> {
    const rating = ratingForAttempt(p, p.score as number);
    const reviewResult = await this.commandBus.execute(
      new ReviewCardCommand(p.userId, card.id, rating),
    );
    if (reviewResult.isFail) {
      // Non-fatal: daily limit hit or card suspended. Log and continue.
      this.logger.debug(
        `SRS review skipped for exercise ${p.exerciseId} / user ${p.userId}: ${reviewResult.error?.message}`,
      );
      return;
    }
    // Calibration record (plan 36 §A.1) — the attempt as it reached FSRS. Written
    // only when a rating was actually applied: a review refused by the daily limit
    // changed no schedule, and recording it as though it had would poison the
    // baseline the evidence scale is judged against.
    await this.publishRatingRecord(p, rating, card, null, null);
  }

  /**
   * One card per gap (plan 36 §C.1).
   *
   * Each gap is rated on its own verdict rather than on the exercise's score, which
   * is the point: a block of six sentences with one wrong word should bring back the
   * one, not the six. The exercise-level card is not touched at all — keeping both
   * would leave the coarse card dragging every gap along behind it.
   *
   * A gap whose card cannot be introduced is skipped rather than fatal. The most
   * likely reason is the daily new-card limit, and a six-gap block now asks for six
   * new cards where it used to ask for one: the limit doing its job on the tail of a
   * block is not an error, and the remaining gaps still deserve their reviews.
   */
  private async reviewGapCards(
    p: ExerciseAttemptCompletedPayload,
    gapResults: NonNullable<ExerciseAttemptCompletedPayload['gapResults']>,
  ): Promise<void> {
    const gapCount = gapResults.length;

    for (const [index, gap] of gapResults.entries()) {
      const contentId = gapCardContentId(p.exerciseId, gap.gapKey);

      const introduceResult = await this.commandBus.execute(
        new IntroduceCardCommand(p.userId, 'EXERCISE_GAP', contentId),
      );
      if (introduceResult.isFail) {
        this.logger.debug(
          `SRS gap introduce skipped for ${contentId} / user ${p.userId}: ${introduceResult.error?.message}`,
        );
        continue;
      }

      const card = introduceResult.value as ReviewCardDto;
      const position = index + 1;
      // The gap's own verdict, not the exercise's score: right is a full recall of
      // this word, wrong is a lapse of it, and the form of the answer — narrowed by
      // how much of the bank was already spent — decides how much either is worth.
      const rating = ratingForAttempt(p, gap.correct ? 100 : 0, position);

      const reviewResult = await this.commandBus.execute(
        new ReviewCardCommand(p.userId, card.id, rating),
      );
      if (reviewResult.isFail) {
        this.logger.debug(
          `SRS gap review skipped for ${contentId} / user ${p.userId}: ${reviewResult.error?.message}`,
        );
        continue;
      }

      await this.publishRatingRecord(p, rating, card, position, gapCount);
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
    gapPosition: number | null,
    gapCount: number | null,
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
      // Null for a card standing for the whole exercise — there is no position within
      // a block to report. Set for gap cards, which is what §B.3 will decay against.
      gapPosition,
      gapCount,
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
