import { jest } from '@jest/globals';
import { SchoolStudyPausedConsumer } from '../../../../src/modules/events/consumers/school-study-paused.consumer.js';
import type { ConsumeMessage } from 'amqplib';

const SCHOOL_ID = '11111111-0000-4000-8000-000000000001';
const PAUSED = 'content.school.study_paused';
const RESUMED = 'content.school.study_resumed';

const msg = (routingKey: string, content: unknown, redelivered = false): ConsumeMessage =>
  ({
    content: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)),
    fields: { redelivered, routingKey },
  }) as unknown as ConsumeMessage;

function setup({ seen = false, changed = [] as Array<{ user_id: string }> } = {}) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const tx = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ sql: strings.join('?'), values });
      return changed;
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
  const consumer = new SchoolStudyPausedConsumer(
    prisma as never,
    { get: () => undefined } as never,
    dueQueue as never,
  );
  return { prisma, tx, queries, dueQueue, channel, consumer };
}

const event = (payload: Record<string, unknown>) => ({
  eventId: 'e1',
  payload: { schoolId: SCHOOL_ID, ...payload },
});

describe('SchoolStudyPausedConsumer (plan 90, live check step 7)', () => {
  it("pauses the school's exercise and gap cards, marking the school and the state they had", async () => {
    const { tx, queries, dueQueue, channel, consumer } = setup({
      changed: [{ user_id: 'u1' }, { user_id: 'u1' }, { user_id: 'u2' }],
    });

    await consumer.handleMessage(channel, msg(PAUSED, event({ exerciseIds: ['ex-1', 'ex-2'] })));

    expect(queries).toHaveLength(1);
    const { sql, values } = queries[0];
    expect(sql).toMatch(/SET state_before_pause = state,\s+state = 'suspended',\s+paused_by_school_id = \?/);
    // A card the learner suspended is not the school's to wake later.
    expect(sql).toMatch(/WHERE state <> 'suspended'/);
    expect(sql).toMatch(/content_type = 'exercise' AND content_id = ANY/);
    expect(sql).toMatch(/content_type = 'exercise_gap'\s+AND split_part\(content_id, '#', 1\) = ANY/);
    // Words keep coming: the engine does not refuse them.
    expect(sql).not.toMatch(/vocabulary_word/);
    expect(sql).not.toMatch(/stability|difficulty|reps|lapses|due_at|DELETE/i);
    expect(values).toEqual([SCHOOL_ID, ['ex-1', 'ex-2'], ['ex-1', 'ex-2']]);

    expect(tx.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'e1', eventType: PAUSED },
    });
    expect(dueQueue.invalidate.mock.calls.map(([u]) => u)).toEqual(['u1', 'u2']);
    expect(channel.ack).toHaveBeenCalled();
  });

  it('resumes only the cards marked with the school, back to the state they had', async () => {
    const { queries, dueQueue, channel, consumer } = setup({ changed: [{ user_id: 'u1' }] });

    await consumer.handleMessage(channel, msg(RESUMED, event({})));

    expect(queries).toHaveLength(1);
    const { sql, values } = queries[0];
    expect(sql).toMatch(/SET state = COALESCE\(state_before_pause, 'review'::srs_card_state\)/);
    expect(sql).toMatch(/paused_by_school_id = NULL,\s+state_before_pause = NULL/);
    expect(sql).toMatch(/WHERE paused_by_school_id = \?\s+AND state = 'suspended'/);
    expect(sql).not.toMatch(/stability|difficulty|reps|lapses|due_at|DELETE/i);
    expect(values).toEqual([SCHOOL_ID]);
    expect(dueQueue.invalidate.mock.calls.map(([u]) => u)).toEqual(['u1']);
    expect(channel.ack).toHaveBeenCalled();
  });

  it('an empty pause chunk only records the event', async () => {
    const { tx, queries, dueQueue, channel, consumer } = setup();
    await consumer.handleMessage(channel, msg(PAUSED, event({ exerciseIds: [] })));
    expect(queries).toEqual([]);
    expect(tx.processedEvent.create).toHaveBeenCalled();
    expect(dueQueue.invalidate).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
  });

  it('skips an event it has seen', async () => {
    const { prisma, channel, consumer } = setup({ seen: true });
    await consumer.handleMessage(channel, msg(PAUSED, event({ exerciseIds: ['ex-1'] })));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
  });

  it.each([
    ['garbage', PAUSED, 'not json'],
    ['no school id', PAUSED, { eventId: 'e1', payload: { exerciseIds: ['ex-1'] } }],
    ['no event id', RESUMED, { payload: { schoolId: SCHOOL_ID } }],
    ['ids that are not a list', PAUSED, event({ exerciseIds: 'ex-1' })],
    ['an empty id', PAUSED, event({ exerciseIds: [''] })],
    ['a foreign routing key', 'content.school.study_retired', event({ exerciseIds: ['ex-1'] })],
  ])('discards %s without touching a row', async (_label, key, content) => {
    const { prisma, channel, consumer } = setup();
    await consumer.handleMessage(channel, msg(key, content));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('requeues once on a database failure, then discards', async () => {
    const { prisma, channel, consumer } = setup();
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    const body = event({ exerciseIds: ['ex-1'] });
    await consumer.handleMessage(channel, msg(PAUSED, body));
    expect(channel.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);
    await consumer.handleMessage(channel, msg(PAUSED, body, true));
    expect(channel.nack).toHaveBeenLastCalledWith(expect.anything(), false, false);
  });
});
