import { jest } from '@jest/globals';
import { ExerciseAttemptedConsumer } from '../../../../src/modules/events/consumers/exercise-attempted.consumer.js';
import { IntroduceCardCommand } from '../../../../src/modules/srs/application/commands/introduce-card.command.js';
import { ReviewCardCommand } from '../../../../src/modules/srs/application/commands/review-card.command.js';
import { UpsertProgressCommand } from '../../../../src/modules/progress/application/commands/upsert-progress.command.js';
import { Result } from '../../../../src/shared/kernel/result.js';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';

const USER_ID    = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const EXERCISE_ID = 'eb1aa566-c4e0-4ffa-8018-e9ce2abc5d08';
const CARD_ID     = 'aaaaaaaa-0000-4000-8000-000000000001';

function makeMsg(content: unknown): ConsumeMessage {
  return { content: Buffer.from(JSON.stringify(content)) } as unknown as ConsumeMessage;
}

function makeChannel(): jest.Mocked<Pick<ConfirmChannel, 'ack' | 'nack'>> {
  return { ack: jest.fn(), nack: jest.fn() } as any;
}

function makeConsumer(overrides: {
  processedEvent?: { findUnique: any; create: any };
  commandBusExecute?: (cmd: unknown) => Promise<unknown>;
} = {}) {
  const defaultExecute = (cmd: unknown) => {
    if (cmd instanceof UpsertProgressCommand) {
      return Promise.resolve(Result.ok({}));
    }
    if (cmd instanceof IntroduceCardCommand) {
      return Promise.resolve(
        Result.ok({ id: CARD_ID, state: 'NEW', userId: USER_ID, reps: 0, lastReviewedAt: null }),
      );
    }
    if (cmd instanceof ReviewCardCommand) {
      return Promise.resolve(Result.ok({ id: CARD_ID, state: 'REVIEW', userId: USER_ID }));
    }
    return Promise.resolve(Result.ok({}));
  };

  const commandBus = {
    execute: jest.fn<(cmd: unknown) => Promise<unknown>>().mockImplementation(
      overrides.commandBusExecute ?? defaultExecute,
    ),
  } as any;

  const prisma = {
    processedEvent: {
      findUnique: overrides.processedEvent?.findUnique
        ?? jest.fn<() => Promise<null>>().mockResolvedValue(null),
      create: overrides.processedEvent?.create
        ?? jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as any;

  const config = { get: jest.fn().mockReturnValue(undefined) } as any;

  const publisher = {
    publish: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as any;

  const canDoEvaluator = {
    evaluateForAtoms: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as any;

  return {
    consumer: new ExerciseAttemptedConsumer(commandBus, prisma, config, canDoEvaluator, publisher),
    commandBus,
    prisma,
    publisher,
  };
}

/** The `learning.attempt.rated` payload the consumer published, if it published one. */
function ratedPayload(publisher: { publish: { mock: { calls: unknown[][] } } }) {
  const call = publisher.publish.mock.calls.find((c) => c[0] === 'learning.attempt.rated');
  return call?.[1] as Record<string, unknown> | undefined;
}

function envelope(payload: object, eventId = 'evt-001') {
  return { eventId, eventType: 'exercise.attempt.completed', payload };
}

describe('ExerciseAttemptedConsumer', () => {
  describe('handleMessage — happy paths', () => {
    it('introduces card and reviews it when completed=true and score is provided', async () => {
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(envelope({ userId: USER_ID, exerciseId: EXERCISE_ID, score: 85, timeSpentSeconds: 60, completed: true })),
      );

      const calls = commandBus.execute.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls.some((c) => c instanceof IntroduceCardCommand)).toBe(true);
      const reviewCall = calls.find((c) => c instanceof ReviewCardCommand) as ReviewCardCommand | undefined;
      expect(reviewCall).toBeDefined();
      expect(reviewCall!.rating).toBe('GOOD');
      expect(reviewCall!.cardId).toBe(CARD_ID);
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('introduces card but does NOT review when completed=false', async () => {
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(envelope({ userId: USER_ID, exerciseId: EXERCISE_ID, score: null, timeSpentSeconds: 30, completed: false })),
      );

      const calls = commandBus.execute.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls.some((c) => c instanceof IntroduceCardCommand)).toBe(true);
      expect(calls.some((c) => c instanceof ReviewCardCommand)).toBe(false);
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('introduces card but does NOT review when score is null', async () => {
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(envelope({ userId: USER_ID, exerciseId: EXERCISE_ID, score: null, timeSpentSeconds: 30, completed: true })),
      );

      const calls = commandBus.execute.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls.some((c) => c instanceof ReviewCardCommand)).toBe(false);
    });

    /**
     * A teacher read the work and sent it back (plan 63 §4). Two things follow, and they
     * pull in opposite directions: the memory hears the verdict, and progress does not —
     * the learner has been asked to do it again, and a draft's score must not overwrite a
     * mark they may already hold on this exercise.
     *
     * Until this arrived, only approvals were rated, so everything the platform knew
     * about recall and production was evidence of success.
     */
    it('rates work a teacher sent back, and records no progress for it', async () => {
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: 0,
            timeSpentSeconds: 120,
            completed: false,
            passed: false,
            reviewOutcome: 'returned',
            templateCode: 'short_answer',
          }),
        ),
      );

      const calls = commandBus.execute.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls.some((c) => c instanceof ReviewCardCommand)).toBe(true);
      expect(calls.some((c) => c instanceof UpsertProgressCommand)).toBe(false);
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    /**
     * The floor under a free-form failure exists because a machine marking typed text
     * wrong may be punishing a typo. A teacher is not, and a verdict must not be lifted
     * off the floor — that would forgive the one failure nobody should forgive, and only
     * in the modalities people mark.
     */
    it('rates a teacher’s rejection AGAIN, where a machine’s would be lifted to HARD', async () => {
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: 0,
            timeSpentSeconds: 120,
            completed: false,
            passed: false,
            reviewOutcome: 'returned',
            templateCode: 'short_answer',
            answerForm: { mode: 'free' },
          }),
        ),
      );

      const review = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .find((c: unknown) => c instanceof ReviewCardCommand) as { rating: string };
      expect(review.rating).toBe('AGAIN');
    });

    /**
     * The moment the work was handed over is not a verdict — nobody has read it yet —
     * and it must stay unrated however long it waits in the queue.
     */
    it('still rates nothing for a free form that is merely waiting for a person', async () => {
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: null,
            timeSpentSeconds: 120,
            completed: false,
            templateCode: 'short_answer',
          }),
        ),
      );

      const calls = commandBus.execute.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls.some((c) => c instanceof ReviewCardCommand)).toBe(false);
      expect(calls.some((c) => c instanceof UpsertProgressCommand)).toBe(true);
    });

    it('marks the event as processed and acks on success', async () => {
      const { consumer, prisma } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(envelope({ userId: USER_ID, exerciseId: EXERCISE_ID, score: 70, timeSpentSeconds: 45, completed: true }, 'evt-xyz')),
      );

      expect(prisma.processedEvent.create).toHaveBeenCalledWith({
        data: { eventId: 'evt-xyz', eventType: 'exercise.attempt.completed' },
      });
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMessage — the evidence ceiling (plan 36 §B.2)', () => {
    // `word_bank_gap_fill` merged the "choose from a bank" and "type it from
    // memory" exercises into one template, so `answerForm` is the only thing that
    // distinguishes them — and picking a word out of five given ones is not the
    // same evidence as recalling it. The rating is now capped by the form.

    async function ratingFor(payload: object): Promise<string> {
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();
      await (consumer as any).handleMessage(channel, makeMsg(envelope(payload)));
      const reviewCall = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .find((c) => c instanceof ReviewCardCommand) as ReviewCardCommand | undefined;
      return reviewCall?.rating ?? '';
    }

    const perfect = {
      userId: USER_ID,
      exerciseId: EXERCISE_ID,
      score: 100,
      timeSpentSeconds: 60,
      completed: true,
    };

    it('holds a perfect score from a bank of five to GOOD, not EASY', async () => {
      expect(
        await ratingFor({
          ...perfect,
          answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: true },
        }),
      ).toBe('GOOD');
    });

    it('lets a perfect score typed from memory reach EASY', async () => {
      expect(
        await ratingFor({
          ...perfect,
          answerForm: { mode: 'free', bankSize: null, wordsConsumed: false },
        }),
      ).toBe('EASY');
    });

    it('lifts a failure at free typing off the floor — it may only be a typo', async () => {
      expect(
        await ratingFor({
          ...perfect,
          score: 0,
          answerForm: { mode: 'free', bankSize: null, wordsConsumed: false },
        }),
      ).toBe('HARD');
    });

    it('leaves a failure from a bank on the floor — the hint was as big as it gets', async () => {
      expect(
        await ratingFor({
          ...perfect,
          score: 0,
          answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: true },
        }),
      ).toBe('AGAIN');
    });

    it('caps by template code when there is no form to read', async () => {
      // Elimination does the work in match_pairs: the last pair is correct by
      // construction, so a perfect score cannot mean more than HARD.
      expect(await ratingFor({ ...perfect, templateCode: 'match_pairs' })).toBe('HARD');
      expect(await ratingFor({ ...perfect, templateCode: 'short_answer' })).toBe('EASY');
    });

    it('drops sort_into_buckets one step when the engine says the delivery gave part away', async () => {
      // Plan 66, Q2-B: the counter or a skewed board. GOOD is the ordinary ceiling.
      expect(await ratingFor({ ...perfect, templateCode: 'sort_into_buckets' })).toBe('GOOD');
      expect(
        await ratingFor({ ...perfect, templateCode: 'sort_into_buckets', evidenceLowered: true }),
      ).toBe('HARD');
      // A failure says what it said.
      expect(
        await ratingFor({ ...perfect, score: 0, templateCode: 'sort_into_buckets', evidenceLowered: true }),
      ).toBe('AGAIN');
    });

    it('leaves an unknown template rating exactly as it does today', async () => {
      expect(await ratingFor({ ...perfect, templateCode: 'some_future_type' })).toBe('EASY');
    });

    it('records the clamped rating in the telemetry, not the raw one', async () => {
      const { consumer, publisher } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            ...perfect,
            templateCode: 'word_bank_gap_fill',
            answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: true },
          }),
        ),
      );

      // The baseline is only comparable if it says what actually reached FSRS.
      expect(ratedPayload(publisher)!.ratingApplied).toBe('GOOD');
    });

    it('applies the same ceiling to the vocabulary fan-out', async () => {
      // The atoms an exercise practices are rated with the exercise's own rating.
      // If the ceiling stopped at the exercise card, every word behind a bank
      // answer would keep stretching as though it had been recalled.
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            ...perfect,
            answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: true },
            practicedAtoms: [{ atomType: 'vocabulary_item', atomId: 'word-1' }],
          }),
        ),
      );

      const reviews = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((c) => c instanceof ReviewCardCommand) as ReviewCardCommand[];

      expect(reviews).toHaveLength(2);
      expect(reviews.every((r) => r.rating === 'GOOD')).toBe(true);
    });

    it('still handles an event published before the field existed', async () => {
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: 100,
            timeSpentSeconds: 60,
            completed: true,
          }),
        ),
      );

      const reviewCall = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .find((c) => c instanceof ReviewCardCommand) as ReviewCardCommand | undefined;

      expect(reviewCall!.rating).toBe('EASY');
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMessage — the calibration record (plan 36 §A.1)', () => {
    // Measurement ships before the scale does. These rows are the baseline the
    // evidence ceilings will later be judged against, so what matters is that the
    // form and the rating land together, unclamped, on every rated attempt.

    it('publishes the answer form alongside the rating that reached FSRS', async () => {
      const { consumer, publisher } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: 100,
            timeSpentSeconds: 60,
            completed: true,
            passed: true,
            templateCode: 'word_bank_gap_fill',
            answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: true },
          }),
        ),
      );

      expect(ratedPayload(publisher)).toEqual({
        userId: USER_ID,
        exerciseId: EXERCISE_ID,
        templateCode: 'word_bank_gap_fill',
        answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: true },
        score: 100,
        passed: true,
        attemptOrdinal: 1,
        daysSinceLastReview: null,
        gapPosition: null,
        gapCount: null,
        // Clamped: a perfect score out of a bank of five is not a perfect recall.
        ratingApplied: 'GOOD',
        // Nothing said which axes, and this card mock reports no stability: absent is
        // recorded as null rather than as an empty cell to count into (plan 55 §3.6).
        skills: null,
        focus: null,
        containerId: null,
        // Nothing said where the work was done either: an event from before the field
        // existed is not silently filed as self_study (plan 57 §7).
        workContext: null,
        groupId: null,
        lessonId: null,
        // Plan 66 — the engine did not say the delivery gave part of the answer away.
        evidenceLowered: null,
        timeSpentSeconds: 60,
        stabilityAfter: null,
        // Plan 63 phase 3 — what was rated and what it is evidence about. Nothing said
        // any of it here: no modality from the publisher, no author's address.
        contentType: 'EXERCISE',
        modality: null,
        itemKey: null,
        targets: null,
      });
    });

    it('forwards the axes and the stability the review left behind', async () => {
      const { consumer, publisher } = makeConsumer({
        commandBusExecute: (cmd: unknown) => {
          if (cmd instanceof IntroduceCardCommand) {
            return Promise.resolve(
              Result.ok({ id: CARD_ID, state: 'NEW', userId: USER_ID, reps: 0, lastReviewedAt: null }),
            );
          }
          if (cmd instanceof ReviewCardCommand) {
            return Promise.resolve(
              Result.ok({ id: CARD_ID, state: 'REVIEW', userId: USER_ID, stability: 12.5 }),
            );
          }
          return Promise.resolve(Result.ok({}));
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: 100,
            timeSpentSeconds: 60,
            completed: true,
            templateCode: 'short_answer',
            skills: ['reading'],
            focus: ['grammar'],
          }),
        ),
      );

      const payload = ratedPayload(publisher);
      expect(payload.skills).toEqual(['reading']);
      expect(payload.focus).toEqual(['grammar']);
      // After the review, not before: this is what tells "forgets quickly" from
      // "does not know" once the profile is built on it.
      expect(payload.stabilityAfter).toBe(12.5);
    });

    it('counts the attempt from the card as it stood before the review', async () => {
      const { consumer, publisher } = makeConsumer({
        commandBusExecute: (cmd: unknown) => {
          if (cmd instanceof IntroduceCardCommand) {
            return Promise.resolve(
              Result.ok({
                id: CARD_ID,
                state: 'REVIEW',
                userId: USER_ID,
                reps: 3,
                lastReviewedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              }),
            );
          }
          return Promise.resolve(Result.ok({}));
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: 85,
            timeSpentSeconds: 20,
            completed: true,
          }),
        ),
      );

      const payload = ratedPayload(publisher)!;
      expect(payload.attemptOrdinal).toBe(4);
      expect(payload.daysSinceLastReview).toBeCloseTo(2, 2);
    });

    it('records a null form for events published before the field existed', async () => {
      const { consumer, publisher } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: 70,
            timeSpentSeconds: 20,
            completed: true,
          }),
        ),
      );

      const payload = ratedPayload(publisher)!;
      expect(payload.answerForm).toBeNull();
      expect(payload.templateCode).toBeNull();
      expect(payload.passed).toBeNull();
      expect(payload.ratingApplied).toBe('HARD');
    });

    it('records nothing when no rating reached FSRS', async () => {
      // A review refused by the daily limit moved no schedule. Recording it as
      // though it had would put a rating in the baseline that never happened.
      const { consumer, publisher } = makeConsumer({
        commandBusExecute: (cmd: unknown) => {
          if (cmd instanceof IntroduceCardCommand) {
            return Promise.resolve(
              Result.ok({ id: CARD_ID, state: 'NEW', userId: USER_ID, reps: 0, lastReviewedAt: null }),
            );
          }
          if (cmd instanceof ReviewCardCommand) {
            return Promise.resolve(Result.fail(new Error('daily limit reached')));
          }
          return Promise.resolve(Result.ok({}));
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: 100,
            timeSpentSeconds: 20,
            completed: true,
          }),
        ),
      );

      expect(ratedPayload(publisher)).toBeUndefined();
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('acks the attempt even when the telemetry publish fails', async () => {
      // Progress and the SRS card are already written by this point. Nacking to
      // retry a lost measurement would replay an event the idempotency key then
      // skips — trading a missing sample for a missing SRS update.
      const { consumer, publisher } = makeConsumer();
      publisher.publish.mockRejectedValue(new Error('broker down'));
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: 90,
            timeSpentSeconds: 20,
            completed: true,
          }),
        ),
      );

      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });
  });

  describe('handleMessage — a card per gap (plan 36 §C.1)', () => {
    // With one card per exercise, a block of six sentences is a single card: get one
    // word wrong and all six come back. Before gap-fill was merged into one template,
    // six separate exercises gave six independent cards, and that was better. These
    // give it back, finer than it was.

    const sixGaps = [
      { gapKey: 'g1', correct: true },
      { gapKey: 'g2', correct: true },
      { gapKey: 'g3', correct: false },
      { gapKey: 'g4', correct: true },
      { gapKey: 'g5', correct: true },
      { gapKey: 'g6', correct: true },
    ];

    function blockAttempt(overrides: object = {}) {
      return {
        userId: USER_ID,
        exerciseId: EXERCISE_ID,
        // Five of six right. The exercise-level score is deliberately not what any
        // gap is rated on.
        score: 83,
        timeSpentSeconds: 120,
        completed: true,
        templateCode: 'word_bank_gap_fill',
        answerForm: { mode: 'free', bankSize: null, wordsConsumed: false },
        gapResults: sixGaps,
        ...overrides,
      };
    }

    it('introduces one card per gap, keyed by exercise and gap', async () => {
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(envelope(blockAttempt())));

      const introduced = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((c) => c instanceof IntroduceCardCommand) as IntroduceCardCommand[];

      expect(introduced).toHaveLength(6);
      expect(introduced.every((c) => c.contentType === 'EXERCISE_GAP')).toBe(true);
      expect(introduced.map((c) => c.contentId)).toEqual([
        `${EXERCISE_ID}#g1`,
        `${EXERCISE_ID}#g2`,
        `${EXERCISE_ID}#g3`,
        `${EXERCISE_ID}#g4`,
        `${EXERCISE_ID}#g5`,
        `${EXERCISE_ID}#g6`,
      ]);
    });

    it('does not touch the exercise-level card', async () => {
      // Keeping both would leave the coarse card dragging every gap along with it,
      // which is the thing this step exists to stop.
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(envelope(blockAttempt())));

      const introduced = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((c) => c instanceof IntroduceCardCommand) as IntroduceCardCommand[];

      expect(introduced.some((c) => c.contentType === 'EXERCISE')).toBe(false);
    });

    it('rates each gap on its own verdict, not on the exercise score', async () => {
      // The one wrong sentence moves its own card and nothing else: 83 would have
      // rated all six GOOD, and the five right ones deserve better than that.
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(envelope(blockAttempt())));

      const reviews = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((c) => c instanceof ReviewCardCommand) as ReviewCardCommand[];

      // Typed from memory: a right gap reaches EASY, a wrong one is lifted off the
      // floor to HARD because it may be a typo.
      expect(reviews.map((r) => r.rating)).toEqual(['EASY', 'EASY', 'HARD', 'EASY', 'EASY', 'EASY']);
    });

    it('still caps each gap by the form the answer took', async () => {
      // Reusable words, so nothing is spent and every gap faces the same bank — the
      // cap on its own, without the decay that has its own test below.
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope(
            blockAttempt({ answerForm: { mode: 'bank', bankSize: 6, wordsConsumed: false } }),
          ),
        ),
      );

      const reviews = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((c) => c instanceof ReviewCardCommand) as ReviewCardCommand[];

      expect(reviews.map((r) => r.rating)).toEqual([
        'GOOD', 'GOOD', 'AGAIN', 'GOOD', 'GOOD', 'GOOD',
      ]);
    });

    it('discounts the tail of a bank spent as it goes (plan 36 §B.3)', async () => {
      // Six words over six gaps: by the fourth there are three left, and by the sixth
      // there is one word and one place to put it. All six were right, and they are
      // not worth the same.
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope(
            blockAttempt({
              answerForm: { mode: 'bank', bankSize: 6, wordsConsumed: true },
              gapResults: sixGaps.map((gap) => ({ ...gap, correct: true })),
              score: 100,
            }),
          ),
        ),
      );

      const reviews = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((c) => c instanceof ReviewCardCommand) as ReviewCardCommand[];

      expect(reviews.map((r) => r.rating)).toEqual([
        'GOOD', 'GOOD', 'GOOD', 'HARD', 'HARD', 'HARD',
      ]);
    });

    it('reports each gap position in the telemetry', async () => {
      // The position §B.3 will decay against: with a consumed bank of six over six
      // gaps, the last one is a certainty rather than a recollection.
      const { consumer, publisher } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(envelope(blockAttempt())));

      const records = publisher.publish.mock.calls
        .filter((c: unknown[]) => c[0] === 'learning.attempt.rated')
        .map((c: unknown[]) => c[1] as Record<string, unknown>);

      expect(records).toHaveLength(6);
      expect(records.map((r) => r.gapPosition)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(records.every((r) => r.gapCount === 6)).toBe(true);
    });

    it('carries on when one gap cannot be introduced', async () => {
      // A six-gap block now asks for six new cards where it used to ask for one, so
      // the daily limit will bite mid-block. The remaining gaps still get reviewed.
      let seen = 0;
      const { consumer, commandBus } = makeConsumer({
        commandBusExecute: (cmd: unknown) => {
          if (cmd instanceof IntroduceCardCommand) {
            seen += 1;
            return seen === 3
              ? Promise.resolve(Result.fail(new Error('daily new-card limit reached')))
              : Promise.resolve(
                  Result.ok({ id: CARD_ID, state: 'NEW', userId: USER_ID, reps: 0, lastReviewedAt: null }),
                );
          }
          return Promise.resolve(Result.ok({}));
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(channel, makeMsg(envelope(blockAttempt())));

      const reviews = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((c) => c instanceof ReviewCardCommand) as ReviewCardCommand[];

      expect(reviews).toHaveLength(5);
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });

    it('keeps the single exercise card for templates not graded gap by gap', async () => {
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: 83,
            timeSpentSeconds: 120,
            completed: true,
            templateCode: 'short_answer',
          }),
        ),
      );

      const introduced = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((c) => c instanceof IntroduceCardCommand) as IntroduceCardCommand[];

      expect(introduced).toHaveLength(1);
      expect(introduced[0]!.contentType).toBe('EXERCISE');
      expect(introduced[0]!.contentId).toBe(EXERCISE_ID);
    });
  });

  describe('handleMessage — score-to-rating mapping', () => {
    async function getRating(score: number): Promise<string> {
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();
      await (consumer as any).handleMessage(
        channel,
        makeMsg(envelope({ userId: USER_ID, exerciseId: EXERCISE_ID, score, timeSpentSeconds: 10, completed: true })),
      );
      const reviewCall = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .find((c) => c instanceof ReviewCardCommand) as ReviewCardCommand | undefined;
      return reviewCall?.rating ?? '';
    }

    it('maps score 59 → AGAIN', async () => { expect(await getRating(59)).toBe('AGAIN'); });
    it('maps score 60 → HARD',  async () => { expect(await getRating(60)).toBe('HARD'); });
    it('maps score 79 → HARD',  async () => { expect(await getRating(79)).toBe('HARD'); });
    it('maps score 80 → GOOD',  async () => { expect(await getRating(80)).toBe('GOOD'); });
    it('maps score 94 → GOOD',  async () => { expect(await getRating(94)).toBe('GOOD'); });
    it('maps score 95 → EASY',  async () => { expect(await getRating(95)).toBe('EASY'); });
    it('maps score 100 → EASY', async () => { expect(await getRating(100)).toBe('EASY'); });
  });

  describe('handleMessage — idempotency and error paths', () => {
    it('skips processing and acks on duplicate eventId', async () => {
      const { consumer, commandBus } = makeConsumer({
        processedEvent: {
          findUnique: jest.fn<() => Promise<object>>().mockResolvedValue({ eventId: 'evt-dup' }),
          create: jest.fn(),
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(envelope({ userId: USER_ID, exerciseId: EXERCISE_ID, score: 80, timeSpentSeconds: 10, completed: true }, 'evt-dup')),
      );

      expect(commandBus.execute).not.toHaveBeenCalled();
      expect(channel.ack).toHaveBeenCalledTimes(1);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('nacks without requeue on malformed JSON', async () => {
      const { consumer } = makeConsumer();
      const channel = makeChannel();
      const badMsg = { content: Buffer.from('not-json') } as unknown as ConsumeMessage;

      await (consumer as any).handleMessage(channel, badMsg);

      expect(channel.nack).toHaveBeenCalledWith(badMsg, false, false);
      expect(channel.ack).not.toHaveBeenCalled();
    });

    it('nacks without requeue when an unexpected error occurs', async () => {
      const { consumer } = makeConsumer({
        processedEvent: {
          findUnique: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('DB down')),
          create: jest.fn(),
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(envelope({ userId: USER_ID, exerciseId: EXERCISE_ID, score: 80, timeSpentSeconds: 10, completed: true })),
      );

      expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
      expect(channel.ack).not.toHaveBeenCalled();
    });

    it('fans out SRS rating to vocabulary_item atoms but skips grammar_rule atoms', async () => {
      const VOCAB_CARD_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
      const { consumer, commandBus } = makeConsumer({
        commandBusExecute: (cmd) => {
          if (cmd instanceof IntroduceCardCommand) {
            const cardId = cmd.contentType === 'VOCABULARY_WORD' ? VOCAB_CARD_ID : CARD_ID;
            return Promise.resolve(Result.ok({ id: cardId, state: 'NEW', userId: USER_ID }));
          }
          if (cmd instanceof ReviewCardCommand) {
            return Promise.resolve(Result.ok({ id: cmd.cardId, state: 'REVIEW', userId: USER_ID }));
          }
          return Promise.resolve(Result.ok({}));
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope({
            userId: USER_ID,
            exerciseId: EXERCISE_ID,
            score: 85,
            timeSpentSeconds: 60,
            completed: true,
            practicedAtoms: [
              { atomType: 'vocabulary_item', atomId: 'vocab-1' },
              { atomType: 'grammar_rule', atomId: 'rule-1' },
            ],
          }),
        ),
      );

      const introduceCalls = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((c) => c instanceof IntroduceCardCommand) as IntroduceCardCommand[];
      expect(introduceCalls.some((c) => c.contentType === 'VOCABULARY_WORD' && c.contentId === 'vocab-1')).toBe(true);
      expect(introduceCalls.some((c) => c.contentId === 'rule-1')).toBe(false);

      const reviewCalls = commandBus.execute.mock.calls
        .map((c: unknown[]) => c[0])
        .filter((c) => c instanceof ReviewCardCommand) as ReviewCardCommand[];
      expect(reviewCalls.some((c) => c.cardId === VOCAB_CARD_ID && c.rating === 'GOOD')).toBe(true);
    });

    it('does not review if introduce returned a failure', async () => {
      const { consumer, commandBus } = makeConsumer({
        commandBusExecute: (cmd) => {
          if (cmd instanceof IntroduceCardCommand) {
            return Promise.resolve(Result.fail(new Error('limit reached')));
          }
          return Promise.resolve(Result.ok({}));
        },
      });
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(envelope({ userId: USER_ID, exerciseId: EXERCISE_ID, score: 90, timeSpentSeconds: 20, completed: true })),
      );

      const calls = commandBus.execute.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls.some((c) => c instanceof ReviewCardCommand)).toBe(false);
      expect(channel.ack).toHaveBeenCalledTimes(1);
    });
  });
});

// Plan 63 phase 3 — what a rating is evidence *about* travels with it, so that analytics
// can hold a fact per atom instead of a fact per exercise.
describe('ExerciseAttemptedConsumer — the address on a rating', () => {
  /** Every rated payload the consumer published, in order. */
  function allRated(publisher: { publish: { mock: { calls: unknown[][] } } }) {
    return publisher.publish.mock.calls
      .filter((c) => c[0] === 'learning.attempt.rated')
      .map((c) => c[1] as Record<string, any>);
  }

  const attempt = (over: Record<string, unknown> = {}) => ({
    userId: USER_ID,
    exerciseId: EXERCISE_ID,
    score: 100,
    timeSpentSeconds: 30,
    completed: true,
    templateCode: 'word_bank_gap_fill',
    passed: true,
    modality: 'recall',
    practicedAtoms: [],
    ...over,
  });

  it('hands each gap rating the addresses of that gap', async () => {
    const { consumer, publisher } = makeConsumer();
    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(
        envelope(
          attempt({
            gapResults: [
              {
                gapKey: 's1#5',
                correct: true,
                targets: [{ atomType: 'grammar_rule_atom', atomId: 'atom-1', role: 'focus' }],
              },
              { gapKey: 's2#3', correct: false },
            ],
          }),
        ),
      ),
    );

    const rated = allRated(publisher);
    expect(rated[0]).toMatchObject({
      contentType: 'EXERCISE_GAP',
      itemKey: 's1#5',
      modality: 'recall',
      targets: [{ atomType: 'grammar_rule_atom', atomId: 'atom-1', role: 'focus' }],
    });
    // Nobody addressed the second gap. Absent, not empty: "nobody said" is not the same
    // sentence as "this gap is about nothing".
    expect(rated[1]).toMatchObject({ itemKey: 's2#3', targets: null });
  });

  it('reports the word the fan-out just rated, which nothing did before', async () => {
    // The fan-out has been rating vocabulary cards since plan 21 and publishing nothing,
    // so analytics held no row saying which word came back or how it went.
    const { consumer, publisher } = makeConsumer();
    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(
        envelope(
          attempt({
            practicedAtoms: [{ atomType: 'vocabulary_item', atomId: 'word-1' }],
            targets: [{ atomType: 'vocabulary_item', atomId: 'word-1', role: 'context' }],
          }),
        ),
      ),
    );

    const word = allRated(publisher).find((r) => r.contentType === 'VOCABULARY_WORD');
    expect(word).toMatchObject({
      targets: [{ atomType: 'vocabulary_item', atomId: 'word-1', role: 'context' }],
      itemKey: null,
    });
  });

  it('leaves the role unsaid for an atom no author addressed', async () => {
    // It arrived through the practised-atom graph, which knows the exercise practises the
    // word and nothing about what it was doing there. Calling that `focus` would turn
    // "nobody said" into the strongest evidence the scale has.
    const { consumer, publisher } = makeConsumer();
    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(
        envelope(attempt({ practicedAtoms: [{ atomType: 'vocabulary_item', atomId: 'word-9' }] })),
      ),
    );

    const word = allRated(publisher).find((r) => r.contentType === 'VOCABULARY_WORD');
    expect(word?.targets).toEqual([
      { atomType: 'vocabulary_item', atomId: 'word-9', role: null },
    ]);
  });

  it('marks the exercise-level rating as such, so nothing counts a word as an attempt', async () => {
    const { consumer, publisher } = makeConsumer();
    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(envelope(attempt({ templateCode: 'writing_task' }))),
    );

    expect(allRated(publisher)[0]).toMatchObject({ contentType: 'EXERCISE', itemKey: null });
  });
});

// Plan 63 phase 5 — memory starts moving onto the atom. The grammar cards below are
// written in shadow: rated by the same answers as the cards the learner already has,
// charged to no budget and shown to nobody, so that the two models can be compared
// before the old ones are switched off in phase 7.
describe('ExerciseAttemptedConsumer — grammar atom cards, in shadow', () => {
  function allRated(publisher: { publish: { mock: { calls: unknown[][] } } }) {
    return publisher.publish.mock.calls
      .filter((c) => c[0] === 'learning.attempt.rated')
      .map((c) => c[1] as Record<string, any>);
  }

  const attempt = (over: Record<string, unknown> = {}) => ({
    userId: USER_ID,
    exerciseId: EXERCISE_ID,
    score: 100,
    timeSpentSeconds: 30,
    completed: true,
    templateCode: 'word_bank_gap_fill',
    passed: true,
    modality: 'recall',
    practicedAtoms: [],
    ...over,
  });

  /** Every command of a kind the bus was asked to run, in order. */
  function commandsOf<T>(commandBus: { execute: { mock: { calls: unknown[][] } } }, kind: any): T[] {
    return commandBus.execute.mock.calls.map((c) => c[0]).filter((c) => c instanceof kind) as T[];
  }

  it('opens a card for a grammar atom a gap addressed, and rates it on that gap', async () => {
    const { consumer, commandBus } = makeConsumer();
    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(
        envelope(
          attempt({
            // Chosen from what was on screen, so a wrong answer is a plain lapse — there
            // is no spelling to have slipped on.
            modality: 'recognition',
            gapResults: [
              {
                gapKey: 's1#5',
                correct: false,
                targets: [{ atomType: 'grammar_rule_atom', atomId: 'atom-1', role: 'focus' }],
              },
              { gapKey: 's2#3', correct: true },
            ],
          }),
        ),
      ),
    );

    const introduced = commandsOf<any>(commandBus, IntroduceCardCommand).find(
      (c) => c.contentType === 'GRAMMAR_ATOM',
    );
    expect(introduced).toMatchObject({ contentId: 'atom-1', shadow: true });

    // The gap it was addressed by was wrong, and it is rated on that — not on the
    // attempt, which scored 100 on the rest of the block.
    const review = commandsOf<any>(commandBus, ReviewCardCommand).at(-1);
    expect(review).toMatchObject({ rating: 'AGAIN', shadow: true });
  });

  it('marks the rating GRAMMAR_ATOM, so analytics keeps it out of the attempts table', async () => {
    const { consumer, publisher } = makeConsumer();
    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(
        envelope(
          attempt({
            gapResults: [
              {
                gapKey: 's1#5',
                correct: true,
                targets: [{ atomType: 'grammar_rule_atom', atomId: 'atom-1', role: 'focus' }],
              },
            ],
          }),
        ),
      ),
    );

    expect(allRated(publisher).at(-1)).toMatchObject({
      contentType: 'GRAMMAR_ATOM',
      itemKey: 's1#5',
      modality: 'recall',
      targets: [{ atomType: 'grammar_rule_atom', atomId: 'atom-1', role: 'focus' }],
    });
  });

  it('rates an atom once for an attempt that addressed it twice, keeping the lapse', async () => {
    // Two gaps, one right and one wrong, both pointing at the same rule. One answer must
    // move a card once, and the informative half of it is the failure.
    const { consumer, commandBus } = makeConsumer();
    const target = { atomType: 'grammar_rule_atom', atomId: 'atom-1', role: 'focus' };
    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(
        envelope(
          attempt({
            modality: 'recognition',
            gapResults: [
              { gapKey: 's1#5', correct: true, targets: [target] },
              { gapKey: 's2#3', correct: false, targets: [target] },
            ],
          }),
        ),
      ),
    );

    const grammarIntroductions = commandsOf<any>(commandBus, IntroduceCardCommand).filter(
      (c) => c.contentType === 'GRAMMAR_ATOM',
    );
    expect(grammarIntroductions).toHaveLength(1);
    expect(commandsOf<any>(commandBus, ReviewCardCommand).at(-1)).toMatchObject({
      rating: 'AGAIN',
    });
  });

  it('barely moves a card for an atom the item only needed', async () => {
    const { consumer, commandBus } = makeConsumer();
    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(
        envelope(
          attempt({
            gapResults: [
              {
                gapKey: 's1#5',
                correct: false,
                targets: [{ atomType: 'grammar_rule_atom', atomId: 'atom-1', role: 'context' }],
              },
            ],
          }),
        ),
      ),
    );

    // Failing the gap says nothing about the rule that was merely in the sentence: the
    // lapse belongs to whatever the gap was testing.
    expect(commandsOf<any>(commandBus, ReviewCardCommand).at(-1)).toMatchObject({
      rating: 'HARD',
    });
  });

  it('writes nothing for an exercise no author has addressed', async () => {
    const { consumer, commandBus } = makeConsumer();
    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(envelope(attempt({ gapResults: [{ gapKey: 's1#5', correct: true }] }))),
    );

    expect(
      commandsOf<any>(commandBus, IntroduceCardCommand).filter(
        (c) => c.contentType === 'GRAMMAR_ATOM',
      ),
    ).toHaveLength(0);
  });

  it('rates an addressed word on its own gap rather than on the whole attempt', async () => {
    // The bug this phase fixes: the fan-out rated every word of an exercise with the
    // score of the attempt while the gaps beside them were rated one by one, so a word
    // could be rated GOOD as a gap and AGAIN as a word by the same submission.
    const { consumer, commandBus, publisher } = makeConsumer();
    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(
        envelope(
          attempt({
            score: 90,
            practicedAtoms: [{ atomType: 'vocabulary_item', atomId: 'word-1' }],
            gapResults: [
              {
                gapKey: 's1#5',
                correct: false,
                targets: [{ atomType: 'vocabulary_item', atomId: 'word-1', role: 'focus' }],
              },
              { gapKey: 's2#3', correct: true },
            ],
          }),
        ),
      ),
    );

    const vocabIntroduce = commandsOf<any>(commandBus, IntroduceCardCommand).findIndex(
      (c) => c.contentType === 'VOCABULARY_WORD',
    );
    expect(vocabIntroduce).toBeGreaterThanOrEqual(0);

    // The attempt scored 90 — a GOOD for anything rated on it. The gap that asked for
    // this word was wrong, and typing it wrong is a lapse held off the floor because it
    // may be a misspelling: HARD, on the word's own evidence rather than the block's.
    const word = allRated(publisher).find((r) => r.contentType === 'VOCABULARY_WORD');
    expect(word).toMatchObject({ ratingApplied: 'HARD', itemKey: 's1#5' });
  });

  it('leaves an unaddressed word on the attempt score, which is still the best there is', async () => {
    const { consumer, publisher } = makeConsumer();
    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(
        envelope(
          attempt({
            score: 100,
            practicedAtoms: [{ atomType: 'vocabulary_item', atomId: 'word-9' }],
            gapResults: [{ gapKey: 's1#5', correct: false }],
          }),
        ),
      ),
    );

    const word = allRated(publisher).find((r) => r.contentType === 'VOCABULARY_WORD');
    expect(word).toMatchObject({ itemKey: null });
    expect(word?.targets).toEqual([
      { atomType: 'vocabulary_item', atomId: 'word-9', role: null },
    ]);
  });
});

// Plan 63 phase 9. A probe is a task made for one learner and gone by tomorrow. What it
// proves about an atom is ordinary evidence; what it would say about an *exercise* is a
// pointer to a row that will not exist.
describe('ExerciseAttemptedConsumer — work done on a disposable probe', () => {
  const GRAMMAR_ATOM = 'passive-choice';
  const VOCAB_ATOM = '7d1e2f3a-0000-4000-8000-000000000001';

  function probeEvent(overrides: Record<string, unknown> = {}) {
    return envelope({
      userId: USER_ID,
      exerciseId: EXERCISE_ID,
      score: 100,
      timeSpentSeconds: 40,
      completed: true,
      ephemeral: true,
      modality: 'production',
      templateCode: 'fill_in_blank',
      practicedAtoms: [{ atomType: 'vocabulary_item', atomId: VOCAB_ATOM }],
      targets: [{ atomType: 'grammar_rule_atom', atomId: GRAMMAR_ATOM, role: 'focus' }],
      ...overrides,
    });
  }

  it('writes no progress row', async () => {
    // "Completed 40 exercises" must not count tasks that were thrown away by design.
    const { consumer, commandBus } = makeConsumer();

    await (consumer as any).handleMessage(makeChannel(), makeMsg(probeEvent()));

    const calls = commandBus.execute.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls.some((c) => c instanceof UpsertProgressCommand)).toBe(false);
  });

  it('introduces no card on the probe itself', async () => {
    // A card on a probe would come back due on a task nobody can look up.
    const { consumer, commandBus } = makeConsumer();

    await (consumer as any).handleMessage(makeChannel(), makeMsg(probeEvent()));

    const introduced = commandBus.execute.mock.calls
      .map((c: unknown[]) => c[0])
      .filter((c: unknown): c is IntroduceCardCommand => c instanceof IntroduceCardCommand);

    expect(introduced.some((c) => c.contentType === 'EXERCISE')).toBe(false);
    expect(introduced.some((c) => c.contentId === EXERCISE_ID)).toBe(false);
  });

  it('introduces no card on a probe gap either', async () => {
    const { consumer, commandBus } = makeConsumer();

    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(
        probeEvent({
          gapResults: [
            {
              gapKey: 's1#3',
              correct: true,
              targets: [{ atomType: 'grammar_rule_atom', atomId: GRAMMAR_ATOM, role: 'focus' }],
            },
          ],
        }),
      ),
    );

    const introduced = commandBus.execute.mock.calls
      .map((c: unknown[]) => c[0])
      .filter((c: unknown): c is IntroduceCardCommand => c instanceof IntroduceCardCommand);

    expect(introduced.some((c) => c.contentType === 'EXERCISE_GAP')).toBe(false);
  });

  it('still rates the atoms — which is the only reason a probe is worth answering', async () => {
    const { consumer, commandBus } = makeConsumer();

    await (consumer as any).handleMessage(makeChannel(), makeMsg(probeEvent()));

    const introduced = commandBus.execute.mock.calls
      .map((c: unknown[]) => c[0])
      .filter((c: unknown): c is IntroduceCardCommand => c instanceof IntroduceCardCommand);

    expect(
      introduced.some((c) => c.contentType === 'VOCABULARY_WORD' && c.contentId === VOCAB_ATOM),
    ).toBe(true);
    expect(
      introduced.some((c) => c.contentType === 'GRAMMAR_ATOM' && c.contentId === GRAMMAR_ATOM),
    ).toBe(true);
  });

  it('leaves a catalogue attempt exactly as it was', async () => {
    // The flag is absent on every event published before it existed, and on the
    // overwhelming majority of those after it.
    const { consumer, commandBus } = makeConsumer();

    await (consumer as any).handleMessage(
      makeChannel(),
      makeMsg(probeEvent({ ephemeral: undefined })),
    );

    const calls = commandBus.execute.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls.some((c) => c instanceof UpsertProgressCommand)).toBe(true);
    expect(
      calls
        .filter((c: unknown): c is IntroduceCardCommand => c instanceof IntroduceCardCommand)
        .some((c) => c.contentType === 'EXERCISE'),
    ).toBe(true);
  });
});
