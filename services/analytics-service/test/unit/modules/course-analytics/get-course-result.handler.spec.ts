import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { GetCourseResultHandler } = await import(
  '../../../../src/modules/course-analytics/queries/get-course-result.handler.js'
);
const { GetCourseResultQuery } = await import(
  '../../../../src/modules/course-analytics/queries/get-course-result.query.js'
);

const COURSE = 'c1';
const OWNER = 'author';
const SCHOOL = 's1';

type Row = {
  userId: string;
  skill: string;
  focus: string;
  successRateEwma: number;
  attempts: number;
  weightedSample: number;
};

const row = (over: Partial<Row> = {}): Row => ({
  userId: 'anna',
  skill: 'reading',
  focus: 'unknown',
  successRateEwma: 0.8,
  attempts: 10,
  weightedSample: 8,
  ...over,
});

interface Options {
  rows?: Row[];
  groups?: Array<{ groupId: string }>;
  container?: Record<string, unknown> | null;
  viewerInSchool?: boolean;
}

function handlerFor(options: Options = {}) {
  const prisma = {
    containerDirectory: {
      findUnique: async () =>
        options.container === undefined
          ? { containerId: COURSE, ownerUserId: OWNER, ownerSchoolId: SCHOOL, deletedAt: null }
          : options.container,
    },
    schoolMembership: {
      findUnique: async () =>
        options.viewerInSchool === false ? null : { schoolId: SCHOOL, userId: 'colleague' },
    },
    skillMastery: { findMany: async () => options.rows ?? [] },
    attemptEvidence: { findMany: async () => options.groups ?? [] },
  };
  const config = { get: () => ({ minWeightedSample: 8 }) };

  return new GetCourseResultHandler(prisma as never, config as never);
}

const query = new GetCourseResultQuery(COURSE, OWNER);

describe('a course nobody has taken', () => {
  it('answers no learners and no cells, not a course of zeroes', async () => {
    const result = await handlerFor().execute(query);

    expect(result.learners).toBe(0);
    expect(result.groups).toBe(0);
    expect(result.cells).toEqual([]);
  });

  it('ignores a profile row that carries no attempt', async () => {
    const result = await handlerFor({ rows: [row({ attempts: 0, weightedSample: 0 })] }).execute(
      query,
    );

    expect(result.learners).toBe(0);
    expect(result.cells).toEqual([]);
  });
});

describe('what the course produced', () => {
  const rows = [
    row({ userId: 'anna', successRateEwma: 0.9, attempts: 30, weightedSample: 30 }),
    row({ userId: 'bjorn', successRateEwma: 0.5, attempts: 2, weightedSample: 2 }),
    row({ userId: 'anna', skill: 'written', successRateEwma: 0.4, attempts: 5, weightedSample: 4 }),
  ];

  it('weighs a cell by evidence, not by head count', async () => {
    const result = await handlerFor({ rows }).execute(query);

    const reading = result.cells.find((cell) => cell.skill === 'reading');
    // (0.9·30 + 0.5·2) / 32 = 0.875 — not the 0.7 a mean of the two learners would give.
    expect(reading?.ewma).toBe(88);
    expect(reading?.attempts).toBe(32);
  });

  it('says how many people stand behind each cell', async () => {
    const result = await handlerFor({ rows }).execute(query);

    expect(result.cells.find((cell) => cell.skill === 'reading')?.learners).toBe(2);
    expect(result.cells.find((cell) => cell.skill === 'written')?.learners).toBe(1);
    expect(result.learners).toBe(2);
  });

  it('names no learner anywhere in the body', async () => {
    const result = await handlerFor({
      rows,
      groups: [{ groupId: 'g1' }, { groupId: 'g2' }],
    }).execute(query);

    const body = JSON.stringify(result);
    expect(body).not.toContain('anna');
    expect(body).not.toContain('bjorn');
    expect(body).not.toContain('g1');
    expect(result.groups).toBe(2);
  });

  it('leaves `items` to the coverage report beside it', async () => {
    const result = await handlerFor({ rows }).execute(query);

    expect(result.cells.every((cell) => !('items' in cell))).toBe(true);
  });
});

describe('who may ask', () => {
  it('lets a colleague of the owning school in', async () => {
    const result = await handlerFor().execute(new GetCourseResultQuery(COURSE, 'colleague'));
    expect(result.containerId).toBe(COURSE);
  });

  it('refuses a stranger', async () => {
    await expect(
      handlerFor({ viewerInSchool: false }).execute(new GetCourseResultQuery(COURSE, 'stranger')),
    ).rejects.toThrow('Course not found');
  });

  it('refuses a course owned by a person, to anybody but that person', async () => {
    const personal = { containerId: COURSE, ownerUserId: OWNER, ownerSchoolId: null, deletedAt: null };

    await expect(
      handlerFor({ container: personal }).execute(new GetCourseResultQuery(COURSE, 'stranger')),
    ).rejects.toThrow('Course not found');
    await expect(
      handlerFor({ container: personal }).execute(query),
    ).resolves.toBeDefined();
  });

  it('treats a deleted course as gone', async () => {
    await expect(
      handlerFor({
        container: {
          containerId: COURSE,
          ownerUserId: OWNER,
          ownerSchoolId: SCHOOL,
          deletedAt: new Date(),
        },
      }).execute(query),
    ).rejects.toThrow('Course not found');
  });
});
