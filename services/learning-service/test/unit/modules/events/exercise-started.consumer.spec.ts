import { jest } from '@jest/globals';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { ExerciseStartedConsumer } from '../../../../src/modules/events/consumers/exercise-started.consumer.js';
import { UpsertProgressCommand } from '../../../../src/modules/progress/application/commands/upsert-progress.command.js';
import { Result } from '../../../../src/shared/kernel/result.js';

const USER_ID = 'c3254eb9-3fb3-4559-9dbf-2cea12f40ed5';
const EXERCISE_ID = 'eeeeeeee-0000-4000-8000-000000000001';

function makeMsg(content: unknown): ConsumeMessage {
  return { content: Buffer.from(JSON.stringify(content)) } as unknown as ConsumeMessage;
}

function makeChannel() {
  return { ack: jest.fn(), nack: jest.fn() } as unknown as ConfirmChannel & {
    ack: jest.Mock;
    nack: jest.Mock;
  };
}

function makeConsumer(seen = false) {
  const prisma = {
    processedEvent: {
      findUnique: jest.fn<() => Promise<object | null>>().mockResolvedValue(seen ? { eventId: 'evt-1' } : null),
      create: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
  } as any;
  const config = { get: jest.fn().mockReturnValue(undefined) } as any;
  const commandBus = { execute: jest.fn<() => Promise<unknown>>().mockResolvedValue(Result.ok({})) } as any;
  return { consumer: new ExerciseStartedConsumer(prisma, config, commandBus), prisma, commandBus };
}

const envelope = (payload: Record<string, unknown>) => ({
  eventId: 'evt-1',
  eventType: 'exercise.attempt.started',
  payload: {
    attemptId: 'att-1',
    userId: USER_ID,
    exerciseId: EXERCISE_ID,
    templateCode: 'read_aloud',
    targetLanguage: 'nb',
    assignmentId: null,
    enrollmentId: null,
    ...payload,
  },
});

describe('ExerciseStartedConsumer (plan 90, Q18)', () => {
  it('marks the exercise as started for the learner', async () => {
    const { consumer, prisma, commandBus } = makeConsumer();
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope({ ephemeral: false })));

    expect(commandBus.execute).toHaveBeenCalledWith(
      new UpsertProgressCommand(USER_ID, 'EXERCISE', EXERCISE_ID, 0, null, false, undefined, 'started'),
    );
    expect(prisma.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', eventType: 'exercise.attempt.started' },
    });
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('keeps no progress for a disposable probe', async () => {
    const { consumer, commandBus, prisma } = makeConsumer();
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope({ ephemeral: true })));

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(prisma.processedEvent.create).toHaveBeenCalledTimes(1);
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('leaves an event from an older engine (no ephemeral flag) alone', async () => {
    const { consumer, commandBus } = makeConsumer();
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope({})));

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('skips a redelivered event', async () => {
    const { consumer, commandBus } = makeConsumer(true);
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope({ ephemeral: false })));

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('drops a message it cannot handle without requeueing it', async () => {
    const { consumer, commandBus } = makeConsumer();
    commandBus.execute.mockRejectedValue(new Error('db down'));
    const channel = makeChannel();

    await (consumer as any).handleMessage(channel, makeMsg(envelope({ ephemeral: false })));

    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
