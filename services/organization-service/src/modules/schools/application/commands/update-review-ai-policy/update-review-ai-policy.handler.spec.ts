import { jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { UpdateReviewAiPolicyHandler } from './update-review-ai-policy.handler.js';
import { UpdateReviewAiPolicyCommand } from './update-review-ai-policy.command.js';
import { GetReviewAiPolicyHandler } from '../../queries/get-review-ai-policy/get-review-ai-policy.handler.js';
import { GetReviewAiPolicyQuery } from '../../queries/get-review-ai-policy/get-review-ai-policy.query.js';
import { UpdateReviewSettingsHandler } from '../update-review-settings/update-review-settings.handler.js';
import { UpdateReviewSettingsCommand } from '../update-review-settings/update-review-settings.command.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SchoolType } from '../../../domain/value-objects/school-type.vo.js';
import { ReviewSettings } from '../../../domain/value-objects/review-settings.vo.js';
import {
  ReviewAiPolicy,
  type ReviewAiMode,
} from '../../../domain/value-objects/review-ai-policy.vo.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { FeatureNotEntitledException } from '../../../domain/exceptions/feature-not-entitled.exception.js';
import { InvalidReviewSettingsException } from '../../../domain/exceptions/invalid-review-settings.exception.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';

const SCHOOL_ID = 'school-1';
const OWNER = 'owner-1';
const ADMIN = 'admin-1';
const TEACHER = 'teacher-1';

function school(props: { settings?: ReviewSettings; policy?: ReviewAiPolicy } = {}): School {
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
    reviewSettings: props.settings,
    reviewAiPolicy: props.policy,
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

function makeHandler(row: School | null, entitled: boolean | Error = true) {
  const schools = {
    findById: jest.fn(() => Promise.resolve(row)),
    saveReviewAiPolicy: jest.fn(() => Promise.resolve()),
    saveReviewSettings: jest.fn(() => Promise.resolve()),
  };
  const entitlements = {
    isEnabled: jest.fn(() =>
      entitled instanceof Error ? Promise.reject(entitled) : Promise.resolve(entitled),
    ),
  };
  return {
    handler: new UpdateReviewAiPolicyHandler(schools as never, entitlements as never),
    schools,
    entitlements,
  };
}

const command = (actorId: string, mode: ReviewAiMode = 'ai_then_teacher', hours = 168, percent = 15) =>
  new UpdateReviewAiPolicyCommand(SCHOOL_ID, actorId, mode, hours, percent);

describe('UpdateReviewAiPolicyHandler', () => {
  it('turns a model on for a school whose plan has the key', async () => {
    const { handler, schools, entitlements } = makeHandler(school());

    await expect(handler.execute(command(OWNER))).resolves.toEqual({
      mode: 'ai_then_teacher',
      autoAcceptAfterHours: 168,
      samplePercent: 15,
    });
    expect(entitlements.isEnabled).toHaveBeenCalledWith(SCHOOL_ID, 'school.review_ai_policy');
    expect(schools.saveReviewAiPolicy).toHaveBeenCalledWith(
      SCHOOL_ID,
      expect.objectContaining({ mode: 'ai_then_teacher' }),
    );
  });

  it('lets an administrator set it, and refuses a teacher', async () => {
    await expect(makeHandler(school()).handler.execute(command(ADMIN, 'ai_with_sampling'))).resolves.toMatchObject({
      mode: 'ai_with_sampling',
    });

    const { handler, schools } = makeHandler(school());
    await expect(handler.execute(command(TEACHER))).rejects.toBeInstanceOf(ForbiddenOperationException);
    expect(schools.saveReviewAiPolicy).not.toHaveBeenCalled();
  });

  /** R7: the server refuses, whatever the web shows. */
  it('refuses a mode with a model when the plan lacks the key', async () => {
    const { handler, schools } = makeHandler(school(), false);

    await expect(handler.execute(command(OWNER))).rejects.toBeInstanceOf(FeatureNotEntitledException);
    expect(schools.saveReviewAiPolicy).not.toHaveBeenCalled();
  });

  it('always lets a school go back to the teacher alone, without asking the plan', async () => {
    const { handler, schools, entitlements } = makeHandler(school(), false);

    await expect(handler.execute(command(OWNER, 'teacher_only', 48, 0))).resolves.toMatchObject({
      mode: 'teacher_only',
    });
    expect(entitlements.isEnabled).not.toHaveBeenCalled();
    expect(schools.saveReviewAiPolicy).toHaveBeenCalled();
  });

  it('saves nothing when the plan cannot be confirmed', async () => {
    const { handler, schools } = makeHandler(school(), new ServiceUnavailableException());

    await expect(handler.execute(command(OWNER))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(schools.saveReviewAiPolicy).not.toHaveBeenCalled();
  });

  /** Q2-A: the administrator's warning comes before the model's verdict counts by itself. */
  it('refuses an auto-accept earlier than the escalation in a mode with a model', async () => {
    const { handler, entitlements } = makeHandler(school());

    // Default escalation is 72 h.
    await expect(handler.execute(command(OWNER, 'ai_then_teacher', 48))).rejects.toBeInstanceOf(
      InvalidReviewSettingsException,
    );
    expect(entitlements.isEnabled).not.toHaveBeenCalled();
    await expect(handler.execute(command(OWNER, 'ai_then_teacher', 72))).resolves.toMatchObject({
      autoAcceptAfterHours: 72,
    });
  });

  it('keeps any hours while the teacher answers alone', async () => {
    const { handler } = makeHandler(school());

    await expect(handler.execute(command(OWNER, 'teacher_only', 24))).resolves.toMatchObject({
      autoAcceptAfterHours: 24,
    });
  });

  it('refuses hours outside a month and a share outside 0–100', async () => {
    const { handler } = makeHandler(school());

    await expect(handler.execute(command(OWNER, 'ai_then_teacher', 721))).rejects.toBeInstanceOf(
      InvalidReviewSettingsException,
    );
    await expect(handler.execute(command(OWNER, 'ai_with_sampling', 168, 101))).rejects.toBeInstanceOf(
      InvalidReviewSettingsException,
    );
    await expect(handler.execute(command(OWNER, 'ai_with_sampling', 168, 12.5))).rejects.toBeInstanceOf(
      InvalidReviewSettingsException,
    );
  });

  it('reports a missing school as missing', async () => {
    const { handler } = makeHandler(null);

    await expect(handler.execute(command(OWNER))).rejects.toBeInstanceOf(SchoolNotFoundException);
  });
});

describe('UpdateReviewSettingsHandler with a model answering first', () => {
  /** The same order checked from the other side: an escalation moved past the auto-accept. */
  it('refuses an escalation later than the auto-accept', async () => {
    const policy = ReviewAiPolicy.rehydrate({ mode: 'ai_then_teacher', autoAcceptAfterHours: 96, samplePercent: 15 });
    const schools = {
      findById: jest.fn(() => Promise.resolve(school({ policy }))),
      saveReviewSettings: jest.fn(() => Promise.resolve()),
    };
    const handler = new UpdateReviewSettingsHandler(schools as never);

    await expect(
      handler.execute(new UpdateReviewSettingsCommand(SCHOOL_ID, OWNER, 48, 120, 'school_admins')),
    ).rejects.toBeInstanceOf(InvalidReviewSettingsException);
    expect(schools.saveReviewSettings).not.toHaveBeenCalled();
    await expect(
      handler.execute(new UpdateReviewSettingsCommand(SCHOOL_ID, OWNER, 48, 96, 'school_admins')),
    ).resolves.toMatchObject({ escalateAfterHours: 96 });
  });
});

describe('GetReviewAiPolicyHandler', () => {
  it('answers with the saved policy', async () => {
    const policy = ReviewAiPolicy.rehydrate({ mode: 'ai_with_sampling', autoAcceptAfterHours: 72, samplePercent: 30 });
    const handler = new GetReviewAiPolicyHandler({
      findById: jest.fn(() => Promise.resolve(school({ policy }))),
    } as never);

    await expect(handler.execute(new GetReviewAiPolicyQuery(SCHOOL_ID))).resolves.toEqual({
      mode: 'ai_with_sampling',
      autoAcceptAfterHours: 72,
      samplePercent: 30,
    });
  });

  /** A school from before plan 80 answers through its teachers, with the default week. */
  it('falls back to the teacher alone for a row that predates the columns', async () => {
    const handler = new GetReviewAiPolicyHandler({
      findById: jest.fn(() => Promise.resolve(school())),
    } as never);

    await expect(handler.execute(new GetReviewAiPolicyQuery(SCHOOL_ID))).resolves.toEqual({
      mode: 'teacher_only',
      autoAcceptAfterHours: 168,
      samplePercent: 15,
    });
  });
});
