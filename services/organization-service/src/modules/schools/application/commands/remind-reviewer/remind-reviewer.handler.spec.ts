import { jest } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import { RemindReviewerHandler } from './remind-reviewer.handler.js';
import { RemindReviewerCommand } from './remind-reviewer.command.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SchoolType } from '../../../domain/value-objects/school-type.vo.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberNotFoundException } from '../../../domain/exceptions/member-not-found.exception.js';

const SCHOOL_ID = 'school-1';
const OWNER = 'owner-1';
const ADMIN = 'admin-1';
const TEACHER = 'teacher-1';
const OUTSIDER = 'nobody-1';

function school(): School {
  return School.rehydrate({
    id: SCHOOL_ID,
    name: 'Nordick',
    slug: 'nordick',
    ownerId: OWNER,
    type: SchoolType.ONLINE,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    requireTutorReviewForSelfPaced: false,
    members: [
      SchoolMember.rehydrate({
        id: 'm-1',
        schoolId: SCHOOL_ID,
        userId: ADMIN,
        role: MemberRole.ADMIN,
        joinedAt: new Date('2026-01-01T00:00:00Z'),
      }),
      SchoolMember.rehydrate({
        id: 'm-2',
        schoolId: SCHOOL_ID,
        userId: TEACHER,
        role: MemberRole.TEACHER,
        joinedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ],
  });
}

function makeHandler(lastRemindedAt: Date | null) {
  const schools = { findById: jest.fn(() => Promise.resolve(school())) };
  const publisher = { publish: jest.fn(() => Promise.resolve()) };
  const prisma = {
    reviewerReminder: {
      findUnique: jest.fn(() =>
        Promise.resolve(lastRemindedAt === null ? null : { lastRemindedAt }),
      ),
      upsert: jest.fn(() => Promise.resolve({})),
    },
  };
  return {
    handler: new RemindReviewerHandler(schools as never, publisher as never, prisma as never),
    publisher,
    prisma,
  };
}

const command = (actorId: string, teacherId = TEACHER) =>
  new RemindReviewerCommand(actorId, SCHOOL_ID, teacherId, 12);

describe('RemindReviewerHandler', () => {
  it('announces one message carrying the count, not one per submission', async () => {
    const { handler, publisher } = makeHandler(null);

    await expect(handler.execute(command(ADMIN))).resolves.toEqual({ sent: true });

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'school.review.reviewer_reminded',
        teacherId: TEACHER,
        pending: 12,
        requestedBy: ADMIN,
      }),
    );
  });

  it('refuses a second reminder inside the day, and says when the next is allowed', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { handler, publisher } = makeHandler(twoHoursAgo);

    await expect(handler.execute(command(ADMIN))).rejects.toBeInstanceOf(HttpException);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('allows the next one after a day has passed', async () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const { handler, publisher } = makeHandler(yesterday);

    await expect(handler.execute(command(ADMIN))).resolves.toEqual({ sent: true });
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('lets the owner remind, and refuses a teacher reminding a colleague', async () => {
    const asOwner = makeHandler(null);
    await expect(asOwner.handler.execute(command(OWNER))).resolves.toEqual({ sent: true });

    const asTeacher = makeHandler(null);
    await expect(asTeacher.handler.execute(command(TEACHER, ADMIN))).rejects.toBeInstanceOf(
      ForbiddenOperationException,
    );
  });

  it('refuses to remind someone who is not in this school', async () => {
    const { handler } = makeHandler(null);

    await expect(handler.execute(command(ADMIN, OUTSIDER))).rejects.toBeInstanceOf(
      MemberNotFoundException,
    );
  });
});
