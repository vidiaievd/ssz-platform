import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { GetSchoolStudentsHandler } = await import(
  '../../../../src/modules/school-analytics/queries/get-school-students.handler.js'
);
const { GetSchoolStudentsQuery } = await import(
  '../../../../src/modules/school-analytics/queries/get-school-students.query.js'
);

const SCHOOL = 'school-1';
const VIEWER = 'owner-1';
const STUDENT = 'student-1';
const GROUP = 'group-1';

function makeHandler(options: { groupDirectory?: unknown[] } = {}) {
  const prisma = {
    schoolMembership: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        schoolId: SCHOOL,
        userId: VIEWER,
        role: 'OWNER',
      }),
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
        { schoolId: SCHOOL, userId: STUDENT, role: 'STUDENT', joinedAt: new Date('2026-01-01') },
      ]),
    },
    groupMembership: {
      findMany: jest
        .fn<() => Promise<unknown[]>>()
        .mockResolvedValue([{ groupId: GROUP, schoolId: SCHOOL, userId: STUDENT }]),
    },
    groupDirectory: {
      findMany: jest
        .fn<() => Promise<unknown[]>>()
        .mockResolvedValue(
          options.groupDirectory ?? [
            { groupId: GROUP, schoolId: SCHOOL, name: 'Norsk med Dmytro', lang: 'nb', level: 'A2' },
          ],
        ),
    },
    userDirectory: {
      findMany: jest
        .fn<() => Promise<unknown[]>>()
        .mockResolvedValue([{ userId: STUDENT, displayName: 'Dmyto Student' }]),
    },
    enrollmentProjection: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
    progressActivity: {
      findMany: jest
        .fn<() => Promise<unknown[]>>()
        .mockResolvedValue([{ userId: STUDENT, occurredAt: new Date() }]),
    },
  };

  const config = { get: jest.fn<() => unknown>().mockReturnValue({ atRiskThresholdDays: 7 }) };

  return {
    handler: new GetSchoolStudentsHandler(prisma as never, config as never),
    prisma,
  };
}

describe('GetSchoolStudentsHandler', () => {
  /**
   * The two projections are fed by two events and carry no relation to each other;
   * asking Prisma to `include` the group threw on every school with a learner on its
   * roster, and the cast to `any` kept it out of the build.
   */
  it('names a learner group from the group directory, not from a relation', async () => {
    const { handler, prisma } = makeHandler();

    const result = await handler.execute(
      new GetSchoolStudentsQuery(SCHOOL, VIEWER, 'all', undefined, 20, undefined),
    );

    expect(prisma.groupMembership.findMany).toHaveBeenCalledWith({
      where: { schoolId: SCHOOL, userId: { in: [STUDENT] } },
    });
    expect(result.items[0]!.groups).toEqual([
      { id: GROUP, name: 'Norsk med Dmytro', lang: 'nb', level: 'A2' },
    ]);
    expect(result.items[0]!.status).toBe('active');
  });

  it('falls back to the group id when the directory has no row for it yet', async () => {
    const { handler } = makeHandler({ groupDirectory: [] });

    const result = await handler.execute(
      new GetSchoolStudentsQuery(SCHOOL, VIEWER, 'all', undefined, 20, undefined),
    );

    expect(result.items[0]!.groups).toEqual([{ id: GROUP, name: GROUP, lang: null, level: null }]);
  });
});
