import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { GetGroupProgressHandler } = await import(
  '../../../../src/modules/group-analytics/queries/get-group-progress.handler.js'
);
const { GetGroupProgressQuery } = await import(
  '../../../../src/modules/group-analytics/queries/get-group-progress.query.js'
);
const { GroupUnitsService } = await import(
  '../../../../src/modules/group-analytics/group-units.service.js'
);

const GROUP = 'g1';
const SCHOOL = 's1';
const COURSE = 'c1';
const VIEWER = 'teacher';

const UNITS = [
  { unitId: 'u1', no: 1, title: 'Leksjon 17', itemIds: ['i1', 'i2'], items: 2 },
  { unitId: 'u2', no: 2, title: 'Leksjon 18', itemIds: ['i3', 'i4'], items: 2 },
];

interface Options {
  courseId?: string | null;
  roster?: string[];
  units?: typeof UNITS;
  absorbed?: Record<string, Record<string, { passed: number; touched: boolean }>>;
  evidence?: Record<string, Record<string, { attempts: number; weightedSample: number; successWeight: number }>>;
  delivery?: unknown;
  attempts?: unknown[];
}

function handlerFor(options: Options = {}) {
  const roster = options.roster ?? ['anna', 'bjorn'];
  const units = options.units ?? UNITS;

  const prisma = {
    groupDirectory: {
      findUnique: async () => ({
        groupId: GROUP,
        schoolId: SCHOOL,
        courseId: options.courseId === undefined ? COURSE : options.courseId,
        updatedAt: new Date('2026-09-01T00:00:00Z'),
      }),
    },
    schoolMembership: { findUnique: async () => ({ schoolId: SCHOOL, userId: VIEWER }) },
    groupMembership: { findMany: async () => roster.map((userId) => ({ userId })) },
    attemptEvidence: {
      findMany: async () => options.attempts ?? [],
      findFirst: async () => null,
    },
    itemProgress: { findFirst: async () => null },
    courseOutlineItem: { findFirst: async () => null },
  };

  const unitsService = {
    unitsOf: async () => units,
    absorbedByUnit: async () =>
      new Map(
        units.map((unit) => [
          unit.unitId,
          new Map(Object.entries(options.absorbed?.[unit.unitId] ?? {})),
        ]),
      ),
    deliveryOf: (groupId: string) => folding.deliveryOf(groupId),
    evidenceByUnit: async () =>
      new Map(
        units.map((unit) => [
          unit.unitId,
          {
            byLearner: new Map(Object.entries(options.evidence?.[unit.unitId] ?? {})),
            attempts: 0,
            weightedSample: 0,
            successWeight: 0,
          },
        ]),
      ),
  };

  // The folding of plan units onto course units is the service's, not the handler's, so
  // the stub delegates to the real one rather than restating it — the suite would
  // otherwise pass against a fold nobody ships.
  const folding = new GroupUnitsService(null as never, null as never, {
    getGroupDelivery: async () => options.delivery ?? null,
  } as never);
  const config = {
    get: (key: string) =>
      key === 'mastery'
        ? { minWeightedSample: 8 }
        : { minLearnersPerUnit: 1, workContextSplitFrom: '2026-09-04' },
  };

  return new GetGroupProgressHandler(prisma as never, unitsService as never, config as never);
}

const query = new GetGroupProgressQuery(GROUP, VIEWER);

function deliveryOf(units: Array<Record<string, unknown>>, held = 4, planned = 8) {
  return { groupId: GROUP, planId: 'p1', lessonsHeld: held, lessonsPlanned: planned, units };
}

describe('a group with no course', () => {
  it('says so, and invents no units', async () => {
    const result = await handlerFor({ courseId: null, units: [] }).execute(query);

    expect(result.courseId).toBeNull();
    expect(result.units).toEqual([]);
    expect(result.summary.absorbedMedian).toBeNull();
  });
});

describe('the timetable could not be asked', () => {
  it('leaves delivered null rather than calling every unit untaught', async () => {
    const result = await handlerFor({ delivery: null }).execute(query);

    expect(result.deliveryUnavailable).toBe(true);
    expect(result.units.map((unit) => unit.delivered)).toEqual([null, null]);
    // The state the missing answer must never produce.
    expect(result.units.map((unit) => unit.state)).not.toContain('notDelivered');
  });
});

describe('a unit nobody has been taught', () => {
  it('is notDelivered, and its absorbed is null — not zero', async () => {
    const result = await handlerFor({
      delivery: deliveryOf([
        {
          curriculumUnitId: 'p-u1',
          title: 'Leksjon 17',
          order: 1,
          plannedSessions: 2,
          contentUnitId: 'u1',
          lessonsHeld: 2,
          lastHeldAt: '2026-09-05T00:00:00.000Z',
        },
        {
          curriculumUnitId: 'p-u2',
          title: 'Leksjon 18',
          order: 2,
          plannedSessions: 2,
          contentUnitId: 'u2',
          lessonsHeld: 0,
          lastHeldAt: null,
        },
      ]),
      absorbed: { u1: { anna: { passed: 2, touched: true }, bjorn: { passed: 1, touched: true } } },
    }).execute(query);

    const [taught, untaught] = result.units;
    expect(taught?.delivered).toEqual({
      value: 1,
      lessons: 2,
      lastHeldAt: '2026-09-05T00:00:00.000Z',
      linked: true,
    });
    expect(taught?.state).toBe('ok');
    expect(taught?.absorbed).toEqual({ median: 75, p25: 63, p75: 88, n: 2 });

    expect(untaught?.delivered?.value).toBe(0);
    expect(untaught?.state).toBe('notDelivered');
    expect(untaught?.absorbed).toBeNull();
  });

  it('counts a unit part-taught as a half, not as done or as nothing', async () => {
    const result = await handlerFor({
      delivery: deliveryOf([
        {
          curriculumUnitId: 'p-u1',
          title: 'Leksjon 17',
          order: 1,
          plannedSessions: 3,
          contentUnitId: 'u1',
          lessonsHeld: 1,
          lastHeldAt: '2026-09-05T00:00:00.000Z',
        },
      ]),
    }).execute(query);

    expect(result.units[0]?.delivered?.value).toBe(0.5);
    expect(result.summary.deliveredUnits).toBe(0);
  });
});

describe('a unit that was taught and nobody has touched', () => {
  it('is notStarted, which is not a result of zero', async () => {
    const result = await handlerFor({
      delivery: deliveryOf([
        {
          curriculumUnitId: 'p-u1',
          title: 'Leksjon 17',
          order: 1,
          plannedSessions: 1,
          contentUnitId: 'u1',
          lessonsHeld: 1,
          lastHeldAt: '2026-09-05T00:00:00.000Z',
        },
      ]),
      absorbed: { u1: { anna: { passed: 0, touched: false } } },
    }).execute(query);

    expect(result.units[0]?.state).toBe('notStarted');
    expect(result.units[0]?.absorbed).toBeNull();
    expect(result.units[0]?.quality).toBeNull();
  });
});

describe('a plan unit stitched to nothing', () => {
  it('is listed rather than dropped, and leaves its course unit unlinked', async () => {
    const result = await handlerFor({
      delivery: deliveryOf([
        {
          curriculumUnitId: 'p-x',
          title: 'Repetisjon',
          order: 1,
          plannedSessions: 1,
          contentUnitId: null,
          lessonsHeld: 1,
          lastHeldAt: '2026-09-05T00:00:00.000Z',
        },
      ]),
    }).execute(query);

    expect(result.unlinkedPlanUnits).toEqual([
      {
        curriculumUnitId: 'p-x',
        title: 'Repetisjon',
        lessons: 1,
        lastHeldAt: '2026-09-05T00:00:00.000Z',
      },
    ]);
    expect(result.units.every((unit) => unit.delivered?.linked === false)).toBe(true);
  });
});

describe('cells nobody can judge', () => {
  it('counts learner × unit cells under the weighted threshold', async () => {
    const result = await handlerFor({
      absorbed: {
        u1: { anna: { passed: 1, touched: true }, bjorn: { passed: 2, touched: true } },
      },
      evidence: {
        u1: {
          anna: { attempts: 3, weightedSample: 2.5, successWeight: 2 },
          bjorn: { attempts: 20, weightedSample: 12, successWeight: 9 },
        },
      },
    }).execute(query);

    // Anna only; Bjorn cleared the bar, and the untouched second unit is `notStarted`,
    // which is a different sentence from "we cannot judge this".
    expect(result.summary.notJudgeable).toBe(1);
    expect(result.minWeightedSample).toBe(8);
  });

  it('calls a unit a learner only read unjudged, never unstarted', async () => {
    const result = await handlerFor({
      // Touched and passed, with no gradeable attempt behind it: a lesson that was read.
      absorbed: { u1: { anna: { passed: 2, touched: true } } },
    }).execute(query);

    // The share is exact — two items of two — but nothing gradeable stands behind it, so
    // the cell is hatched rather than green. What it must never be is `notStarted`: the
    // reading happened, and that is the counter that would deny it.
    expect(result.units[0].absorbed?.median).toBe(100);
    expect(result.summary.notJudgeable).toBe(1);
  });
});

describe('work context', () => {
  const attempt = (userId: string, workContext: string | null, passed: boolean) => ({
    userId,
    workContext,
    passed,
    ratingApplied: passed ? 'GOOD' : 'AGAIN',
    answerMode: 'free',
    bankSize: null,
    wordsConsumed: false,
    templateCode: 'gap_fill',
    gapPosition: null,
  });

  it('keeps all four buckets, classwork empty and unsaid apart from self study', async () => {
    const result = await handlerFor({
      attempts: [
        attempt('anna', 'homework', true),
        attempt('anna', 'homework', false),
        attempt('bjorn', 'self_study', true),
        attempt('bjorn', null, true),
      ],
    }).execute(query);

    expect(result.workContext.map((bucket) => bucket.key)).toEqual([
      'homework',
      'self_study',
      'classwork',
      null,
    ]);

    const byKey = new Map(result.workContext.map((bucket) => [bucket.key, bucket]));
    expect(byKey.get('homework')?.attempts).toBe(2);
    expect(byKey.get('self_study')?.attempts).toBe(1);
    // Present and empty on purpose: nothing records it yet, and a missing bucket would
    // read as "this group never works in class".
    expect(byKey.get('classwork')).toEqual({ key: 'classwork', attempts: 0, share: 0, median: null });
    // An attempt that never said where it was done is its own answer, not self study.
    expect(byKey.get(null)?.attempts).toBe(1);
    expect(result.workContextSplitFrom).toBe('2026-09-04');
  });

  it('leaves every bucket at null median when there is nothing to measure', async () => {
    const result = await handlerFor({ attempts: [] }).execute(query);
    expect(result.workContext.every((bucket) => bucket.median === null)).toBe(true);
  });
});

describe('authorization', () => {
  it('is a not-found, not a forbidden, for a viewer outside the school', async () => {
    const handler = handlerFor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handler as any).prisma.schoolMembership.findUnique = async () => null;

    await expect(handler.execute(query)).rejects.toThrow('Group not found');
  });
});
