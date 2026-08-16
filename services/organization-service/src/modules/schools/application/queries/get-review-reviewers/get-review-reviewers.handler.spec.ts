import { jest } from '@jest/globals';
import { GetReviewReviewersHandler } from './get-review-reviewers.handler.js';
import { GetReviewReviewersQuery } from './get-review-reviewers.query.js';

const GROUP_ID = 'group-1';
const SCHOOL_ID = 'school-1';
const AT = new Date('2026-06-15T00:00:00.000Z');

function makePrismaStub(
  assignments: unknown[],
  members: unknown[] = [{ schoolId: SCHOOL_ID, userId: 'teacher-1', name: 'Anna Lund' }],
) {
  return {
    groupTeacher: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(assignments) },
    schoolGroup: {
      findMany: jest
        .fn<() => Promise<unknown[]>>()
        .mockResolvedValue([{ id: GROUP_ID, schoolId: SCHOOL_ID }]),
    },
    schoolMember: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(members) },
  };
}

describe('GetReviewReviewersHandler', () => {
  it('returns an entry with empty teachers for a group with no active assignment', async () => {
    const prisma = makePrismaStub([]);
    const handler = new GetReviewReviewersHandler(prisma as never);

    const result = await handler.execute(new GetReviewReviewersQuery([GROUP_ID], AT));

    expect(result).toEqual({ groups: [{ groupId: GROUP_ID, teachers: [] }] });
  });

  it('resolves the assigned teacher name from the denormalized school member', async () => {
    const prisma = makePrismaStub([
      { groupId: GROUP_ID, userId: 'teacher-1', role: 'primary', fromDate: null, toDate: null },
    ]);
    const handler = new GetReviewReviewersHandler(prisma as never);

    const result = await handler.execute(new GetReviewReviewersQuery([GROUP_ID], AT));

    expect(result).toEqual({
      groups: [{ groupId: GROUP_ID, teachers: [{ userId: 'teacher-1', name: 'Anna Lund', role: 'primary' }] }],
    });
  });

  it('falls back to the userId when the school member has no denormalized name', async () => {
    const prisma = makePrismaStub(
      [{ groupId: GROUP_ID, userId: 'teacher-1', role: 'substitute', fromDate: null, toDate: null }],
      [{ schoolId: SCHOOL_ID, userId: 'teacher-1', name: null }],
    );
    const handler = new GetReviewReviewersHandler(prisma as never);

    const result = await handler.execute(new GetReviewReviewersQuery([GROUP_ID], AT));

    expect(result.groups[0].teachers[0].name).toBe('teacher-1');
  });

  it('asks Prisma for assignments active on the submission date, boundaries inclusive', async () => {
    const prisma = makePrismaStub([]);
    const handler = new GetReviewReviewersHandler(prisma as never);

    await handler.execute(new GetReviewReviewersQuery([GROUP_ID], AT));

    expect(prisma.groupTeacher.findMany).toHaveBeenCalledWith({
      where: {
        groupId: { in: [GROUP_ID] },
        AND: [
          { OR: [{ fromDate: null }, { fromDate: { lte: AT } }] },
          { OR: [{ toDate: null }, { toDate: { gte: AT } }] },
        ],
      },
    });
  });

  it('returns no groups when no groupIds are given', async () => {
    const prisma = makePrismaStub([]);
    const handler = new GetReviewReviewersHandler(prisma as never);

    const result = await handler.execute(new GetReviewReviewersQuery([], AT));

    expect(result).toEqual({ groups: [] });
    expect(prisma.groupTeacher.findMany).not.toHaveBeenCalled();
  });
});
