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
      return Promise.resolve(Result.ok({ id: CARD_ID, state: 'NEW', userId: USER_ID }));
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

  return { consumer: new ExerciseAttemptedConsumer(commandBus, prisma, config), commandBus, prisma };
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
