import { jest } from '@jest/globals';

// Same reason as the mastery projector's suite: importing the service pulls in
// `PrismaService`, and with it the generated client, whose `import.meta` brings the run
// down under jest.
jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { CourseOutlineService } = await import(
  '../../../../src/modules/projections/course-outline.service.js'
);

interface Row {
  containerId: string;
  versionId: string;
  unitId: string;
  unitOrder: number;
  unitTitle: string | null;
  itemId: string;
  itemType: string;
  position: number;
  refreshedAt: Date;
}

/**
 * Enough Postgres to hold rows and run the two-statement replacement as one step.
 *
 * `$transaction` runs what it is handed, in order, which is all the service asks of it —
 * the property under test is that a delete is never left standing without the insert that
 * follows it.
 */
function fakePrisma(seed: Row[] = []) {
  let rows: Row[] = [...seed];

  /**
   * A statement that runs when it is awaited, and not before — which is what a real
   * `PrismaPromise` is, and the reason the same call can be handed to `$transaction`
   * unexecuted or awaited on its own. A fake that ran eagerly would pass a version of
   * this service that deletes rows outside the transaction.
   */
  const lazy = (run: () => void): PromiseLike<void> => ({
    then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
  });

  return {
    rows: () => rows,
    prisma: {
      courseOutlineItem: {
        findFirst: async ({ where }: { where: { containerId: string } }) => {
          const matching = rows
            .filter((r) => r.containerId === where.containerId)
            .sort((a, b) => b.refreshedAt.getTime() - a.refreshedAt.getTime());
          return matching[0] ?? null;
        },
        deleteMany: ({ where }: { where: { containerId: string } }) =>
          lazy(() => {
            rows = rows.filter((r) => r.containerId !== where.containerId);
          }),
        createMany: ({ data }: { data: Row[] }) =>
          lazy(() => {
            rows.push(...data);
          }),
      },
      $transaction: async (steps: Array<PromiseLike<void>>) => {
        for (const step of steps) await step;
      },
    },
  };
}

const outline = {
  containerId: 'c-1',
  versionId: 'v-2',
  units: [
    {
      id: 'u-1',
      title: 'Leksjon 17',
      order: 1,
      items: [
        { id: 'i-1', itemType: 'lesson', position: 1 },
        { id: 'i-2', itemType: 'EXERCISE', position: 2 },
      ],
    },
    { id: 'u-2', title: 'Leksjon 18', order: 2, items: [{ id: 'i-3', itemType: 'LESSON', position: 1 }] },
  ],
};

const contentReturning = (value: unknown) => ({
  getCourseOutline: jest.fn(async () => value),
});

const stored = (over: Partial<Row> = {}): Row => ({
  containerId: 'c-1',
  versionId: 'v-1',
  unitId: 'u-old',
  unitOrder: 1,
  unitTitle: 'Old',
  itemId: 'i-old',
  itemType: 'LESSON',
  position: 1,
  refreshedAt: new Date('2026-09-01T00:00:00Z'),
  ...over,
});

describe('CourseOutlineService', () => {
  it('flattens the published outline into item rows, normalising the item type', () => {
    const db = fakePrisma();
    const service = new (CourseOutlineService as any)(db.prisma, contentReturning(outline));

    return service.refresh('c-1').then(() => {
      expect(db.rows()).toHaveLength(3);
      expect(db.rows().map((r) => r.itemType)).toEqual(['LESSON', 'EXERCISE', 'LESSON']);
      expect(db.rows().find((r) => r.itemId === 'i-3')).toMatchObject({
        unitId: 'u-2',
        unitOrder: 2,
        versionId: 'v-2',
      });
    });
  });

  it('replaces the previous version instead of adding to it', async () => {
    // Two versions in the table would double every unit's item count, and the count is a
    // denominator — the group's chart would read half of what it should.
    const db = fakePrisma([stored()]);
    const service = new (CourseOutlineService as any)(db.prisma, contentReturning(outline));

    await service.refresh('c-1');

    expect(db.rows().some((r) => r.versionId === 'v-1')).toBe(false);
    expect(db.rows()).toHaveLength(3);
  });

  it('keeps what it has when content-service cannot be reached', async () => {
    // Unreachable is not evidence that a course has no units. Clearing here would empty
    // every group's progress screen for the length of a deploy.
    const db = fakePrisma([stored()]);
    const service = new (CourseOutlineService as any)(db.prisma, contentReturning(null));

    await service.refresh('c-1');

    expect(db.rows()).toHaveLength(1);
  });

  it('clears the outline when the course has nothing published', async () => {
    // A withdrawn version is a real answer: there is nothing a group could be taught from.
    const db = fakePrisma([stored()]);
    const service = new (CourseOutlineService as any)(
      db.prisma,
      contentReturning({ containerId: 'c-1', versionId: null, units: [] }),
    );

    await service.refresh('c-1');

    expect(db.rows()).toHaveLength(0);
  });

  it('fills a course in on first read, and leaves a fresh one alone', async () => {
    const empty = fakePrisma();
    const emptyContent = contentReturning(outline);
    await new (CourseOutlineService as any)(empty.prisma, emptyContent).ensureFresh('c-1');
    expect(emptyContent.getCourseOutline).toHaveBeenCalledTimes(1);

    const fresh = fakePrisma([stored({ refreshedAt: new Date() })]);
    const freshContent = contentReturning(outline);
    await new (CourseOutlineService as any)(fresh.prisma, freshContent).ensureFresh('c-1');
    expect(freshContent.getCourseOutline).not.toHaveBeenCalled();
  });

  it('asks again once what it stored has gone stale', async () => {
    const old = fakePrisma([stored({ refreshedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) })]);
    const content = contentReturning(outline);

    await new (CourseOutlineService as any)(old.prisma, content).ensureFresh('c-1');

    expect(content.getCourseOutline).toHaveBeenCalledTimes(1);
  });
});
