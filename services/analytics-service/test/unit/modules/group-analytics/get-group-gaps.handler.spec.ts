import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { GetGroupGapsHandler } = await import(
  '../../../../src/modules/group-analytics/queries/get-group-gaps.handler.js'
);
const { GetGroupGapsQuery } = await import(
  '../../../../src/modules/group-analytics/queries/get-group-gaps.query.js'
);
const { GroupUnitsService } = await import(
  '../../../../src/modules/group-analytics/group-units.service.js'
);

const SCHOOL = 's1';
const VIEWER = 'admin';
const COURSE = 'c1';

const UNITS = [
  { unitId: 'u1', no: 1, title: 'Leksjon 17', itemIds: ['i1', 'i2'], items: 2 },
  { unitId: 'u2', no: 2, title: 'Leksjon 18', itemIds: ['i3', 'i4'], items: 2 },
];

type Group = { groupId: string; name: string; courseId: string | null };

interface Options {
  groups?: Group[];
  roster?: Record<string, string[]>;
  /** unitId → userId → what that learner did with it. */
  absorbed?: Record<string, Record<string, { passed: number; touched: boolean }>>;
  delivery?: unknown;
  member?: boolean;
  titles?: Record<string, string>;
}

/** Two plan units, each naming one course unit, both taught in full. */
function deliveryOf(taught: Array<{ unit: string; lessons: number }>) {
  return {
    groupId: 'g1',
    planId: 'p1',
    lessonsHeld: taught.length,
    lessonsPlanned: 2,
    units: taught.map((row, index) => ({
      curriculumUnitId: `p-${row.unit}`,
      title: row.unit,
      order: index + 1,
      plannedSessions: 1,
      contentUnitId: row.unit,
      lessonsHeld: row.lessons,
      lessonsPlanned: 1,
      lastHeldAt: '2026-09-01T00:00:00.000Z',
    })),
  };
}

function handlerFor(options: Options = {}) {
  const groups = options.groups ?? [{ groupId: 'g1', name: 'A2 morning', courseId: COURSE }];
  const roster = options.roster ?? { g1: ['anna', 'bjorn'] };

  const prisma = {
    schoolMembership: {
      findUnique: async () =>
        options.member === false ? null : { schoolId: SCHOOL, userId: VIEWER },
    },
    groupDirectory: {
      findMany: async () =>
        groups.map((group) => ({ ...group, schoolId: SCHOOL, updatedAt: new Date('2026-09-01T00:00:00Z') })),
    },
    groupMembership: {
      findMany: async () =>
        Object.entries(roster).flatMap(([groupId, userIds]) =>
          userIds.map((userId) => ({ groupId, userId })),
        ),
    },
    containerDirectory: {
      findMany: async () =>
        Object.entries(options.titles ?? { [COURSE]: 'Ny i Norge A2' }).map(
          ([containerId, title]) => ({ containerId, title }),
        ),
    },
  };

  // The fold of plan units onto course units belongs to the service; the stub delegates
  // to the real one so the suite cannot pass against a fold nobody ships.
  const folding = new GroupUnitsService(null as never, null as never, {
    getGroupDelivery: async () => options.delivery ?? null,
  } as never);

  const units = {
    unitsOf: async () => UNITS,
    deliveryOf: (groupId: string) => folding.deliveryOf(groupId),
    absorbedByUnit: async () =>
      new Map(
        UNITS.map((unit) => [
          unit.unitId,
          new Map(Object.entries(options.absorbed?.[unit.unitId] ?? {})),
        ]),
      ),
  };

  return new GetGroupGapsHandler(prisma as never, units as never);
}

const query = new GetGroupGapsQuery(SCHOOL, VIEWER);

describe('who may read it', () => {
  it('answers a non-member the same way it answers about a school that does not exist', async () => {
    await expect(handlerFor({ member: false }).execute(query)).rejects.toThrow('School not found');
  });
});

describe('a group with no course', () => {
  it('is noCourse with no numbers at all — not a group taught nothing', async () => {
    const result = await handlerFor({
      groups: [{ groupId: 'g1', name: 'Conversation club', courseId: null }],
    }).execute(query);

    expect(result.groups[0]).toMatchObject({
      state: 'noCourse',
      delivered: null,
      absorbed: null,
      courseTitle: null,
      students: 2,
    });
  });
});

describe('a group nobody has attempted anything in', () => {
  it('keeps what it was taught and leaves absorbed null', async () => {
    const result = await handlerFor({
      delivery: deliveryOf([{ unit: 'u1', lessons: 1 }]),
      absorbed: {},
    }).execute(query);

    expect(result.groups[0]).toMatchObject({
      state: 'noAttempts',
      delivered: 50,
      absorbed: null,
    });
  });
});

describe('a group that can be compared', () => {
  it('prints both numbers as whole percents of the same course', async () => {
    const result = await handlerFor({
      delivery: deliveryOf([
        { unit: 'u1', lessons: 1 },
        { unit: 'u2', lessons: 1 },
      ]),
      absorbed: {
        u1: { anna: { passed: 2, touched: true }, bjorn: { passed: 1, touched: true } },
        u2: { anna: { passed: 1, touched: true }, bjorn: { passed: 0, touched: true } },
      },
    }).execute(query);

    expect(result.groups[0]).toMatchObject({
      state: 'ok',
      delivered: 100,
      // anna 3/4, bjorn 1/4 — the median of two is their midpoint.
      absorbed: 50,
      courseTitle: 'Ny i Norge A2',
    });
  });

  it('counts a unit begun as half taught, as the chart draws it', async () => {
    const result = await handlerFor({
      delivery: deliveryOf([{ unit: 'u1', lessons: 1 }]),
      absorbed: { u1: { anna: { passed: 1, touched: true } } },
      roster: { g1: ['anna'] },
    }).execute(query);

    // One of two units taught in full, the other not at all.
    expect(result.groups[0]?.delivered).toBe(50);
  });
});

describe('the timetable could not be asked', () => {
  it('leaves delivered null rather than calling the course untaught', async () => {
    const result = await handlerFor({
      delivery: null,
      absorbed: { u1: { anna: { passed: 2, touched: true } } },
      roster: { g1: ['anna'] },
    }).execute(query);

    expect(result.groups[0]?.delivered).toBeNull();
    // Absorbed still counts: what a learner did does not depend on the timetable, and a
    // unit they never opened is absent from their share rather than dragging it to zero.
    expect(result.groups[0]?.absorbed).toBe(100);
  });
});

describe('a school of several groups', () => {
  it('answers one row each, ordered as the directory gave them', async () => {
    const result = await handlerFor({
      groups: [
        { groupId: 'g1', name: 'A2 morning', courseId: COURSE },
        { groupId: 'g2', name: 'B1 evening', courseId: null },
      ],
      roster: { g1: ['anna'], g2: ['bjorn', 'cecilie'] },
    }).execute(query);

    expect(result.groups.map((group) => [group.name, group.state, group.students])).toEqual([
      ['A2 morning', 'noAttempts', 1],
      ['B1 evening', 'noCourse', 2],
    ]);
  });
});
