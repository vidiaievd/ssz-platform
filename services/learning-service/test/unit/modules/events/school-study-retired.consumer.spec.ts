import { jest } from '@jest/globals';
import { SchoolStudyRetiredConsumer } from '../../../../src/modules/events/consumers/school-study-retired.consumer.js';
import type { ConsumeMessage } from 'amqplib';

const SCHOOL_ID = '11111111-0000-4000-8000-000000000001';

const msg = (content: unknown, redelivered = false): ConsumeMessage =>
  ({
    content: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)),
    fields: { redelivered },
  }) as unknown as ConsumeMessage;

function setup({ seen = false, suspended = [] as Array<{ user_id: string }> } = {}) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const cleared: Array<{ sql: string; values: unknown[] }> = [];
  const tx = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ sql: strings.join('?'), values });
      return suspended;
    }),
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      cleared.push({ sql: strings.join('?'), values });
      return 0;
    }),
    processedEvent: { create: jest.fn(async (args: unknown) => args) },
  };
  const prisma = {
    processedEvent: {
      findUnique: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue(seen ? { eventId: 'e1' } : null),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const dueQueue = { invalidate: jest.fn(async (_userId: string) => undefined) };
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const consumer = new SchoolStudyRetiredConsumer(
    prisma as never,
    { get: () => undefined } as never,
    dueQueue as never,
  );
  return { prisma, tx, queries, cleared, dueQueue, channel, consumer };
}

const event = (payload: Record<string, unknown>) => ({
  eventId: 'e1',
  payload: { schoolId: SCHOOL_ID, ...payload },
});

describe('SchoolStudyRetiredConsumer (plan 90, Q11)', () => {
  it("suspends exercise, gap and word cards on the school's ids and drops the learners' cached queues", async () => {
    const { tx, queries, dueQueue, channel, consumer } = setup({
      suspended: [{ user_id: 'u1' }, { user_id: 'u1' }, { user_id: 'u2' }],
    });

    await consumer.handleMessage(
      channel,
      msg(event({ exerciseIds: ['ex-1', 'ex-2'], vocabularyItemIds: ['w-1'] })),
    );

    expect(queries).toHaveLength(1);
    const { sql, values } = queries[0];
    expect(sql).toMatch(/SET state = 'suspended'/);
    expect(sql).toMatch(/WHERE state <> 'suspended'/);
    expect(sql).toMatch(/content_type = 'exercise' AND content_id = ANY/);
    expect(sql).toMatch(
      /content_type = 'exercise_gap'\s+AND split_part\(content_id, '#', 1\) = ANY/,
    );
    expect(sql).toMatch(/content_type = 'vocabulary_word' AND content_id = ANY/);
    // Only the state moves: FSRS fields, reps and lapses are never named.
    expect(sql).not.toMatch(/stability|difficulty|reps|lapses|due_at|DELETE/i);
    expect(values).toEqual([['ex-1', 'ex-2'], ['ex-1', 'ex-2'], ['w-1']]);

    expect(tx.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'e1', eventType: 'content.school.study_retired' },
    });
    expect(dueQueue.invalidate.mock.calls.map(([u]) => u)).toEqual(['u1', 'u2']);
    expect(channel.ack).toHaveBeenCalled();
  });

  it("clears the closed school's pause mark, so no restore wakes a purged school's cards", async () => {
    const { cleared, channel, consumer } = setup();
    await consumer.handleMessage(channel, msg(event({ exerciseIds: ['ex-1'] })));
    expect(cleared).toHaveLength(1);
    expect(cleared[0].sql).toMatch(/SET paused_by_school_id = NULL, state_before_pause = NULL/);
    expect(cleared[0].sql).toMatch(/WHERE paused_by_school_id = \?/);
    expect(cleared[0].values).toEqual([SCHOOL_ID]);
    expect(channel.ack).toHaveBeenCalled();
  });

  it('a chunk with words only reads an absent exercise list as empty', async () => {
    const { queries, channel, consumer } = setup();
    await consumer.handleMessage(channel, msg(event({ vocabularyItemIds: ['w-1'] })));
    expect(queries[0].values).toEqual([[], [], ['w-1']]);
    expect(channel.ack).toHaveBeenCalled();
  });

  it('an empty chunk only records the event', async () => {
    const { tx, queries, dueQueue, channel, consumer } = setup();
    await consumer.handleMessage(channel, msg(event({ exerciseIds: [], vocabularyItemIds: [] })));
    expect(queries).toEqual([]);
    expect(tx.processedEvent.create).toHaveBeenCalled();
    expect(dueQueue.invalidate).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
  });

  it('skips an event it has seen', async () => {
    const { prisma, channel, consumer } = setup({ seen: true });
    await consumer.handleMessage(channel, msg(event({ exerciseIds: ['ex-1'] })));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
  });

  it.each([
    ['garbage', 'not json'],
    ['no school id', { eventId: 'e1', payload: { exerciseIds: ['ex-1'] } }],
    ['no event id', { payload: { schoolId: SCHOOL_ID, exerciseIds: ['ex-1'] } }],
    ['ids that are not a list', event({ exerciseIds: 'ex-1' })],
    ['an empty id', event({ exerciseIds: [''] })],
  ])('discards %s without touching a row', async (_label, content) => {
    const { prisma, channel, consumer } = setup();
    await consumer.handleMessage(channel, msg(content));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('requeues once on a database failure, then discards', async () => {
    const { prisma, channel, consumer } = setup();
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    const body = event({ exerciseIds: ['ex-1'] });
    await consumer.handleMessage(channel, msg(body));
    expect(channel.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);
    await consumer.handleMessage(channel, msg(body, true));
    expect(channel.nack).toHaveBeenLastCalledWith(expect.anything(), false, false);
  });
});
