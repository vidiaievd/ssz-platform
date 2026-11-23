import { jest } from '@jest/globals';
import { GetReviewEscalationRecipientsHandler } from './get-review-escalation-recipients.handler.js';
import { GetReviewEscalationRecipientsQuery } from './get-review-escalation-recipients.query.js';
import { ReviewSettings } from '../../../domain/value-objects/review-settings.vo.js';

const SCHOOL_ID = 'school-1';
const GROUP_ID = 'group-1';
const AT = new Date('2026-08-20T09:00:00.000Z');

function makeHandler(
  escalateTo: 'school_admins' | 'owner' | 'primary_teacher',
  data: { members?: unknown[]; assignments?: unknown[]; ownerName?: string | null } = {},
) {
  const prisma = {
    schoolMember: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(data.members ?? []),
      // The owner is looked up by id, and is usually not on the roster at all.
      findFirst: jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue(data.ownerName === undefined ? null : { name: data.ownerName }),
    },
    groupTeacher: {
      findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(data.assignments ?? []),
    },
  };
  const schools = {
    findById: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      ownerId: 'owner-1',
      reviewSettings: ReviewSettings.create({
        respondWithinHours: 48,
        escalateAfterHours: 72,
        escalateTo,
      }),
    }),
  };

  return {
    handler: new GetReviewEscalationRecipientsHandler(prisma as never, schools as never),
    prisma,
    schools,
  };
}

const query = (groupIds: string[] = []) =>
  new GetReviewEscalationRecipientsQuery(SCHOOL_ID, groupIds, AT);

describe('GetReviewEscalationRecipientsHandler', () => {
  it('reads the school’s own choice rather than taking one from the caller', async () => {
    const { handler } = makeHandler('owner', { ownerName: 'Ola Nordmann' });

    const result = await handler.execute(query());

    expect(result.target).toBe('owner');
    expect(result.recipients).toEqual([
      { userId: 'owner-1', name: 'Ola Nordmann', role: 'OWNER' },
    ]);
  });

  /**
   * The owner lives in the school's own `ownerId`, not on the roster: most schools have
   * no `OWNER` member row at all, only teachers and students. Reading the roster alone
   * answered "nobody" for an ordinary school — the silent swallowing this guards against.
   */
  it('finds the owner even when they are not on the roster', async () => {
    const { handler } = makeHandler('school_admins', { members: [] });

    const result = await handler.execute(query());

    expect(result.recipients).toEqual([{ userId: 'owner-1', name: 'owner-1', role: 'OWNER' }]);
  });

  it('does not list the owner twice when they are also a roster admin', async () => {
    const { handler } = makeHandler('school_admins', {
      members: [{ userId: 'owner-1', name: 'Ola', role: 'OWNER' }],
    });

    const result = await handler.execute(query());

    expect(result.recipients.map((one) => one.userId)).toEqual(['owner-1']);
  });

  /**
   * An owner is an administrator of their own school. Leaving them out would mean a
   * school with no separate ADMIN silently swallows every escalation it ever raises.
   */
  it('counts the owner among the school’s admins', async () => {
    const { handler, prisma } = makeHandler('school_admins', {
      members: [
        { userId: 'ola', name: 'Ola', role: 'OWNER' },
        { userId: 'kari', name: 'Kari', role: 'ADMIN' },
      ],
    });

    const result = await handler.execute(query());

    expect(result.recipients.map((r) => r.userId)).toEqual(['owner-1', 'ola', 'kari']);
    expect(prisma.schoolMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { schoolId: SCHOOL_ID, role: { in: ['OWNER', 'ADMIN'] } } }),
    );
  });

  it('names the primary teacher of the group the late work belongs to', async () => {
    const { handler } = makeHandler('primary_teacher', {
      assignments: [{ userId: 'teacher-1', groupId: GROUP_ID }],
      members: [{ userId: 'teacher-1', name: 'Anna Lund' }],
    });

    const result = await handler.execute(query([GROUP_ID]));

    expect(result).toEqual({
      target: 'primary_teacher',
      recipients: [{ userId: 'teacher-1', name: 'Anna Lund', role: 'primary' }],
    });
  });

  it('asks only for assignments that are live today, not the ones that were', async () => {
    const { handler, prisma } = makeHandler('primary_teacher', { assignments: [] });

    await handler.execute(query([GROUP_ID]));

    expect(prisma.groupTeacher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupId: { in: [GROUP_ID] }, role: 'primary' }),
      }),
    );
  });

  /**
   * A group with no primary teacher is handed to the school's administrators (OQ-13,
   * variant B): silence would swallow that group's late work, and the reason on each
   * recipient says why they hear about it.
   */
  it('hands a group without a primary teacher to the school’s administrators', async () => {
    const { handler } = makeHandler('primary_teacher', {
      assignments: [],
      members: [{ userId: 'kari', name: 'Kari', role: 'ADMIN' }],
    });

    await expect(handler.execute(query([GROUP_ID]))).resolves.toEqual({
      target: 'primary_teacher',
      recipients: [
        { userId: 'owner-1', name: 'owner-1', role: 'school_admin_fallback' },
        { userId: 'kari', name: 'Kari', role: 'school_admin_fallback' },
      ],
    });
  });

  it('names the primaries of covered groups and the admins for the uncovered one', async () => {
    const { handler, prisma } = makeHandler('primary_teacher', {
      assignments: [{ userId: 'teacher-1', groupId: GROUP_ID }],
    });
    // Names of the primaries first, then the admin roster.
    prisma.schoolMember.findMany
      .mockResolvedValueOnce([{ userId: 'teacher-1', name: 'Anna Lund' }])
      .mockResolvedValueOnce([{ userId: 'kari', name: 'Kari', role: 'ADMIN' }]);

    const result = await handler.execute(query([GROUP_ID, 'group-2']));

    expect(result.recipients).toEqual([
      { userId: 'teacher-1', name: 'Anna Lund', role: 'primary' },
      { userId: 'owner-1', name: 'owner-1', role: 'school_admin_fallback' },
      { userId: 'kari', name: 'Kari', role: 'school_admin_fallback' },
    ]);
  });

  it('lists a primary teacher who is also an admin once, as the primary', async () => {
    const { handler, prisma } = makeHandler('primary_teacher', {
      assignments: [{ userId: 'kari', groupId: GROUP_ID }],
    });
    prisma.schoolMember.findMany
      .mockResolvedValueOnce([{ userId: 'kari', name: 'Kari' }])
      .mockResolvedValueOnce([{ userId: 'kari', name: 'Kari', role: 'ADMIN' }]);

    const result = await handler.execute(query([GROUP_ID, 'group-2']));

    expect(result.recipients).toEqual([
      { userId: 'kari', name: 'Kari', role: 'primary' },
      { userId: 'owner-1', name: 'owner-1', role: 'school_admin_fallback' },
    ]);
  });

  it('asks for no admins when every group has its primary', async () => {
    const { handler, prisma } = makeHandler('primary_teacher', {
      assignments: [{ userId: 'teacher-1', groupId: GROUP_ID }],
      members: [{ userId: 'teacher-1', name: 'Anna Lund' }],
    });

    await handler.execute(query([GROUP_ID]));

    expect(prisma.schoolMember.findFirst).not.toHaveBeenCalled();
    expect(prisma.schoolMember.findMany).toHaveBeenCalledTimes(1);
  });

  it('has nobody to name for a primary teacher when no group was given', async () => {
    const { handler, prisma } = makeHandler('primary_teacher');

    const result = await handler.execute(query([]));

    expect(result.recipients).toEqual([]);
    expect(prisma.groupTeacher.findMany).not.toHaveBeenCalled();
  });

  it('falls back to the id when the roster never denormalised a name', async () => {
    const { handler } = makeHandler('school_admins', {
      members: [{ userId: 'ola', name: null, role: 'ADMIN' }],
    });

    const result = await handler.execute(query());

    expect(result.recipients).toContainEqual({ userId: 'ola', name: 'ola', role: 'ADMIN' });
  });
});
