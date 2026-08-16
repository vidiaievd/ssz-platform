import { jest } from '@jest/globals';
import { GetReviewScopeHandler } from './get-review-scope.handler.js';
import { GetReviewScopeQuery } from './get-review-scope.query.js';

const SCHOOL_ID = 'school-1';
const TEACHER_ID = 'teacher-1';
const AT = new Date('2026-06-15T00:00:00.000Z');

function makePrismaStub(assignments: unknown[]) {
  return {
    groupTeacher: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(assignments) },
  };
}

describe('GetReviewScopeHandler', () => {
  it('returns empty scope when the teacher has no active assignment', async () => {
    const prisma = makePrismaStub([]);
    const handler = new GetReviewScopeHandler(prisma as never);

    const result = await handler.execute(new GetReviewScopeQuery(SCHOOL_ID, TEACHER_ID, AT));

    expect(result).toEqual({ groupIds: [], containerIds: [] });
  });

  it('collects distinct groups and their courses, dropping groups with no course', async () => {
    const prisma = makePrismaStub([
      { group: { id: 'group-1', courseId: 'course-1' } },
      { group: { id: 'group-1', courseId: 'course-1' } },
      { group: { id: 'group-2', courseId: null } },
    ]);
    const handler = new GetReviewScopeHandler(prisma as never);

    const result = await handler.execute(new GetReviewScopeQuery(SCHOOL_ID, TEACHER_ID, AT));

    expect(result.groupIds.sort()).toEqual(['group-1', 'group-2']);
    expect(result.containerIds).toEqual(['course-1']);
  });

  it('asks Prisma for the teacher, scoped to the school, active on the given date', async () => {
    const prisma = makePrismaStub([]);
    const handler = new GetReviewScopeHandler(prisma as never);

    await handler.execute(new GetReviewScopeQuery(SCHOOL_ID, TEACHER_ID, AT));

    expect(prisma.groupTeacher.findMany).toHaveBeenCalledWith({
      where: {
        userId: TEACHER_ID,
        AND: [
          { OR: [{ fromDate: null }, { fromDate: { lte: AT } }] },
          { OR: [{ toDate: null }, { toDate: { gte: AT } }] },
        ],
        group: { schoolId: SCHOOL_ID, deletedAt: null },
      },
      select: { group: { select: { id: true, courseId: true } } },
    });
  });
});
