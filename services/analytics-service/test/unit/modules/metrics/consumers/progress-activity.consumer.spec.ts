import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { ProgressActivityConsumer } = await import(
  '../../../../../src/modules/metrics/consumers/progress-activity.consumer.js'
);

interface ProgressRow {
  userId: string;
  contentType: string;
  contentId: string;
  status: string;
  updatedAt: Date;
}

/** `item_progress` and the activity log beside it, with nothing else of Postgres. */
function fakePrisma() {
  const items = new Map<string, ProgressRow>();
  const activity: Array<{ kind: string; contentId: string }> = [];
  const key = (r: { userId: string; contentType: string; contentId: string }) =>
    `${r.userId}|${r.contentType}|${r.contentId}`;

  return {
    items,
    activity,
    prisma: {
      progressActivity: {
        create: async ({ data }: { data: { kind: string; contentId: string } }) => {
          activity.push({ kind: data.kind, contentId: data.contentId });
        },
      },
      itemProgress: {
        findUnique: async ({
          where,
        }: {
          where: { userId_contentType_contentId: ProgressRow };
        }) => items.get(key(where.userId_contentType_contentId)) ?? null,
        upsert: async ({
          where,
          create,
          update,
        }: {
          where: { userId_contentType_contentId: ProgressRow };
          create: ProgressRow;
          update: { status: string; updatedAt: Date };
        }) => {
          const id = key(where.userId_contentType_contentId);
          const known = items.get(id);
          items.set(id, known ? { ...known, ...update } : create);
        },
      },
    },
  };
}

const consumerOn = (prisma: unknown) =>
  new (ProgressActivityConsumer as any)({ get: () => undefined }, prisma);

const updated = (status: string, at: string) => [
  'learning.progress.updated',
  { userId: 'u-1', contentType: 'EXERCISE', contentId: 'i-1', status, attemptsCount: 1, score: null },
  at,
];

describe('ProgressActivityConsumer — item_progress', () => {
  it('records the current state beside the activity log, not instead of it', async () => {
    const db = fakePrisma();
    const consumer = consumerOn(db.prisma);

    await (consumer as any).applyEvent(...updated('IN_PROGRESS', '2026-09-10T10:00:00Z'));

    expect(db.activity).toEqual([{ kind: 'updated', contentId: 'i-1' }]);
    expect([...db.items.values()][0]).toMatchObject({ status: 'IN_PROGRESS' });
  });

  it('does not let a redelivered older event undo a newer one', async () => {
    // The guard exists for restarts: an `IN_PROGRESS` arriving after the `COMPLETED` it
    // preceded would silently subtract an item from the learner's unit.
    const db = fakePrisma();
    const consumer = consumerOn(db.prisma);

    await (consumer as any).applyEvent(
      'learning.progress.completed',
      { userId: 'u-1', contentType: 'EXERCISE', contentId: 'i-1', completedAt: '2026-09-10T12:00:00Z', score: 90 },
      '2026-09-10T12:00:00Z',
    );
    await (consumer as any).applyEvent(...updated('IN_PROGRESS', '2026-09-10T10:00:00Z'));

    expect([...db.items.values()][0]).toMatchObject({ status: 'COMPLETED' });
  });

  it('moves an item forward when the newer event says so', async () => {
    const db = fakePrisma();
    const consumer = consumerOn(db.prisma);

    await (consumer as any).applyEvent(...updated('IN_PROGRESS', '2026-09-10T10:00:00Z'));
    await (consumer as any).applyEvent(
      'learning.progress.completed',
      { userId: 'u-1', contentType: 'EXERCISE', contentId: 'i-1', completedAt: '2026-09-10T12:00:00Z', score: 90 },
      '2026-09-10T12:00:00Z',
    );

    expect([...db.items.values()][0]).toMatchObject({ status: 'COMPLETED' });
  });

  it('keeps "waiting for a teacher" out of the passed count', async () => {
    // `NEEDS_REVIEW` is stored as itself: the work is with a reviewer, and phase 2 counts
    // only `COMPLETED` as absorbed.
    const db = fakePrisma();
    const consumer = consumerOn(db.prisma);

    await (consumer as any).applyEvent(...updated('NEEDS_REVIEW', '2026-09-10T10:00:00Z'));

    expect([...db.items.values()][0]).toMatchObject({ status: 'NEEDS_REVIEW' });
  });
});
