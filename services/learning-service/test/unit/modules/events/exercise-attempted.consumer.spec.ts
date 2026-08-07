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
      });
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
      const { consumer, commandBus } = makeConsumer();
      const channel = makeChannel();

      await (consumer as any).handleMessage(
        channel,
        makeMsg(
          envelope(
            blockAttempt({ answerForm: { mode: 'bank', bankSize: 6, wordsConsumed: true } }),
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
