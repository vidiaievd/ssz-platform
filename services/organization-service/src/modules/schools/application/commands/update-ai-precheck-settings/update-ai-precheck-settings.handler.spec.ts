import { jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { UpdateAiPrecheckSettingsHandler } from './update-ai-precheck-settings.handler.js';
import { UpdateAiPrecheckSettingsCommand } from './update-ai-precheck-settings.command.js';
import { GetAiPrecheckSettingsHandler } from '../../queries/get-ai-precheck-settings/get-ai-precheck-settings.handler.js';
import { GetAiPrecheckSettingsQuery } from '../../queries/get-ai-precheck-settings/get-ai-precheck-settings.query.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SchoolType } from '../../../domain/value-objects/school-type.vo.js';
import { AiPrecheckSettings } from '../../../domain/value-objects/ai-precheck-settings.vo.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { FeatureNotEntitledException } from '../../../domain/exceptions/feature-not-entitled.exception.js';
import { InvalidAiPrecheckSettingsException } from '../../../domain/exceptions/invalid-ai-precheck-settings.exception.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';

const SCHOOL_ID = 'school-1';
const OWNER = 'owner-1';
const ADMIN = 'admin-1';
const TEACHER = 'teacher-1';

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

function makeRepo(row: School | null, saved: AiPrecheckSettings | null = AiPrecheckSettings.default()) {
  return {
    findById: jest.fn(() => Promise.resolve(row)),
    findAiPrecheckSettings: jest.fn(() => Promise.resolve(saved)),
    saveAiPrecheckSettings: jest.fn(() => Promise.resolve()),
  };
}

function makeHandler(row: School | null, entitled: boolean | Error = true) {
  const schools = makeRepo(row);
  const entitlements = {
    isEnabled: jest.fn(() =>
      entitled instanceof Error ? Promise.reject(entitled) : Promise.resolve(entitled),
    ),
  };
  return {
    handler: new UpdateAiPrecheckSettingsHandler(schools as never, entitlements as never),
    schools,
    entitlements,
  };
}

const command = (
  actorId: string,
  enabled = true,
  perExerciseLimit: number | null = 3,
  perLearnerMonthlyCredits: number | null = null,
) => new UpdateAiPrecheckSettingsCommand(SCHOOL_ID, actorId, enabled, perExerciseLimit, perLearnerMonthlyCredits);

describe('UpdateAiPrecheckSettingsHandler', () => {
  it('turns the checks on for a school whose plan has ai.practice', async () => {
    const { handler, schools, entitlements } = makeHandler(school());

    await expect(handler.execute(command(OWNER, true, 5, 200))).resolves.toEqual({
      enabled: true,
      perExerciseLimit: 5,
      perLearnerMonthlyCredits: 200,
    });
    expect(entitlements.isEnabled).toHaveBeenCalledWith(SCHOOL_ID, 'ai.practice');
    expect(schools.saveAiPrecheckSettings).toHaveBeenCalledWith(
      SCHOOL_ID,
      expect.objectContaining({ enabled: true, perExerciseLimit: 5, perLearnerMonthlyCredits: 200 }),
    );
  });

  it('lets an administrator set no limits at all: the pool still holds', async () => {
    const { handler } = makeHandler(school());

    await expect(handler.execute(command(ADMIN, true, null, null))).resolves.toEqual({
      enabled: true,
      perExerciseLimit: null,
      perLearnerMonthlyCredits: null,
    });
  });

  it('refuses a teacher', async () => {
    const { handler, schools } = makeHandler(school());

    await expect(handler.execute(command(TEACHER))).rejects.toBeInstanceOf(ForbiddenOperationException);
    expect(schools.saveAiPrecheckSettings).not.toHaveBeenCalled();
  });

  it.each([
    ['zero checks per exercise', 0, null],
    ['a fraction of a check', 2.5, null],
    ['more checks than ai-service counts', 1001, null],
    ['zero credits a month', 3, 0],
    ['negative credits', 3, -10],
  ])('refuses %s, before asking the plan', async (_label, perExercise, monthly) => {
    const { handler, schools, entitlements } = makeHandler(school());

    await expect(handler.execute(command(OWNER, true, perExercise, monthly))).rejects.toBeInstanceOf(
      InvalidAiPrecheckSettingsException,
    );
    expect(entitlements.isEnabled).not.toHaveBeenCalled();
    expect(schools.saveAiPrecheckSettings).not.toHaveBeenCalled();
  });

  /** The server refuses, whatever the web shows. */
  it('refuses to turn the checks on when the plan lacks the key', async () => {
    const { handler, schools } = makeHandler(school(), false);

    await expect(handler.execute(command(OWNER))).rejects.toBeInstanceOf(FeatureNotEntitledException);
    expect(schools.saveAiPrecheckSettings).not.toHaveBeenCalled();
  });

  it('always lets a school turn them off and keep its limits, without asking the plan', async () => {
    const { handler, schools, entitlements } = makeHandler(school(), false);

    await expect(handler.execute(command(OWNER, false, 7, 50))).resolves.toEqual({
      enabled: false,
      perExerciseLimit: 7,
      perLearnerMonthlyCredits: 50,
    });
    expect(entitlements.isEnabled).not.toHaveBeenCalled();
    expect(schools.saveAiPrecheckSettings).toHaveBeenCalled();
  });

  it('saves nothing when the plan cannot be confirmed', async () => {
    const { handler, schools } = makeHandler(school(), new ServiceUnavailableException());

    await expect(handler.execute(command(OWNER))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(schools.saveAiPrecheckSettings).not.toHaveBeenCalled();
  });

  it('reports a missing school as missing', async () => {
    const { handler } = makeHandler(null);

    await expect(handler.execute(command(OWNER))).rejects.toBeInstanceOf(SchoolNotFoundException);
  });
});

describe('GetAiPrecheckSettingsHandler', () => {
  it('answers a new school’s default: off, 3 per exercise, no monthly limit', async () => {
    const handler = new GetAiPrecheckSettingsHandler(makeRepo(school()) as never);

    await expect(handler.execute(new GetAiPrecheckSettingsQuery(SCHOOL_ID))).resolves.toEqual({
      enabled: false,
      perExerciseLimit: 3,
      perLearnerMonthlyCredits: null,
    });
  });

  it('answers the saved settings as they are', async () => {
    const saved = AiPrecheckSettings.rehydrate({ enabled: true, perExerciseLimit: null, perLearnerMonthlyCredits: 120 });
    const handler = new GetAiPrecheckSettingsHandler(makeRepo(school(), saved) as never);

    await expect(handler.execute(new GetAiPrecheckSettingsQuery(SCHOOL_ID))).resolves.toEqual({
      enabled: true,
      perExerciseLimit: null,
      perLearnerMonthlyCredits: 120,
    });
  });

  it('reports a missing school as missing', async () => {
    const handler = new GetAiPrecheckSettingsHandler(makeRepo(null, null) as never);

    await expect(handler.execute(new GetAiPrecheckSettingsQuery(SCHOOL_ID))).rejects.toBeInstanceOf(
      SchoolNotFoundException,
    );
  });
});
