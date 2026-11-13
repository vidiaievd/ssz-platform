import { jest } from '@jest/globals';
import { GetLearnerReviewContextHandler } from './get-learner-review-context.handler.js';
import { GetLearnerReviewContextQuery } from './get-learner-review-context.query.js';

const SCHOOL_ID = 'school-1';
const OTHER_SCHOOL_ID = 'school-2';
const USER_ID = 'user-1';

function makePrismaStub(
  memberships: unknown[],
  rosterRows: unknown[] = [],
  taughtGroupIds: string[] = [],
) {
  // Rows read the school's status alongside (plan 90, phase 5); a fixture that names none is active.
  const withStatus = (row: any, school: any) => ({ ...row, school: school ?? { status: 'active' } });
  const groupRows = (memberships as any[]).map((m) => ({ ...m, group: withStatus(m.group, m.group.school) }));
  const roster = (rosterRows as any[]).map((r) => withStatus(r, r.school));
  return {
    schoolGroupMember: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(groupRows),
    },
    schoolMember: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(roster),
    },
    groupTeacher: {
      findMany: jest
        .fn<() => Promise<unknown[]>>()
        .mockResolvedValue(taughtGroupIds.map((groupId) => ({ groupId }))),
    },
  };
}

describe('GetLearnerReviewContextHandler', () => {
  it('returns nothing when the learner belongs nowhere', async () => {
    const prisma = makePrismaStub([]);
    const handler = new GetLearnerReviewContextHandler(prisma as never);

    const result = await handler.execute(new GetLearnerReviewContextQuery(USER_ID));

    expect(result).toEqual({ schoolId: null, groupId: null, groupName: null, schoolStatus: null });
  });

  it('returns the only active group when there is exactly one', async () => {
    const prisma = makePrismaStub([
      {
        addedAt: new Date('2026-01-01'),
        group: { id: 'group-1', name: 'A2 Kveld', courseId: 'course-1', schoolId: SCHOOL_ID },
      },
    ]);
    const handler = new GetLearnerReviewContextHandler(prisma as never);

    const result = await handler.execute(new GetLearnerReviewContextQuery(USER_ID));

    expect(result).toEqual({ schoolId: SCHOOL_ID, groupId: 'group-1', groupName: 'A2 Kveld', schoolStatus: 'active' });
  });

  it('names the learner workspace even when the content belongs to another school', async () => {
    const prisma = makePrismaStub([
      {
        addedAt: new Date('2026-01-01'),
        group: { id: 'group-1', name: 'A2 Kveld', courseId: 'course-1', schoolId: SCHOOL_ID },
      },
    ]);
    const handler = new GetLearnerReviewContextHandler(prisma as never);

    const result = await handler.execute(
      new GetLearnerReviewContextQuery(USER_ID, 'course-9', OTHER_SCHOOL_ID),
    );

    expect(result.schoolId).toBe(SCHOOL_ID);
    expect(result.groupId).toBe('group-1');
  });

  it('prefers the group teaching the attempt course when the student is in two active groups', async () => {
    const prisma = makePrismaStub([
      {
        addedAt: new Date('2026-02-01'),
        group: { id: 'group-2', name: 'B1 Morgen', courseId: 'course-2', schoolId: OTHER_SCHOOL_ID },
      },
      {
        addedAt: new Date('2026-01-01'),
        group: { id: 'group-1', name: 'A2 Kveld', courseId: 'course-1', schoolId: SCHOOL_ID },
      },
    ]);
    const handler = new GetLearnerReviewContextHandler(prisma as never);

    const result = await handler.execute(
      new GetLearnerReviewContextQuery(USER_ID, 'course-1'),
    );

    expect(result).toEqual({ schoolId: SCHOOL_ID, groupId: 'group-1', groupName: 'A2 Kveld', schoolStatus: 'active' });
  });

  it('prefers a group in the school owning the content when no course matches', async () => {
    const prisma = makePrismaStub([
      {
        addedAt: new Date('2026-02-01'),
        group: { id: 'group-2', name: 'B1 Morgen', courseId: null, schoolId: OTHER_SCHOOL_ID },
      },
      {
        addedAt: new Date('2026-01-01'),
        group: { id: 'group-1', name: 'A2 Kveld', courseId: null, schoolId: SCHOOL_ID },
      },
    ]);
    const handler = new GetLearnerReviewContextHandler(prisma as never);

    const result = await handler.execute(
      new GetLearnerReviewContextQuery(USER_ID, undefined, SCHOOL_ID),
    );

    expect(result.groupId).toBe('group-1');
  });

  it('falls back to the most recently joined group when nothing else decides', async () => {
    const prisma = makePrismaStub([
      {
        addedAt: new Date('2026-01-01'),
        group: { id: 'group-1', name: 'A2 Kveld', courseId: 'course-1', schoolId: SCHOOL_ID },
      },
      {
        addedAt: new Date('2026-02-01'),
        group: { id: 'group-2', name: 'B1 Morgen', courseId: 'course-2', schoolId: SCHOOL_ID },
      },
    ]);
    const handler = new GetLearnerReviewContextHandler(prisma as never);

    const result = await handler.execute(new GetLearnerReviewContextQuery(USER_ID));

    expect(result).toEqual({ schoolId: SCHOOL_ID, groupId: 'group-2', groupName: 'B1 Morgen', schoolStatus: 'active' });
  });

  /**
   * The learner who studies at a school and with a private tutor. The tutor's own course
   * names no school and is tied to no group — only its author says whose work this is.
   */
  it('prefers a group taught by the author of the content', async () => {
    const prisma = makePrismaStub(
      [
        {
          addedAt: new Date('2026-02-01'),
          group: { id: 'school-group', name: 'NO-A2', courseId: 'course-9', schoolId: SCHOOL_ID },
        },
        {
          addedAt: new Date('2026-01-01'),
          group: {
            id: 'tutor-group',
            name: 'Norsk med Dmytro',
            courseId: null,
            schoolId: OTHER_SCHOOL_ID,
          },
        },
      ],
      [],
      ['tutor-group'],
    );
    const handler = new GetLearnerReviewContextHandler(prisma as never);

    const result = await handler.execute(
      new GetLearnerReviewContextQuery(USER_ID, 'course-1', undefined, 'tutor-1'),
    );

    expect(result).toEqual({
      schoolId: OTHER_SCHOOL_ID,
      groupId: 'tutor-group',
      groupName: 'Norsk med Dmytro',
      schoolStatus: 'active',
    });
  });

  it('falls back to the roster when the learner is in no group', async () => {
    const prisma = makePrismaStub([], [
      { schoolId: SCHOOL_ID, joinedAt: new Date('2026-01-01') },
    ]);
    const handler = new GetLearnerReviewContextHandler(prisma as never);

    const result = await handler.execute(new GetLearnerReviewContextQuery(USER_ID));

    expect(result).toEqual({ schoolId: SCHOOL_ID, groupId: null, groupName: null, schoolStatus: 'active' });
  });

  it('prefers the content school among several rosters, else the newest', async () => {
    const rosters = [
      { schoolId: SCHOOL_ID, joinedAt: new Date('2026-01-01') },
      { schoolId: OTHER_SCHOOL_ID, joinedAt: new Date('2026-02-01') },
    ];
    const handler = new GetLearnerReviewContextHandler(makePrismaStub([], rosters) as never);

    await expect(
      handler.execute(new GetLearnerReviewContextQuery(USER_ID, undefined, SCHOOL_ID)),
    ).resolves.toEqual({ schoolId: SCHOOL_ID, groupId: null, groupName: null, schoolStatus: 'active' });

    await expect(handler.execute(new GetLearnerReviewContextQuery(USER_ID))).resolves.toEqual({
      schoolId: OTHER_SCHOOL_ID,
      groupId: null,
      groupName: null,
      schoolStatus: 'active',
    });
  });

  // Plan 90, phase 5: the engine refuses new work on a suspended school by this field.
  it("carries the school's status, from the group and from the roster", async () => {
    const inGroup = makePrismaStub([
      {
        addedAt: new Date('2026-01-01'),
        group: { id: 'group-1', name: 'A2 Kveld', courseId: 'course-1', schoolId: SCHOOL_ID, school: { status: 'suspended' } },
      },
    ]);
    await expect(
      new GetLearnerReviewContextHandler(inGroup as never).execute(new GetLearnerReviewContextQuery(USER_ID)),
    ).resolves.toMatchObject({ schoolId: SCHOOL_ID, schoolStatus: 'suspended' });

    const onRoster = makePrismaStub([], [
      { schoolId: SCHOOL_ID, joinedAt: new Date('2026-01-01'), school: { status: 'suspended' } },
    ]);
    await expect(
      new GetLearnerReviewContextHandler(onRoster as never).execute(new GetLearnerReviewContextQuery(USER_ID)),
    ).resolves.toMatchObject({ schoolId: SCHOOL_ID, schoolStatus: 'suspended' });
  });
});
