import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { GetStudentPositionHandler } = await import(
  '../../../../src/modules/student-analytics/queries/get-student-position.handler.js'
);
const { GetStudentPositionQuery } = await import(
  '../../../../src/modules/student-analytics/queries/student-analytics.queries.js'
);

const GROUP = 'g1';
const COURSE = 'c1';
const VIEWER = 'teacher';

const UNITS = [
  { unitId: 'u1', no: 1, title: 'Leksjon 17', itemIds: ['i1', 'i2', 'i3', 'i4'], items: 4 },
];

interface Options {
  courseId?: string | null;
  roster?: string[];
  inGroup?: boolean;
  units?: typeof UNITS;
  /** unitId → userId → passed items. Absent means the learner never touched the unit. */
  absorbed?: Record<string, Record<string, number>>;
}

function handlerFor(options: Options = {}) {
  const roster = options.roster ?? ['anna', 'bjorn', 'cecilie', 'dag'];
  const units = options.units ?? UNITS;

  const prisma = {
    groupDirectory: {
      findUnique: async () => ({
        groupId: GROUP,
        schoolId: 's1',
        courseId: options.courseId === undefined ? COURSE : options.courseId,
      }),
    },
    groupMembership: {
      findFirst: async () => (options.inGroup === false ? null : { userId: 'anna' }),
      findMany: async () => roster.map((userId) => ({ userId })),
    },
  };

  const unitsService = {
    unitsOf: async () => units,
    // No timetable: every unit counts, which is what makes the fixture about absorption.
    deliveryOf: async () => null,
    absorbedByUnit: async () =>
      new Map(
        units.map((unit) => [
          unit.unitId,
          new Map(
            Object.entries(options.absorbed?.[unit.unitId] ?? {}).map(([userId, passed]) => [
              userId,
              { passed, touched: true },
            ]),
          ),
        ]),
      ),
  };

  const access = { assertMayRead: async () => undefined };

  return new GetStudentPositionHandler(prisma as never, access as never, unitsService as never);
}

const query = new GetStudentPositionQuery('anna', VIEWER, GROUP);

describe('a position nobody can state', () => {
  it('answers null for a learner with nothing measured, not a zero', async () => {
    const result = await handlerFor({ absorbed: { u1: { bjorn: 4 } } }).execute(query);

    expect(result).toBeNull();
  });

  it('answers null for a group that teaches no course', async () => {
    expect(await handlerFor({ courseId: null }).execute(query)).toBeNull();
  });

  it('refuses a learner who is not in the group', async () => {
    await expect(handlerFor({ inGroup: false }).execute(query)).rejects.toThrow(
      'Student is not in this group',
    );
  });
});

describe('a position against the group', () => {
  const absorbed = { u1: { anna: 3, bjorn: 1, cecilie: 2, dag: 4 } };

  it('reports the learner and the group median in whole percent', async () => {
    const result = await handlerFor({ absorbed }).execute(query);

    expect(result?.own).toBe(75);
    // 25, 50, 75, 100 → median 62.5, rounded once on the way out.
    expect(result?.groupMedian).toBe(63);
    expect(result?.measured).toBe(4);
  });

  it('counts who is below without naming anybody', async () => {
    const result = await handlerFor({ absorbed }).execute(query);

    expect(result?.lowerThan).toBe(2);
    expect(JSON.stringify(result)).not.toContain('bjorn');
  });

  it('turns the percentile into a band wide enough to survive one homework', async () => {
    const result = await handlerFor({ absorbed }).execute(query);

    // Ahead of two classmates out of three, and still called "middle": the bands are
    // deliberately wide, so the sentence a learner reads does not flip on one homework.
    expect(result?.percentile).toBe(67);
    expect(result?.band).toBe('middle');
  });

  it('puts a learner with no measured classmates in the middle, not at the top', async () => {
    const result = await handlerFor({ absorbed: { u1: { anna: 1 } } }).execute(query);

    expect(result?.own).toBe(25);
    expect(result?.lowerThan).toBe(0);
    expect(result?.band).toBe('middle');
  });
});
