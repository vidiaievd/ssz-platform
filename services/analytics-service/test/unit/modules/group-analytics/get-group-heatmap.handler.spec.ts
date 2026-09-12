import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { GetGroupHeatmapHandler } = await import(
  '../../../../src/modules/group-analytics/queries/get-group-heatmap.handler.js'
);
const { GetGroupHeatmapQuery } = await import(
  '../../../../src/modules/group-analytics/queries/get-group-heatmap.query.js'
);
const { GroupUnitsService } = await import(
  '../../../../src/modules/group-analytics/group-units.service.js'
);

const GROUP = 'g1';
const SCHOOL = 's1';
const COURSE = 'c1';
const VIEWER = 'teacher';

const UNITS = [
  { unitId: 'u1', no: 1, title: 'Leksjon 17', itemIds: ['i1', 'i2', 'i3', 'i4'], items: 4 },
  { unitId: 'u2', no: 2, title: 'Leksjon 18', itemIds: ['i5', 'i6'], items: 2 },
];

type Absorbed = Record<string, Record<string, { passed: number; touched: boolean }>>;
type Evidence = Record<
  string,
  Record<string, { attempts: number; weightedSample: number; successWeight: number }>
>;

interface Options {
  courseId?: string | null;
  roster?: string[];
  units?: typeof UNITS;
  absorbed?: Absorbed;
  evidence?: Evidence;
  delivery?: unknown;
  names?: Record<string, string>;
  attempts?: Array<{ userId: string; occurredAt: Date }>;
  items?: Array<{ userId: string; updatedAt: Date }>;
  viewerInSchool?: boolean;
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
    schoolMembership: {
      findUnique: async () =>
        options.viewerInSchool === false ? null : { schoolId: SCHOOL, userId: VIEWER },
    },
    groupMembership: { findMany: async () => roster.map((userId) => ({ userId })) },
    userDirectory: {
      findMany: async () =>
        Object.entries(options.names ?? { anna: 'Anna Lind', bjorn: 'Bjørn Haug' }).map(
          ([userId, displayName]) => ({ userId, displayName }),
        ),
    },
    attemptEvidence: { findMany: async () => options.attempts ?? [] },
    itemProgress: { findMany: async () => options.items ?? [] },
  };

  // The folding of the teaching plan onto course units belongs to the service; the stub
  // delegates to the real one so the suite cannot pass against a fold nobody ships.
  const folding = new GroupUnitsService(null as never, null as never, {
    getGroupDelivery: async () => options.delivery ?? null,
  } as never);

  const unitsService = {
    unitsOf: async () => units,
    deliveryOf: (groupId: string) => folding.deliveryOf(groupId),
    absorbedByUnit: async () =>
      new Map(
        units.map((unit) => [
          unit.unitId,
          new Map(Object.entries(options.absorbed?.[unit.unitId] ?? {})),
        ]),
      ),
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

  const config = { get: () => ({ minWeightedSample: 8 }) };

  return new GetGroupHeatmapHandler(prisma as never, unitsService as never, config as never);
}

const query = new GetGroupHeatmapQuery(GROUP, VIEWER);

function deliveryOf(units: Array<Record<string, unknown>>) {
  return { groupId: GROUP, planId: 'p1', lessonsHeld: 4, lessonsPlanned: 8, units };
}

const planUnit = (over: Record<string, unknown> = {}) => ({
  curriculumUnitId: 'p1',
  title: 'Leksjon 17',
  order: 1,
  plannedSessions: 2,
  contentUnitId: 'u1',
  lessonsHeld: 2,
  lastHeldAt: '2026-09-08T00:00:00.000Z',
  ...over,
});

describe('the shape of the map', () => {
  it('gives every learner of the roster exactly one cell per unit, in order', async () => {
    const result = await handlerFor().execute(query);

    expect(result.units.map((unit) => unit.no)).toEqual([1, 2]);
    expect(result.rows.map((row) => row.studentId)).toEqual(['anna', 'bjorn']);
    for (const row of result.rows) {
      expect(row.cells).toHaveLength(result.units.length);
    }
  });

  it('keeps a learner the directory never heard of in the group', async () => {
    const result = await handlerFor({ names: { anna: 'Anna Lind' } }).execute(query);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[1].displayName).toBe('Unknown student');
  });

  it('answers an empty map for a group that teaches no course', async () => {
    const result = await handlerFor({ courseId: null, units: [] }).execute(query);

    expect(result.courseId).toBeNull();
    expect(result.units).toEqual([]);
    expect(result.rows.every((row) => row.cells.length === 0)).toBe(true);
  });

  it('hides the group from somebody outside its school', async () => {
    await expect(handlerFor({ viewerInSchool: false }).execute(query)).rejects.toThrow(
      'Group not found',
    );
  });
});

describe('a cell never prints a zero it did not measure', () => {
  it('leaves a learner who has done nothing empty, not at zero', async () => {
    const result = await handlerFor().execute(query);

    for (const row of result.rows) {
      for (const cell of row.cells) {
        expect(cell.state).toBe('notStarted');
        expect(cell.value).toBeNull();
      }
    }
  });

  it('never answers ok with a value of zero', async () => {
    // Touched the whole unit, passed none of it: a real zero, and it has its own name.
    const result = await handlerFor({
      absorbed: { u1: { anna: { passed: 0, touched: true } } },
      evidence: { u1: { anna: { attempts: 14, weightedSample: 14, successWeight: 0 } } },
    }).execute(query);

    const cell = result.rows[0].cells[0];
    expect(cell.state).toBe('low');
    expect(cell.value).toBe(0);
    expect(result.rows.some((row) => row.cells.some((c) => c.state === 'ok' && c.value === 0))).toBe(
      false,
    );
  });

  it('refuses a verdict under the weighted threshold, and says how much it had', async () => {
    const result = await handlerFor({
      absorbed: { u1: { anna: { passed: 3, touched: true } } },
      evidence: { u1: { anna: { attempts: 4, weightedSample: 3.25, successWeight: 3 } } },
    }).execute(query);

    const cell = result.rows[0].cells[0];
    expect(cell.state).toBe('insufficient');
    expect(cell.weightedSample).toBe(3.25);
    expect(result.minWeightedSample).toBe(8);
  });

  it('blames the timetable before it blames the learner', async () => {
    const result = await handlerFor({
      // Anna got ahead on a unit the class has not reached: the cell is about the plan,
      // not about her, and her own share is not what the teacher is being told here.
      absorbed: { u2: { anna: { passed: 2, touched: true } } },
      // Unit 1 is stitched but not yet taught; unit 2 no plan unit names at all.
      delivery: deliveryOf([planUnit({ lessonsHeld: 0, lastHeldAt: null })]),
    }).execute(query);

    // Both read `notDelivered`, and on this axis that is the whole of it: a plan unit
    // that names no course unit has no column to sit in, so `unlinked` is unreachable
    // here and those units are listed separately by the chart above (§O3).
    expect(result.rows[0].cells.map((cell) => cell.state)).toEqual([
      'notDelivered',
      'notDelivered',
    ]);
    expect(result.rows[0].cells[1].value).toBeNull();
  });

  it('calls no cell notDelivered when the timetable could not be asked', async () => {
    const result = await handlerFor({ delivery: null }).execute(query);

    expect(result.deliveryUnavailable).toBe(true);
    expect(result.rows.flatMap((row) => row.cells).some((c) => c.state === 'notDelivered')).toBe(
      false,
    );
  });

  it('separates a unit with no items from a learner who has not started', async () => {
    const result = await handlerFor({
      units: [{ unitId: 'u1', no: 1, title: 'Tom leksjon', itemIds: [], items: 0 }],
    }).execute(query);

    expect(result.rows[0].cells[0].state).toBe('noContent');
  });
});

describe('the map and the chart tell the same story', () => {
  it('rounds the share once, to whole percent', async () => {
    const result = await handlerFor({
      absorbed: { u1: { anna: { passed: 3, touched: true } } },
      evidence: { u1: { anna: { attempts: 20, weightedSample: 20, successWeight: 15 } } },
    }).execute(query);

    expect(result.rows[0].cells[0].value).toBe(75);
  });

  it('reports when each learner was last seen, and null for one nobody has seen', async () => {
    const result = await handlerFor({
      attempts: [{ userId: 'anna', occurredAt: new Date('2026-09-10T10:00:00Z') }],
      items: [{ userId: 'anna', updatedAt: new Date('2026-09-11T10:00:00Z') }],
    }).execute(query);

    expect(result.rows[0].lastActivityAt).toBe('2026-09-11T10:00:00.000Z');
    expect(result.rows[1].lastActivityAt).toBeNull();
    // The footer may not claim to be older than the newest thing it drew.
    expect(result.updatedAt).toBe('2026-09-11T10:00:00.000Z');
  });
});
