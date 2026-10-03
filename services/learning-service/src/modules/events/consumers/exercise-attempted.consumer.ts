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
// The table lives in the kernel (plan 55 §3.9): analytics weighs the same attempt into
// the mastery profile, and a second copy of that judgement would drift from this one.
import {
  atomEvidenceStrength,
  clampByEvidence,
  evidenceStrength,
  strongerClaim,
} from '@ssz/shared-kernel/evidence';
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
  const rating = scoreToRating(score);

  // A person read this one. The floor under a free-form failure is there because a
  // machine marking typed text wrong may be punishing a typo (`FREE_PRODUCTION` in the
  // kernel) — and that doubt is exactly what a teacher's verdict removes. Lifting their
  // judgement off the floor would forgive the one failure nobody should forgive, and it
  // would do it only to the modalities people mark: recall and production.
  if (p.reviewOutcome !== undefined) return rating;

  return clampByEvidence(
    rating,
    evidenceStrength({
      answerForm: p.answerForm,
      templateCode: p.templateCode,
      gapPosition,
    }),
  );
}

/**
 * What one attempt says about **one atom inside it** (plan 63 phase 5).
 *
 * Same shape as `ratingForAttempt` and a different question. That one asks how well the
 * answer went and how much the form of the answer proves; this one asks the same of a
 * thing that was only part of what was answered, so the role the author gave the atom
 * and the modality of the attempt narrow it further — see `atomEvidenceStrength`.
 *
 * `score` is the verdict on the piece the atom was addressed by, never the score of the
 * attempt: a block of six sentences with one wrong word proves a lapse of the atom in
 * that one sentence and a recall of the atoms in the other five.
 */
function ratingForAtom(
  p: ExerciseAttemptCompletedPayload,
  score: number,
  role: 'focus' | 'context',
  gapPosition: number | null,
): ReviewRatingValue {
  const rating = scoreToRating(score);

  // A person read this one, so the doubt the form-based ceilings exist for is gone —
  // but only about the answer. It says nothing about an atom the item never asked
  // about, which is still worth what background is worth.
  if (p.reviewOutcome !== undefined && role === 'focus') return rating;

  return clampByEvidence(
    rating,
    atomEvidenceStrength({
      answerForm: p.answerForm,
      templateCode: p.templateCode,
      gapPosition,
      role,
      modality: p.modality,
    }),
  );
}

/** One atom, as one attempt saw it, once the attempt's several views are reconciled. */
interface AtomObservation {
  atomType: string;
  atomId: string;
  role: 'focus' | 'context';
  rating: ReviewRatingValue;
  /** The piece of the exercise this verdict came from; null for the exercise as a whole. */
  itemKey: string | null;
  gapPosition: number | null;
  gapCount: number | null;
}

/**
 * Every atom this attempt addressed, each with exactly one verdict (plan 63 phase 5).
 *
 * Built from the addresses the engine snapshotted at start: per-gap ones get their own
 * gap's outcome, and the exercise-level ones — the address of a template that grades as
 * one — get the score of the attempt.
 *
 * Reconciled to one observation per atom rather than one per address, because a single
 * answer must move a card once. `strongerClaim` decides which of several survives.
 */
function collectAtomObservations(p: ExerciseAttemptCompletedPayload): AtomObservation[] {
  const byAtom = new Map<string, AtomObservation>();

  const add = (observation: AtomObservation): void => {
    const key = `${observation.atomType}:${observation.atomId}`;
    const existing = byAtom.get(key);
    byAtom.set(key, existing ? strongerClaim(existing, observation) : observation);
  };

  const gapResults = p.gapResults ?? [];
  const gapCount = gapResults.length;

  for (const [index, gap] of gapResults.entries()) {
    const position = index + 1;
    for (const target of gap.targets ?? []) {
      add({
        atomType: target.atomType,
        atomId: target.atomId,
        role: target.role,
        rating: ratingForAtom(p, gap.correct ? 100 : 0, target.role, position),
        itemKey: gap.gapKey,
        gapPosition: position,
        gapCount,
      });
    }
  }

  for (const target of p.targets ?? []) {
    add({
      atomType: target.atomType,
      atomId: target.atomId,
      role: target.role,
      rating: ratingForAtom(p, p.score as number, target.role, null),
      itemKey: null,
      gapPosition: null,
      gapCount: null,
    });
  }

  return [...byAtom.values()];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The stability the schedule settled on, off the card the review command handed back.
 *
 * Defensive rather than cast straight through: this is telemetry, and a card shape
 * without the field must cost a sample, not the SRS update that already happened.
 */
function stabilityOf(card: unknown): number | null {
  const value = (card as { stability?: unknown } | null)?.stability;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

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

/**
 * What a rating is evidence about, as this consumer hands it to the record.
 *
 * `contentType` says which kind of card was rated, so that a consumer counting attempts
 * never counts a word coming back as one (plan 63 phase 3).
 */
interface RatingAddress {
  contentType: string;
  itemKey: string | null;
  targets: Array<{ atomType: string; atomId: string; role: 'focus' | 'context' | null }> | null;
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

      // Work a teacher sent back (plan 63 §4). It moves memory and not progress, and the
      // two clauses below are the whole of that: no progress row, and a rating all the
      // same. The submission was already recorded as an attempt when it was routed for
      // review; writing it again now — with the teacher's partial credit, and
      // `completed: false` — would overwrite a mark the learner may already have earned
      // on this exercise with the score of a draft they are being asked to redo.
      const sentBack = p.reviewOutcome === 'returned';

      /*
        Work done on a disposable task (plan 63 phase 9).

        Everything this consumer writes falls into two kinds, and a probe separates them
        cleanly for the first time. Evidence about an **atom** — the fan-out below, and
        the grammar cards beside it — is ordinary evidence and is kept: that a learner
        can or cannot form the passive is a fact about them, and it does not matter
        whether the sentence they proved it on was written by an author last year or
        generated for them this afternoon. That is the whole point of having moved memory
        onto the atom (§2 A); without it, nothing generated could ever have counted.

        Anything keyed by the **exercise** is dropped: the progress row, the card on the
        exercise, the cards on its gaps. The id names a row that is designed to be gone
        tomorrow, so those would be a learner's history slowly filling with pointers to
        questions nobody can look up — "completed 40 exercises", counting tasks that were
        thrown away on purpose, and a review queue bringing back a gap in a sentence that
        no longer exists.
      */
      const ephemeral = p.ephemeral === true;

      // 1. Progress tracking (existing behaviour — unchanged).
      if (!sentBack && !ephemeral) {
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
          this.logger.warn(
            `UpsertProgress failed for event ${eventId}: ${progressResult.error?.message}`,
          );
        }
      }

      // 2 & 3. SRS. An attempt is rated when it is closed-form and scored, and when a
      //    person read it and ruled on it — an approval through the scored event above,
      //    a return through `reviewOutcome`. What is never rated is the moment a free
      //    form is handed over (`completed: false`, `score: null`): nobody has judged it
      //    yet. Recording only the approvals, which is what this consumer did until the
      //    return arrived, made every piece of evidence about recall and production
      //    evidence of success.
      //
      //    Which cards get rated depends on how the attempt was graded. A gap-graded
      //    template holds a card per gap (plan 36 §C.1) and no card for the exercise
      //    as a whole; everything else keeps the single exercise card it has always
      //    had. All exercises are SRS-eligible by default in MVP — see
      //    docs/research/sprint-06-srs-content-flags.md.
      const gapResults = p.gapResults ?? [];
      const rated = p.score !== null && (p.completed === true || sentBack);

      if (ephemeral) {
        // No card on the exercise and none on its gaps — see `ephemeral` above. The
        // verdicts are not lost: they are read as atom observations a few lines down,
        // which is where a probe's evidence belongs.
      } else if (gapResults.length > 0) {
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

        // What the author said each piece of this exercise was about (plan 63 phase 5).
        // Two consumers of the same list below: the words fan out to cards they already
        // had, and the grammar atoms get cards of their own for the first time.
        const observations = collectAtomObservations(p);
        const observedVocab = new Map(
          observations
            .filter((observation) => observation.atomType === 'vocabulary_item')
            .map((observation) => [observation.atomId, observation]),
        );

        // 4. Fan-out (plan 21 §3) — rate the VOCABULARY_WORD atoms this exercise
        // practices, snapshotted by Exercise Engine at attempt start. Grammar rule
        // atoms are skipped: their mastery is derived from pool-exercise
        // retrievability (plan 21 §2), not tracked as a separate SRS card.
        const vocabAtomIds = (p.practicedAtoms ?? [])
          .filter((atom) => atom.atomType === 'vocabulary_item')
          .map((atom) => atom.atomId);

        for (const vocabularyItemId of vocabAtomIds) {
          // The word's own verdict where an author addressed it, and the attempt's
          // score where nobody did (plan 63 phase 5). Until now every word in an
          // exercise was rated by the score of the whole attempt while the gaps beside
          // them were rated one by one — so in a single attempt `stillingsannonse`
          // could be rated GOOD as a gap and AGAIN as a word. An address is what makes
          // the narrower answer possible; without one the coarse rating is still the
          // best available and is left alone.
          const observed = observedVocab.get(vocabularyItemId);
          const atomRating = observed?.rating ?? rating;

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
            new ReviewCardCommand(p.userId, atomIntroduceResult.value.id, atomRating),
          );
          if (atomReviewResult.isFail) {
            this.logger.debug(
              `SRS fan-out review skipped for vocab ${vocabularyItemId} / user ${p.userId}: ${atomReviewResult.error?.message}`,
            );
            continue;
          }

          // The fan-out has been rating words for months and telling nobody (plan 63
          // phase 3): every word a learner has met came back on schedule, and analytics
          // held not one row saying which word or how it went. The rating record says so
          // now, marked as a word rather than as an attempt so that nothing counting
          // attempts starts counting these too.
          await this.publishRatingRecord(
            p,
            atomRating,
            atomIntroduceResult.value as ReviewCardDto,
            observed?.gapPosition ?? null,
            observed?.gapCount ?? null,
            stabilityOf(atomReviewResult.value),
            {
              contentType: 'VOCABULARY_WORD',
              itemKey: observed?.itemKey ?? null,
              // The role only if an author addressed this word somewhere in the exercise.
              // An atom that arrived through the practised-atom graph has no role, and
              // calling it `focus` would turn "nobody said" into the strongest evidence
              // the scale has.
              targets: [
                {
                  atomType: 'vocabulary_item',
                  atomId: vocabularyItemId,
                  role: observed?.role ?? null,
                },
              ],
            },
          );
        }

        // 4b. The shadow half of the same fan-out (plan 63 phase 5) — a card per
        //     grammar atom this exercise addressed, rated by the same answer.
        await this.reviewGrammarAtomCards(p, observations);
      }

      // 5. Can-do progress evaluation — recompute descriptor achievement
      //    for any modules whose atoms were practiced.
      //
      //    Run for a probe too, deliberately: this reads the state of the atoms the
      //    attempt just moved and re-derives what the learner can do. It writes nothing
      //    keyed by the exercise, and refusing it would mean a learner who practised an
      //    atom on a generated task stayed short of a descriptor they had in fact earned.
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
    await this.publishRatingRecord(p, rating, card, null, null, stabilityOf(reviewResult.value), {
      contentType: 'EXERCISE',
      itemKey: null,
      // A template that grades as one addresses the exercise as a whole, and that is
      // exactly the list the engine snapshots under a null item key.
      targets: p.targets ?? null,
    });
  }

  /**
   * A card per grammar atom the exercise addressed, written in shadow (plan 63 phase 5).
   *
   * This is the model the platform is moving to: memory lives on the atom, so that
   * passing an exercise a second time proves the learner remembers the exercise, while
   * the rule it was teaching is scheduled on the evidence of everything that ever asked
   * about it. Words have worked this way since plan 21; grammar has had nothing at all,
   * its mastery inferred from how often its exercises came back.
   *
   * Shadow means the old cards keep being written and rated exactly as before, and these
   * change nothing a learner sees: no due queue, no streak, no daily budget (see
   * `SHADOW_CONTENT_TYPES` and the `shadow` flag on both commands). The two models run
   * side by side so that their divergence is something to read in a fortnight rather
   * than a surprise on the day the old ones are switched off in phase 7.
   *
   * Non-fatal throughout, like the fan-out above it: nothing that only measures may nack
   * an attempt whose progress and real schedules are already written.
   */
  private async reviewGrammarAtomCards(
    p: ExerciseAttemptCompletedPayload,
    observations: AtomObservation[],
  ): Promise<void> {
    for (const observation of observations) {
      if (observation.atomType !== 'grammar_rule_atom') continue;

      const introduceResult = await this.commandBus.execute(
        new IntroduceCardCommand(p.userId, 'GRAMMAR_ATOM', observation.atomId, undefined, true),
      );
      if (introduceResult.isFail) {
        this.logger.debug(
          `Shadow introduce skipped for atom ${observation.atomId} / user ${p.userId}: ${introduceResult.error?.message}`,
        );
        continue;
      }

      const card = introduceResult.value as ReviewCardDto;
      const reviewResult = await this.commandBus.execute(
        new ReviewCardCommand(
          p.userId,
          card.id,
          observation.rating,
          undefined,
          undefined,
          undefined,
          true,
        ),
      );
      if (reviewResult.isFail) {
        this.logger.debug(
          `Shadow review skipped for atom ${observation.atomId} / user ${p.userId}: ${reviewResult.error?.message}`,
        );
        continue;
      }

      // Recorded like every other rating, and marked `GRAMMAR_ATOM` so that analytics
      // keeps it out of `attempt_evidence` — where five readers count rows as attempts
      // — and counts it card-side in the modality gap (plan 63 phases 3 and 4).
      await this.publishRatingRecord(
        p,
        observation.rating,
        card,
        observation.gapPosition,
        observation.gapCount,
        stabilityOf(reviewResult.value),
        {
          contentType: 'GRAMMAR_ATOM',
          itemKey: observation.itemKey,
          targets: [
            {
              atomType: observation.atomType,
              atomId: observation.atomId,
              role: observation.role,
            },
          ],
        },
      );
    }
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

      await this.publishRatingRecord(
        p,
        rating,
        card,
        position,
        gapCount,
        stabilityOf(reviewResult.value),
        { contentType: 'EXERCISE_GAP', itemKey: gap.gapKey, targets: gap.targets ?? null },
      );
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
    /** The card's stability once this review had been scheduled — see the payload. */
    stabilityAfter: number | null,
    /**
     * What this rating is evidence about, and which piece of the exercise produced it
     * (plan 63 §2 D). Forwarded from the attempt's own snapshot, never looked up: by the
     * time this runs the author may have re-anchored the gap.
     */
    address: RatingAddress = { itemKey: null, targets: null, contentType: 'EXERCISE' },
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
      // Forwarded rather than re-derived: the engine snapshotted the axes when the
      // learner started, and this consumer has no way to ask what the exercise trains
      // — nor any business asking now, weeks of edits later (plan 55 §3.6).
      skills: p.skills ?? null,
      focus: p.focus ?? null,
      containerId: p.containerId ?? null,
      // Forwarded, never re-derived here: this consumer runs after the fact, and the
      // assignment or lesson that decided the context may already be gone (plan 57 §7).
      workContext: p.workContext ?? null,
      groupId: p.groupId ?? null,
      lessonId: p.lessonId ?? null,
      timeSpentSeconds: p.timeSpentSeconds ?? null,
      stabilityAfter,
      modality: p.modality ?? null,
      contentType: address.contentType,
      itemKey: address.itemKey,
      // Absent rather than empty when nobody addressed it: an empty list would read as
      // "this rating is about nothing", and the truth is that nobody has said yet.
      targets: address.targets && address.targets.length > 0 ? address.targets : null,
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
