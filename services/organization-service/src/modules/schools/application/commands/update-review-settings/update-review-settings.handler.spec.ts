import { jest } from '@jest/globals';
import { UpdateReviewSettingsHandler } from './update-review-settings.handler.js';
import { UpdateReviewSettingsCommand } from './update-review-settings.command.js';
import { GetReviewSettingsHandler } from '../../queries/get-review-settings/get-review-settings.handler.js';
import { GetReviewSettingsQuery } from '../../queries/get-review-settings/get-review-settings.query.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SchoolType } from '../../../domain/value-objects/school-type.vo.js';
import { ReviewSettings } from '../../../domain/value-objects/review-settings.vo.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { InvalidReviewSettingsException } from '../../../domain/exceptions/invalid-review-settings.exception.js';

const SCHOOL_ID = 'school-1';
const OWNER = 'owner-1';
const ADMIN = 'admin-1';
const TEACHER = 'teacher-1';

function school(settings?: ReviewSettings): School {
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
    reviewSettings: settings,
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

function makeHandler(row: School | null) {
  const schools = {
    findById: jest.fn(() => Promise.resolve(row)),
    saveReviewSettings: jest.fn(() => Promise.resolve()),
    save: jest.fn(() => Promise.resolve()),
  };
  return { handler: new UpdateReviewSettingsHandler(schools as never), schools };
}

const command = (actorId: string, respond = 24, escalate = 48) =>
  new UpdateReviewSettingsCommand(SCHOOL_ID, actorId, respond, escalate, 'owner');

describe('UpdateReviewSettingsHandler', () => {
  it('sets the promise on the owner’s word', async () => {
    const { handler, schools } = makeHandler(school());

    const result = await handler.execute(command(OWNER));

    expect(result).toEqual({
      respondWithinHours: 24,
      escalateAfterHours: 48,
      escalateTo: 'owner',
    });
    expect(schools.saveReviewSettings).toHaveBeenCalledWith(
      SCHOOL_ID,
      expect.objectContaining({ respondWithinHours: 24 }),
    );
  });

  it('lets an administrator set it too', async () => {
    const { handler } = makeHandler(school());

    await expect(handler.execute(command(ADMIN))).resolves.toMatchObject({
      respondWithinHours: 24,
    });
  });

  /** The people the promise is measured against do not get to move it. */
  it('refuses a teacher', async () => {
    const { handler, schools } = makeHandler(school());

    await expect(handler.execute(command(TEACHER))).rejects.toBeInstanceOf(
      ForbiddenOperationException,
    );
    expect(schools.saveReviewSettings).not.toHaveBeenCalled();
  });

  /** An escalation before the promise is broken would page an admin about work on time. */
  it('refuses an escalation earlier than the promise itself', async () => {
    const { handler, schools } = makeHandler(school());

    await expect(handler.execute(command(OWNER, 48, 24))).rejects.toBeInstanceOf(
      InvalidReviewSettingsException,
    );
    expect(schools.saveReviewSettings).not.toHaveBeenCalled();
  });

  it('refuses hours outside a month, and fractions of an hour', async () => {
    const { handler } = makeHandler(school());

    await expect(handler.execute(command(OWNER, 0, 48))).rejects.toBeInstanceOf(
      InvalidReviewSettingsException,
    );
    await expect(handler.execute(command(OWNER, 24, 721))).rejects.toBeInstanceOf(
      InvalidReviewSettingsException,
    );
    await expect(handler.execute(command(OWNER, 1.5, 48))).rejects.toBeInstanceOf(
      InvalidReviewSettingsException,
    );
  });

  /** Equal is allowed: escalate the moment the promise runs out. */
  it('allows escalation exactly at the promise', async () => {
    const { handler } = makeHandler(school());

    await expect(handler.execute(command(OWNER, 48, 48))).resolves.toMatchObject({
      escalateAfterHours: 48,
    });
  });

  it('reports a missing school as missing', async () => {
    const { handler } = makeHandler(null);

    await expect(handler.execute(command(OWNER))).rejects.toBeInstanceOf(SchoolNotFoundException);
  });
});

describe('GetReviewSettingsHandler', () => {
  it('answers with what the school promises', async () => {
    const schools = {
      findById: jest.fn(() =>
        Promise.resolve(
          school(
            ReviewSettings.rehydrate({
              respondWithinHours: 12,
              escalateAfterHours: 36,
              escalateTo: 'primary_teacher',
            }),
          ),
        ),
      ),
    };
    const handler = new GetReviewSettingsHandler(schools as never);

    await expect(handler.execute(new GetReviewSettingsQuery(SCHOOL_ID))).resolves.toEqual({
      respondWithinHours: 12,
      escalateAfterHours: 36,
      escalateTo: 'primary_teacher',
    });
  });

  /** A school from before the promise existed still answers with one. */
  it('falls back to the platform default for a row that predates the columns', async () => {
    const schools = { findById: jest.fn(() => Promise.resolve(school())) };
    const handler = new GetReviewSettingsHandler(schools as never);

    await expect(handler.execute(new GetReviewSettingsQuery(SCHOOL_ID))).resolves.toEqual({
      respondWithinHours: 48,
      escalateAfterHours: 72,
      escalateTo: 'school_admins',
    });
  });
});
