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
      assignments: [{ userId: 'teacher-1' }],
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
   * The setting points at nobody. That is an answer, and the caller writes to nobody —
   * quietly picking a different recipient would send a stranger a school's business and
   * hide the fact that the setting is useless as it stands.
   */
  it('answers with nobody rather than falling back to another target', async () => {
    const { handler } = makeHandler('primary_teacher', { assignments: [] });

    await expect(handler.execute(query([GROUP_ID]))).resolves.toEqual({
      target: 'primary_teacher',
      recipients: [],
    });
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
