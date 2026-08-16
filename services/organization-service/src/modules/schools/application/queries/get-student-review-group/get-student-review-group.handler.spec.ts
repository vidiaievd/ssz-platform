import { jest } from '@jest/globals';
import { GetStudentReviewGroupHandler } from './get-student-review-group.handler.js';
import { GetStudentReviewGroupQuery } from './get-student-review-group.query.js';

const SCHOOL_ID = 'school-1';
const USER_ID = 'user-1';

function makePrismaStub(memberships: unknown[]) {
  return {
    schoolGroupMember: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(memberships),
    },
  };
}

describe('GetStudentReviewGroupHandler', () => {
  it('returns groupId: null when the student has no active group', async () => {
    const prisma = makePrismaStub([]);
    const handler = new GetStudentReviewGroupHandler(prisma as never);

    const result = await handler.execute(new GetStudentReviewGroupQuery(SCHOOL_ID, USER_ID));

    expect(result).toEqual({ groupId: null, groupName: null });
  });

  it('returns the only active group when there is exactly one', async () => {
    const prisma = makePrismaStub([
      { addedAt: new Date('2026-01-01'), group: { id: 'group-1', name: 'A2 Kveld', courseId: 'course-1' } },
    ]);
    const handler = new GetStudentReviewGroupHandler(prisma as never);

    const result = await handler.execute(new GetStudentReviewGroupQuery(SCHOOL_ID, USER_ID));

    expect(result).toEqual({ groupId: 'group-1', groupName: 'A2 Kveld' });
  });

  it('prefers the group teaching the attempt course when the student is in two active groups', async () => {
    const prisma = makePrismaStub([
      { addedAt: new Date('2026-02-01'), group: { id: 'group-2', name: 'B1 Morgen', courseId: 'course-2' } },
      { addedAt: new Date('2026-01-01'), group: { id: 'group-1', name: 'A2 Kveld', courseId: 'course-1' } },
    ]);
    const handler = new GetStudentReviewGroupHandler(prisma as never);

    const result = await handler.execute(
      new GetStudentReviewGroupQuery(SCHOOL_ID, USER_ID, 'course-1'),
    );

    expect(result).toEqual({ groupId: 'group-1', groupName: 'A2 Kveld' });
  });

  it('falls back to the most recently joined group when no course matches', async () => {
    const prisma = makePrismaStub([
      { addedAt: new Date('2026-01-01'), group: { id: 'group-1', name: 'A2 Kveld', courseId: 'course-1' } },
      { addedAt: new Date('2026-02-01'), group: { id: 'group-2', name: 'B1 Morgen', courseId: 'course-2' } },
    ]);
    const handler = new GetStudentReviewGroupHandler(prisma as never);

    const result = await handler.execute(new GetStudentReviewGroupQuery(SCHOOL_ID, USER_ID));

    expect(result).toEqual({ groupId: 'group-2', groupName: 'B1 Morgen' });
  });
});
