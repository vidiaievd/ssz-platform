import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../../src/infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

const { StudentAccessService } = await import(
  '../../../../src/modules/student-analytics/student-access.service.js'
);

function serviceFor(viewerSchools: string[], studentShares: boolean) {
  const prisma = {
    schoolMembership: {
      findMany: async () => viewerSchools.map((schoolId) => ({ schoolId })),
      findFirst: async () => (studentShares ? { userId: 'anna' } : null),
    },
  };
  return new StudentAccessService(prisma as never);
}

describe('who may read a learner’s numbers', () => {
  it('lets a learner read their own without asking about schools', async () => {
    // No memberships at all: a learner enrolled on their own still has a profile.
    await expect(serviceFor([], false).assertMayRead('anna', 'anna')).resolves.toBeUndefined();
  });

  it('lets a colleague of the learner’s school read them', async () => {
    await expect(serviceFor(['s1'], true).assertMayRead('anna', 'teacher')).resolves.toBeUndefined();
  });

  it('answers "not found" to a stranger, not "forbidden"', async () => {
    // Whether this person is a student of that school is itself not ours to confirm.
    await expect(serviceFor(['s2'], false).assertMayRead('anna', 'teacher')).rejects.toThrow(
      'Student not found',
    );
  });

  it('answers "not found" to somebody in no school at all', async () => {
    await expect(serviceFor([], false).assertMayRead('anna', 'stranger')).rejects.toThrow(
      'Student not found',
    );
  });
});
